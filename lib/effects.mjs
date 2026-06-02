// Mode-2 "cinematic" effects layer — operates on the recorded webm without the
// app's cooperation. Per scene: trim → gentle push-in zoom toward the click
// point (zoompan) → convert to target aspect (landscape / portrait / square /
// 4:5) → logo watermark. Then prepend intro card, append outro card, stitch
// with hard cuts, mux narration + card silence, optionally burn subtitles.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';

const exec = promisify(execFile);
const FONT = '/System/Library/Fonts/Helvetica.ttc';

async function ff(args) {
  await exec('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
}

/** Aspect presets → output dimensions. Source recording is always 1920x1080. */
export const FORMATS = {
  landscape: { w: 1920, h: 1080 },
  portrait: { w: 1080, h: 1920 },
  square: { w: 1080, h: 1080 },
  '4:5': { w: 1080, h: 1350 },
};

const even = (n) => Math.max(2, Math.round(n / 2) * 2);

/**
 * zoompan push-in toward (cx,cy), 1 → 1+zmax. crop's w/h evaluate only at init
 * on this ffmpeg build, so we use zoompan (evaluates per output frame). d=1
 * keeps duration 1:1. Operates in SOURCE space (srcW×srcH).
 */
function zoomPan({ srcW, srcH, dur, fps, zmax, cx, cy }) {
  const N = Math.max(2, Math.round(dur * fps));
  const p = `(on/${N - 1})`;
  const smooth = `(${p}*${p}*(3-2*${p}))`;
  const z = `min(1+${zmax}*${smooth},${(1 + zmax).toFixed(4)})`;
  const x = `${cx}-(iw/zoom)/2`;
  const y = `${cy}-(ih/zoom)/2`;
  return `zoompan=z='${z}':x='${x}':y='${y}':d=1:s=${srcW}x${srcH}:fps=${fps}`;
}

/**
 * Convert a [label] of srcW×srcH to outW×outH. Returns { chain, out }.
 * strategy 'crop' = follow focus point (fills frame, may lose sides).
 * strategy 'blur' = fit whole frame, blurred copy fills the margins (no loss).
 */
function formatChain(inLabel, { srcW, srcH, outW, outH, strategy, cx }) {
  if (srcW === outW && srcH === outH) return { chain: '', out: inLabel };
  const out = `${inLabel}f`;
  if (strategy === 'crop') {
    const winW = even(srcH * (outW / outH)); // full-height window of target ratio
    const winH = srcH;
    const x = `clip(${Math.round(cx)}-${winW / 2},0,${srcW - winW})`;
    return {
      chain: `[${inLabel}]crop=${winW}:${winH}:x='${x}':y=0,scale=${outW}:${outH}:flags=lanczos,setsar=1[${out}];`,
      out,
    };
  }
  // blur fit (default)
  return {
    chain:
      `[${inLabel}]split=2[${inLabel}bg][${inLabel}fg];` +
      `[${inLabel}bg]scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH},boxblur=40:2,eq=brightness=-0.10[${inLabel}bb];` +
      `[${inLabel}fg]scale=${outW}:-2[${inLabel}fs];` +
      `[${inLabel}bb][${inLabel}fs]overlay=(W-w)/2:(H-h)/2,setsar=1[${out}];`,
    out,
  };
}

/** Trim one scene, apply zoom → format convert → logo, write normalized mp4. */
async function renderSegment(o) {
  const { webm, ss, dur, cx, cy, zmax, srcW, srcH, outW, outH, fps, strategy, logo, logoOpacity, out } = o;
  const zp = zoomPan({ srcW, srcH, dur, fps, zmax, cx, cy });
  const fmt = formatChain('z', { srcW, srcH, outW, outH, strategy, cx });

  let inputs, filter;
  if (logo) {
    inputs = ['-ss', String(ss), '-t', String(dur), '-i', webm, '-i', logo];
    filter =
      `[0:v]fps=${fps},setsar=1,${zp},setsar=1[z];` +
      fmt.chain +
      `[1:v]format=rgba,colorchannelmixer=aa=${logoOpacity}[lg];` +
      `[${fmt.out}][lg]overlay=W-w-40:H-h-40[v]`;
  } else {
    inputs = ['-ss', String(ss), '-t', String(dur), '-i', webm];
    filter = `[0:v]fps=${fps},setsar=1,${zp},setsar=1[z];` + fmt.chain + `[${fmt.out}]null[v]`;
  }
  await ff([
    ...inputs,
    '-filter_complex', filter,
    '-map', '[v]', '-an', '-r', String(fps),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '18',
    '-video_track_timescale', '30000', out,
  ]);
}

function dt(s) {
  return String(s).replace(/['":\\]/g, '').replace(/[×]/g, 'x');
}

/** Title/intro or outro card at output dimensions. */
async function renderCard(o) {
  const { W, H, fps, dur, bg, title, subtitle, logo, out, isOutro = false } = o;
  // Size off the smaller dimension so text stays readable + in-bounds in any aspect.
  const base = Math.min(W, H);
  const tF = Math.round(base / 16);
  const sF = Math.round(base / 34);
  const titleY = isOutro ? `${Math.round(H * 0.54)}` : `${Math.round(H * 0.5)}`;
  const subY = isOutro ? `${Math.round(H * 0.54) + tF + 24}` : `${Math.round(H * 0.5) + tF + 20}`;
  const fadeOut = (dur - 0.5).toFixed(2);
  let filter =
    `[0:v]drawtext=fontfile=${FONT}:text='${dt(title)}':fontsize=${tF}:fontcolor=white:x=(w-text_w)/2:y=${titleY}`;
  if (subtitle) {
    filter += `,drawtext=fontfile=${FONT}:text='${dt(subtitle)}':fontsize=${sF}:fontcolor=0x9AA0B5:x=(w-text_w)/2:y=${subY}`;
  }
  filter += `,fade=t=in:st=0:d=0.5,fade=t=out:st=${fadeOut}:d=0.5[c]`;

  if (logo) {
    const lw = Math.round(Math.min(W, 360) * 0.85);
    filter =
      `[1:v]scale=${lw}:-1[lg];` +
      filter.replace('[c]', '[txt]') +
      `;[txt][lg]overlay=(W-w)/2:(${titleY}-h-${Math.round(H * 0.06)})[c]`;
    await ff([
      '-f', 'lavfi', '-i', `color=c=${bg}:s=${W}x${H}:d=${dur}:r=${fps}`,
      '-i', logo, '-filter_complex', filter, '-map', '[c]', '-an',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(fps), '-video_track_timescale', '30000', out,
    ]);
  } else {
    await ff([
      '-f', 'lavfi', '-i', `color=c=${bg}:s=${W}x${H}:d=${dur}:r=${fps}`,
      '-filter_complex', filter, '-map', '[c]', '-an',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(fps), '-video_track_timescale', '30000', out,
    ]);
  }
}

async function silence(seconds, outPath) {
  await ff(['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-t', seconds.toFixed(3), outPath]);
}

async function concatVideos(paths, out, fps, workDir) {
  const list = path.join(workDir, 'vconcat.txt');
  writeFileSync(list, paths.map((p) => `file '${p}'`).join('\n'));
  await ff([
    '-f', 'concat', '-safe', '0', '-i', list,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(fps), '-video_track_timescale', '30000', out,
  ]);
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

/**
 * Main entry. Builds a cinematic mp4 from a recorded webm + timeline.
 * opts: { format, strategy, fps, zoom, logo, logoOpacity, subtitles, intro, outro }
 */
export async function buildCinematic(o) {
  const { webmPath, scenes, boundaries, clicks, bodyStart, narrationWav, outMp4, srtPath, opts } = o;
  const srcW = opts.srcW ?? 1920;
  const srcH = opts.srcH ?? 1080;
  const fmt = FORMATS[opts.format] || FORMATS.landscape;
  const outW = fmt.w;
  const outH = fmt.h;
  const strategy = opts.strategy || 'blur';
  const fps = opts.fps ?? 30;
  const zmax = opts.zoom ?? 0.12;
  const logo = opts.logo || null;
  const logoOpacity = opts.logoOpacity ?? 0.9;
  const workDir = path.join(path.dirname(outMp4), '.cine-work');
  mkdirSync(workDir, { recursive: true });

  // 1. Per-scene segments.
  const segPaths = [];
  let cum = bodyStart;
  for (let i = 0; i < scenes.length; i++) {
    const dur = scenes[i].sceneSec;
    const b = boundaries[i] || {};
    const hit = clicks.find((c) => c.t >= (b.tStart ?? -1) && c.t <= (b.tEnd ?? 1e9));
    const cx = hit ? hit.x : srcW / 2;
    const cy = hit ? hit.y : srcH / 2;
    const seg = path.join(workDir, `seg-${String(i).padStart(2, '0')}.mp4`);
    await renderSegment({
      webm: webmPath, ss: cum, dur, cx, cy, zmax,
      srcW, srcH, outW, outH, fps, strategy, logo, logoOpacity, out: seg,
    });
    segPaths.push(seg);
    cum += dur;
    process.stdout.write(`  segment ${i} ✓  (focus ${Math.round(cx)},${Math.round(cy)} · ${strategy})\n`);
  }

  // 2. Cards (at output dims).
  const introDur = opts.intro?.dur ?? 2.8;
  const outroDur = opts.outro?.dur ?? 3.2;
  const bg = opts.intro?.bg ?? '0x0A0A14';
  const introPath = path.join(workDir, 'intro.mp4');
  const outroPath = path.join(workDir, 'outro.mp4');
  await renderCard({ W: outW, H: outH, fps, dur: introDur, bg, title: opts.intro?.title ?? 'Demo', subtitle: opts.intro?.subtitle ?? '', logo, out: introPath });
  await renderCard({ W: outW, H: outH, fps, dur: outroDur, bg, title: opts.outro?.title ?? 'Thanks for watching', subtitle: opts.outro?.subtitle ?? 'demo.6x7.gr', logo, isOutro: true, out: outroPath });
  process.stdout.write('  cards ✓\n');

  // 3. Stitch video.
  const fullV = path.join(workDir, 'full_v.mp4');
  await concatVideos([introPath, ...segPaths, outroPath], fullV, fps, workDir);

  // 4. Audio with card silences.
  const fullA = path.join(workDir, 'full_a.wav');
  await buildAudio(narrationWav, introDur, outroDur, fullA, workDir);

  // 5. Subtitles. Always write the SRT (sidecar / players); for burn-in use a
  //    PlayRes-correct ASS so captions are pixel-accurate on any aspect ratio.
  const { buildSrt, buildAss } = await import('./subtitle.mjs');
  writeFileSync(srtPath, buildSrt(scenes, introDur, 0.2));

  // 6. Final mux (+ optional burn-in).
  const subMode = opts.subtitles || 'sidecar';
  const args = ['-i', fullV, '-i', fullA];
  if (subMode === 'burn') {
    const isTall = outH > outW;
    const assPath = srtPath.replace(/\.srt$/, '.ass');
    writeFileSync(assPath, buildAss(scenes, introDur, {
      W: outW, H: outH,
      fontSize: Math.round(outH / (isTall ? 26 : 40)),
      marginV: Math.round(outH * (isTall ? 0.14 : 0.06)),
      bold: isTall ? 1 : 0,
      outline: isTall ? 4 : 3,
    }));
    args.push('-vf', `ass=${assPath}`);
  }
  args.push(
    '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', '18',
    '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', outMp4,
  );
  await ff(args);

  if (subMode === 'sidecar') copyFileSync(srtPath, outMp4.replace(/\.mp4$/, '.srt'));
  process.stdout.write('  final mux ✓\n');
}
