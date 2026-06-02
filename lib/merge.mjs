// Concat per-scene narration WAVs with silence padding,
// then mux against the recorded video into a single MP4.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const exec = promisify(execFile);

/**
 * Build one continuous narration track timed to scene boundaries.
 *
 * Layout per scene i:
 *   [silence preroll] narration[i] [silence pad to scene end]
 *
 * Preroll = 0.2s lead-in so the click happens just before the voice.
 *
 * @param {Array<{wavPath:string, audioSec:number, sceneSec:number}>} scenes
 * @param {string} outWav
 */
export async function buildNarrationTrack(scenes, outWav, workDir) {
  mkdirSync(workDir, { recursive: true });
  const listPath = path.join(workDir, 'concat.txt');
  const lines = [];

  for (const [i, s] of scenes.entries()) {
    const preroll = 0.2;
    const tail = Math.max(s.sceneSec - s.audioSec - preroll, 0.05);

    const prerollPath = path.join(workDir, `pre-${i}.wav`);
    const tailPath = path.join(workDir, `tail-${i}.wav`);
    await silence(preroll, prerollPath);
    await silence(tail, tailPath);

    lines.push(`file '${prerollPath}'`);
    lines.push(`file '${s.wavPath}'`);
    lines.push(`file '${tailPath}'`);
  }

  writeFileSync(listPath, lines.join('\n'));
  // Re-encode here (not -c copy) — different scenes may have slightly different
  // codec params from different TTS backends. PCM out → ffmpeg picks aac on mux.
  await exec('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0',
    '-i', listPath,
    '-ar', '44100', '-ac', '2',
    outWav,
  ]);
}

async function silence(seconds, outPath) {
  await exec('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'lavfi',
    '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-t', String(seconds.toFixed(3)),
    outPath,
  ]);
}

/**
 * Mux video + audio into MP4. Re-encodes video to H.264.
 *
 * @param {object} cfg
 * @param {string} cfg.videoPath
 * @param {string} cfg.audioPath
 * @param {string} cfg.outMp4
 * @param {number} cfg.crf      - Lower = better quality. 17 ≈ near-lossless, 20 default-ish.
 * @param {string} cfg.preset   - x264 preset; 'slow' compresses better, 'medium' faster.
 */
export async function muxToMp4(cfg) {
  const { videoPath, audioPath, outMp4, crf = 17, preset = 'slow' } = cfg;
  await exec('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-i', videoPath,
    '-i', audioPath,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', preset,
    '-crf', String(crf),
    '-c:a', 'aac', '-b:a', '192k',
    '-shortest',
    '-movflags', '+faststart',
    outMp4,
  ]);
}
