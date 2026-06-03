// Cinematic effects layer. Per scene: trim → snappy push-in zoom (zoompan,
// supersampled) → "Screen Studio" framing (rounded window + soft shadow on a
// gradient background) or plain aspect-fit → logo. Then cards, stitch, mux,
// optional burned subtitles.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';

const exec = promisify(execFile);
const FONT = '/System/Library/Fonts/Helvetica.ttc';

async function ff(args) {
  await exec('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
}

export const FORMATS = {
  landscape: { w: 1920, h: 1080 },
  portrait: { w: 1080, h: 1920 },
  square: { w: 1080, h: 1080 },
  '4:5': { w: 1080, h: 1350 },
};

const even = (n) => Math.max(2, Math.round(n / 2) * 2);

/**
 * Snappy push-in toward (cx,cy): ease-out that reaches most of the zoom in the
 * first ~40% then holds. Supersampled (SS×) so the slow tail doesn't shimmer.
 */
function zoomPan({ srcW, srcH, dur, fps, zmax, cx, cy }) {
  const N = Math.max(2, Math.round(dur * fps));
  const SS = 4;
  const p = `(on/${N - 1})`;
  const pp = `(min(1,${p}*2.5))`;          // hit full zoom at ~40% of the scene
  const ease = `(1-pow(1-${pp},3))`;       // ease-out cubic
  const z = `min(1+${zmax}*${ease},${(1 + zmax).toFixed(4)})`;
  const x = `${(cx * SS).toFixed(1)}-(iw/zoom)/2`;
  const y = `${(cy * SS).toFixed(1)}-(ih/zoom)/2`;
  return (
    `scale=${srcW * SS}:${srcH * SS}:flags=bicubic,` +
    `zoompan=z='${z}':x='${x}':y='${y}':d=1:s=${srcW}x${srcH}:fps=${fps}`
  );
}

/**
 * Generate the static framing assets once per render: gradient background, the
 * rounded-corner device mask (luma), and a soft drop shadow. Returns geometry.
 */
async function genFramingAssets(workDir, outW, outH, frame = {}) {
  const padFrac = frame.pad ?? 0.06;
  const maxW = outW * (1 - 2 * padFrac);
  const maxH = outH * (1 - 2 * padFrac);
  let devW = maxW, devH = (devW * 9) / 16;
  if (devH > maxH) { devH = maxH; devW = (devH * 16) / 9; }
  devW = even(devW); devH = even(devH);
  const R = Math.max(14, Math.round(Math.min(devW, devH) * 0.03));
  const [c0, c1] = frame.colors || ['0x1f7a5a', '0x14233f'];

  const bg = path.join(workDir, 'frame-bg.png');
  const mask = path.join(workDir, 'frame-mask.png');
  const shadow = path.join(workDir, 'frame-shadow.png');

  await ff(['-f', 'lavfi', '-i',
    `gradients=s=${outW}x${outH}:c0=${c0}:c1=${c1}:x0=0:y0=0:x1=${outW}:y1=${outH}:nb_colors=2`,
    '-frames:v', '1', bg]);

  const rr = (W, H) =>
    `geq=lum='if(gt(abs(X-${W}/2)\\,${W}/2-${R})*gt(abs(Y-${H}/2)\\,${H}/2-${R})\\,` +
    `if(lte(hypot(abs(X-${W}/2)-(${W}/2-${R})\\,abs(Y-${H}/2)-(${H}/2-${R}))\\,${R})\\,255\\,0)\\,255)'`;

  await ff(['-f', 'lavfi', '-i', `color=black:s=${devW}x${devH}`,
    '-vf', `format=gray,${rr(devW, devH)}`, '-frames:v', '1', mask]);

  const sw = devW + 200, sh = devH + 200;
  await ff(['-i', mask, '-f', 'lavfi', '-i', `color=black:s=${sw}x${sh}`,
    '-filter_complex',
    `[0:v]pad=${sw}:${sh}:100:100:color=black[mp];[1:v]format=rgba[b];` +
    `[b][mp]alphamerge,boxblur=45:2,colorchannelmixer=aa=0.55[s]`,
    '-map', '[s]', '-frames:v', '1', shadow]);

  return { bg, mask, shadow, devW, devH, devX: Math.round((outW - devW) / 2), devY: Math.round((outH - devH) / 2) };
}

function formatChain(inLabel, { srcW, srcH, outW, outH, strategy, cx }) {
  if (srcW === outW && srcH === outH) return { chain: '', out: inLabel };
  const out = `${inLabel}f`;
  if (strategy === 'crop') {
    const winW = even(srcH * (outW / outH));
    const x = `clip(${Math.round(cx)}-${winW / 2},0,${srcW - winW})`;
    return { chain: `[${inLabel}]crop=${winW}:${srcH}:x='${x}':y=0,scale=${outW}:${outH}:flags=lanczos,setsar=1[${out}];`, out };
  }
  return {
    chain:
      `[${inLabel}]split=2[${inLabel}bg][${inLabel}fg];` +
      `[${inLabel}bg]scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH},boxblur=40:2,eq=brightness=-0.10[${inLabel}bb];` +
      `[${inLabel}fg]scale=${outW}:-2[${inLabel}fs];` +
      `[${inLabel}bb][${inLabel}fs]overlay=(W-w)/2:(H-h)/2,setsar=1[${out}];`,
    out,
  };
}

/** Trim one scene, zoom, frame (or aspect-fit), logo → normalized mp4. */
async function renderSegment(o) {
  const { webm, ss, dur, cx, cy, zmax, srcW, srcH, outW, outH, fps, strategy, logo, logoOpacity, out, fr } = o;
  const zp = zoomPan({ srcW, srcH, dur, fps, zmax, cx, cy });

  const inputs = ['-ss', String(ss), '-t', String(dur), '-i', webm];
  let filter;

  if (fr) {
    // Framed "Screen Studio" look. inputs: 0=webm 1=bg 2=shadow 3=mask [4=logo]
    inputs.push('-i', fr.bg, '-i', fr.shadow, '-i', fr.mask);
    const logoIdx = 4;
    if (logo) inputs.push('-i', logo);
    filter =
      `[0:v]fps=${fps},setsar=1,${zp},setsar=1,scale=${fr.devW}:${fr.devH},format=rgba[c];` +
      `[c][3:v]alphamerge[dev];` +
      `[1:v]format=rgba[bg];` +
      `[bg][2:v]overlay=${fr.devX - 100}:${fr.devY - 100 + 26}[b1];` +
      `[b1][dev]overlay=${fr.devX}:${fr.devY}[b2];`;
    filter += logo
      ? `[${logoIdx}:v]format=rgba,colorchannelmixer=aa=${logoOpacity}[lg];[b2][lg]overlay=W-w-40:H-h-40[v]`
      : `[b2]null[v]`;
  } else {
    const fmt = formatChain('z', { srcW, srcH, outW, outH, strategy, cx });
    if (logo) inputs.push('-i', logo);
    filter = `[0:v]fps=${fps},setsar=1,${zp},setsar=1[z];` + fmt.chain;
    filter += logo
      ? `[1:v]format=rgba,colorchannelmixer=aa=${logoOpacity}[lg];[${fmt.out}][lg]overlay=W-w-40:H-h-40[v]`
      : `[${fmt.out}]null[v]`;
  }

  await ff([
    ...inputs, '-filter_complex', filter, '-map', '[v]', '-an', '-r', String(fps),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '18',
    '-video_track_timescale', '30000', out,
  ]);
}

function dt(s) { return String(s).replace(/['":\\]/g, '').replace(/[×]/g, 'x'); }

/** Title/intro or outro card; uses the gradient bg image when framing. */
async function renderCard(o) {
  const { W, H, fps, dur, bg, bgImg, title, subtitle, logo, out, isOutro = false } = o;
  const base = Math.min(W, H);
  const tF = Math.round(base / 16);
  const sF = Math.round(base / 34);
  const titleY = isOutro ? `${Math.round(H * 0.54)}` : `${Math.round(H * 0.5)}`;
  const subY = isOutro ? `${Math.round(H * 0.54) + tF + 24}` : `${Math.round(H * 0.5) + tF + 20}`;
  const fadeOut = (dur - 0.5).toFixed(2);

  const inputs = bgImg
    ? ['-loop', '1', '-t', String(dur), '-i', bgImg]
    : ['-f', 'lavfi', '-i', `color=c=${bg}:s=${W}x${H}:d=${dur}:r=${fps}`];

  let filter =
    `[0:v]format=rgba,drawtext=fontfile=${FONT}:text='${dt(title)}':fontsize=${tF}:fontcolor=white:x=(w-text_w)/2:y=${titleY}`;
  if (subtitle) {
    filter += `,drawtext=fontfile=${FONT}:text='${dt(subtitle)}':fontsize=${sF}:fontcolor=0xcfe8df:x=(w-text_w)/2:y=${subY}`;
  }
  filter += `,fade=t=in:st=0:d=0.5,fade=t=out:st=${fadeOut}:d=0.5,format=yuv420p[c]`;

  if (logo) {
    const lw = Math.round(Math.min(W, 360) * 0.85);
    filter =
      `[1:v]scale=${lw}:-1[lg];` + filter.replace('[c]', '[txt]') +
      `;[txt][lg]overlay=(W-w)/2:(${titleY}-h-${Math.round(H * 0.06)})[c]`;
    await ff([...inputs, '-i', logo, '-filter_complex', filter, '-map', '[c]', '-an',
      '-r', String(fps), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-video_track_timescale', '30000', out]);
  } else {
    await ff([...inputs, '-filter_complex', filter, '-map', '[c]', '-an',
      '-r', String(fps), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-video_track_timescale', '30000', out]);
  }
}

async function silence(seconds, outPath) {
  await ff(['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-t', seconds.toFixed(3), outPath]);
}

async function concatVideos(paths, out, fps, workDir) {
  const list = path.join(workDir, 'vconcat.txt');
  writeFileSync(list, paths.map((p) => `file '${p}'`).join('\n'));
  await ff(['-f', 'concat', '-safe', '0', '-i', list,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(fps), '-video_track_timescale', '30000', out]);
}

async function buildAudio(narrationWav, introDur, outroDur, out, workDir) {
  const pre = path.join(workDir, 'a-pre.wav');
  const post = path.join(workDir, 'a-post.wav');
  await silence(introDur, pre);
  await silence(outroDur, post);
  const list = path.join(workDir, 'aconcat.txt');
  writeFileSync(list, [pre, narrationWav, post].map((p) => `file '${p}'`).join('\n'));
  await ff(['-f', 'concat', '-safe', '0', '-i', list, '-ar', '44100', '-ac', '2', out]);
}

export async function buildCinematic(o) {
  const { webmPath, scenes, boundaries, clicks, bodyStart, narrationWav, outMp4, srtPath, opts } = o;
  const srcW = opts.srcW ?? 1920;
  const srcH = opts.srcH ?? 1080;
  const fmt = FORMATS[opts.format] || FORMATS.landscape;
  const outW = fmt.w, outH = fmt.h;
  const strategy = opts.strategy || 'blur';
  const fps = opts.fps ?? 30;
  const zmax = opts.zoom ?? 0.16;
  const logo = opts.logo || null;
  const logoOpacity = opts.logoOpacity ?? 0.9;
  const framed = opts.frame !== false; // framing on by default
  const workDir = path.join(path.dirname(outMp4), '.cine-work');
  mkdirSync(workDir, { recursive: true });

  const fr = framed ? await genFramingAssets(workDir, outW, outH, opts.frameCfg || {}) : null;
  if (fr) process.stdout.write(`  framing: device ${fr.devW}x${fr.devH} on ${outW}x${outH} gradient\n`);

  // 1. Segments.
  const segPaths = [];
  let cum = bodyStart;
  for (let i = 0; i < scenes.length; i++) {
    const dur = scenes[i].sceneSec;
    const b = boundaries[i] || {};
    const hit = clicks.find((c) => c.t >= (b.tStart ?? -1) && c.t <= (b.tEnd ?? 1e9));
    const cx = hit ? hit.x : srcW / 2;
    const cy = hit ? hit.y : srcH / 2;
    const seg = path.join(workDir, `seg-${String(i).padStart(2, '0')}.mp4`);
    await renderSegment({ webm: webmPath, ss: cum, dur, cx, cy, zmax, srcW, srcH, outW, outH, fps, strategy, logo, logoOpacity, out: seg, fr });
    segPaths.push(seg);
    cum += dur;
    process.stdout.write(`  segment ${i} ✓\n`);
  }

  // 2. Cards (on the gradient bg when framing).
  const introDur = opts.intro?.dur ?? 2.8;
  const outroDur = opts.outro?.dur ?? 3.2;
  const bg = opts.intro?.bg ?? '0x0A0A14';
  const bgImg = fr ? fr.bg : null;
  const introPath = path.join(workDir, 'intro.mp4');
  const outroPath = path.join(workDir, 'outro.mp4');
  await renderCard({ W: outW, H: outH, fps, dur: introDur, bg, bgImg, title: opts.intro?.title ?? 'Demo', subtitle: opts.intro?.subtitle ?? '', logo, out: introPath });
  await renderCard({ W: outW, H: outH, fps, dur: outroDur, bg, bgImg, title: opts.outro?.title ?? 'Thanks for watching', subtitle: opts.outro?.subtitle ?? 'demo.6x7.gr', logo, isOutro: true, out: outroPath });
  process.stdout.write('  cards ✓\n');

  // 3. Stitch.
  const fullV = path.join(workDir, 'full_v.mp4');
  await concatVideos([introPath, ...segPaths, outroPath], fullV, fps, workDir);

  // 4. Audio.
  const fullA = path.join(workDir, 'full_a.wav');
  await buildAudio(narrationWav, introDur, outroDur, fullA, workDir);

  // 5. Subtitles.
  const { buildSrt, buildAss } = await import('./subtitle.mjs');
  writeFileSync(srtPath, buildSrt(scenes, introDur, 0.2));

  // 6. Mux (+ optional burn).
  const subMode = opts.subtitles || 'sidecar';
  const args = ['-i', fullV, '-i', fullA];
  if (subMode === 'burn') {
    const isTall = outH > outW;
    const assPath = srtPath.replace(/\.srt$/, '.ass');
    writeFileSync(assPath, buildAss(scenes, introDur, {
      W: outW, H: outH,
      fontSize: Math.round(outH / (isTall ? 26 : 40)),
      marginV: Math.round(outH * (isTall ? 0.14 : 0.06)),
      bold: isTall ? 1 : 0, outline: isTall ? 4 : 3,
    }));
    args.push('-vf', `ass=${assPath}`);
  }
  args.push('-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-preset', 'slow', '-crf', '18', '-c:a', 'aac', '-b:a', '192k',
    '-shortest', '-movflags', '+faststart', outMp4);
  await ff(args);

  if (subMode === 'sidecar') copyFileSync(srtPath, outMp4.replace(/\.mp4$/, '.srt'));
  process.stdout.write('  final mux ✓\n');
}
