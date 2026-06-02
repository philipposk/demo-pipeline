// Mode-2 "cinematic" effects layer — operates on the recorded webm without the
// app's cooperation. Per scene: trim → gentle push-in zoom toward the click
// point → logo watermark. Then prepend intro card, append outro card, stitch
// with hard cuts (keeps audio in sync), mux narration + card silence, and
// optionally burn subtitles.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';

const exec = promisify(execFile);
const FONT = '/System/Library/Fonts/Helvetica.ttc';

async function ff(args) {
  await exec('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
}

/**
 * Build a zoompan expression for a smooth push-in toward (cx,cy), 1 → 1+zmax.
 * crop's w/h evaluate only at init on this ffmpeg build, so we use zoompan
 * (purpose-built, evaluates per output frame). d=1 keeps duration 1:1.
 */
function zoomPan({ W, H, dur, fps, zmax, cx, cy }) {
  const N = Math.max(2, Math.round(dur * fps));
  const p = `(on/${N - 1})`;                       // 0 → 1 across the segment
  const smooth = `(${p}*${p}*(3-2*${p}))`;         // smoothstep easing
  const z = `min(1+${zmax}*${smooth},${(1 + zmax).toFixed(4)})`;
  // x,y = top-left of the zoom window in source coords; zoompan clamps to bounds.
  const x = `${cx}-(iw/zoom)/2`;
  const y = `${cy}-(ih/zoom)/2`;
  return `zoompan=z='${z}':x='${x}':y='${y}':d=1:s=${W}x${H}:fps=${fps}`;
}

/** Trim one scene from the webm, apply zoom + logo, write a normalized mp4. */
async function renderSegment(o) {
  const { webm, ss, dur, cx, cy, zmax, W, H, fps, logo, logoOpacity, out } = o;
  const zp = zoomPan({ W, H, dur, fps, zmax, cx, cy });
  let filter, inputs;
  if (logo) {
    inputs = ['-ss', String(ss), '-t', String(dur), '-i', webm, '-i', logo];
    filter =
      `[0:v]fps=${fps},setsar=1,${zp},setsar=1[z];` +
      `[1:v]format=rgba,colorchannelmixer=aa=${logoOpacity}[lg];` +
      `[z][lg]overlay=W-w-40:H-h-40[v]`;
  } else {
    inputs = ['-ss', String(ss), '-t', String(dur), '-i', webm];
    filter = `[0:v]fps=${fps},setsar=1,${zp},setsar=1[v]`;
  }
  await ff([
    ...inputs,
    '-filter_complex', filter,
    '-map', '[v]', '-an',
    '-r', String(fps),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '18',
    '-video_track_timescale', '30000',
    out,
  ]);
}

/** Drawtext-safe: strip characters that need escaping in ffmpeg drawtext. */
function dt(s) {
  return String(s).replace(/['":\\]/g, '').replace(/[×]/g, 'x');
}

/** Title/intro or outro card. */
async function renderCard(o) {
  const {
    W, H, fps, dur, bg, title, subtitle, logo, out, logoScale = 0.9, isOutro = false,
  } = o;
  const titleY = isOutro ? 'h/2+40' : 'h/2-10';
  const subY = isOutro ? 'h/2+110' : 'h/2+70';
  const fadeOut = (dur - 0.5).toFixed(2);
  let filter =
    `[0:v]drawtext=fontfile=${FONT}:text='${dt(title)}':fontsize=68:fontcolor=white:` +
    `x=(w-text_w)/2:y=${titleY}`;
  if (subtitle) {
    filter +=
      `,drawtext=fontfile=${FONT}:text='${dt(subtitle)}':fontsize=32:fontcolor=0x9AA0B5:` +
      `x=(w-text_w)/2:y=${subY}`;
  }
  filter += `,fade=t=in:st=0:d=0.5,fade=t=out:st=${fadeOut}:d=0.5[c]`;

  if (logo) {
    // Logo centered horizontally, ~30% down the frame (above the title).
    // NOTE: in overlay, W/H = main frame size, w/h = logo size.
    const lw = Math.round(300 * logoScale);
    filter =
      `[1:v]scale=${lw}:-1[lg];` +
      filter.replace('[c]', '[txt]') +
      `;[txt][lg]overlay=(W-w)/2:(H*0.30-h/2)[c]`;
    await ff([
      '-f', 'lavfi', '-i', `color=c=${bg}:s=${W}x${H}:d=${dur}:r=${fps}`,
      '-i', logo,
      '-filter_complex', filter,
      '-map', '[c]', '-an',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(fps),
      '-video_track_timescale', '30000',
      out,
    ]);
  } else {
    await ff([
      '-f', 'lavfi', '-i', `color=c=${bg}:s=${W}x${H}:d=${dur}:r=${fps}`,
      '-filter_complex', filter,
      '-map', '[c]', '-an',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(fps),
      '-video_track_timescale', '30000',
      out,
    ]);
  }
}

async function silence(seconds, outPath) {
  await ff([
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-t', seconds.toFixed(3), outPath,
  ]);
}

/** Concat a list of identically-encoded mp4s (video-only) via the demuxer. */
async function concatVideos(paths, out, fps, workDir) {
  const list = path.join(workDir, 'vconcat.txt');
  writeFileSync(list, paths.map((p) => `file '${p}'`).join('\n'));
  await ff([
    '-f', 'concat', '-safe', '0', '-i', list,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(fps),
    '-video_track_timescale', '30000',
    out,
  ]);
}

/** narration.wav wrapped with leading/trailing silence for the cards. */
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
 *
 * @param {object} o
 * @param {string} o.webmPath
 * @param {Array}  o.scenes      - enriched scenes (audioSec, sceneSec).
 * @param {Array}  o.boundaries  - [{i,tStart,tEnd}] from record().
 * @param {Array}  o.clicks      - [{t,x,y}] from record().
 * @param {number} o.bodyStart   - webm time (s) where scene 0 begins.
 * @param {string} o.narrationWav
 * @param {string} o.outMp4
 * @param {string} o.srtPath     - where to write the SRT.
 * @param {object} o.opts        - { W,H,fps,zoom,logo,logoOpacity,intro,outro,subtitles }
 */
export async function buildCinematic(o) {
  const {
    webmPath, scenes, boundaries, clicks, bodyStart,
    narrationWav, outMp4, srtPath, opts,
  } = o;
  const W = opts.W ?? 1920;
  const H = opts.H ?? 1080;
  const fps = opts.fps ?? 30;
  const zmax = opts.zoom ?? 0.12;
  const logo = opts.logo || null;
  const logoOpacity = opts.logoOpacity ?? 0.9;
  const workDir = path.join(path.dirname(outMp4), '.cine-work');
  mkdirSync(workDir, { recursive: true });

  // 1. Per-scene segments with zoom-to-click + logo.
  const segPaths = [];
  let cum = bodyStart;
  for (let i = 0; i < scenes.length; i++) {
    const dur = scenes[i].sceneSec;
    const b = boundaries[i] || {};
    const hit = clicks.find((c) => c.t >= (b.tStart ?? -1) && c.t <= (b.tEnd ?? 1e9));
    const cx = hit ? hit.x : W / 2;
    const cy = hit ? hit.y : H / 2;
    const seg = path.join(workDir, `seg-${String(i).padStart(2, '0')}.mp4`);
    await renderSegment({
      webm: webmPath, ss: cum, dur, cx, cy, zmax, W, H, fps, logo, logoOpacity, out: seg,
    });
    segPaths.push(seg);
    cum += dur;
    process.stdout.write(`  segment ${i} ✓  (zoom@${Math.round(cx)},${Math.round(cy)})\n`);
  }

  // 2. Intro + outro cards.
  const introDur = opts.intro?.dur ?? 2.8;
  const outroDur = opts.outro?.dur ?? 3.2;
  const bg = opts.intro?.bg ?? '0x0A0A14';
  const introPath = path.join(workDir, 'intro.mp4');
  const outroPath = path.join(workDir, 'outro.mp4');
  await renderCard({
    W, H, fps, dur: introDur, bg,
    title: opts.intro?.title ?? 'Demo',
    subtitle: opts.intro?.subtitle ?? '',
    logo, out: introPath,
  });
  await renderCard({
    W, H, fps, dur: outroDur, bg,
    title: opts.outro?.title ?? 'Thanks for watching',
    subtitle: opts.outro?.subtitle ?? 'demo.6x7.gr',
    logo, isOutro: true, out: outroPath,
  });
  process.stdout.write('  cards ✓\n');

  // 3. Stitch video (cards + segments, hard cuts).
  const fullV = path.join(workDir, 'full_v.mp4');
  await concatVideos([introPath, ...segPaths, outroPath], fullV, fps, workDir);

  // 4. Audio with card silences.
  const fullA = path.join(workDir, 'full_a.wav');
  await buildAudio(narrationWav, introDur, outroDur, fullA, workDir);

  // 5. Subtitles — built from known scene text + durations, offset by intro.
  const { buildSrt } = await import('./subtitle.mjs');
  writeFileSync(srtPath, buildSrt(scenes, introDur, 0.2));

  // 6. Final mux (+ optional burn-in).
  const subMode = opts.subtitles || 'sidecar'; // 'off' | 'sidecar' | 'burn'
  const args = ['-i', fullV, '-i', fullA];
  if (subMode === 'burn') {
    const style =
      "force_style='FontName=Helvetica,FontSize=20,PrimaryColour=&H00FFFFFF," +
      "OutlineColour=&H00101010,BorderStyle=1,Outline=2,Shadow=0,MarginV=46'";
    args.push('-vf', `subtitles=${srtPath}:${style}`);
  }
  args.push(
    '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', '18',
    '-c:a', 'aac', '-b:a', '192k',
    '-shortest', '-movflags', '+faststart',
    outMp4,
  );
  await ff(args);

  if (subMode === 'sidecar') {
    copyFileSync(srtPath, outMp4.replace(/\.mp4$/, '.srt'));
  }
  process.stdout.write('  final mux ✓\n');
}
