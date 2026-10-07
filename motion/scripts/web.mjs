// Web copy of a render (README §8): h264 + loudness-normalised AAC + faststart, plus a poster frame.
// Usage: node scripts/web.mjs <render.mp4> <out-base> <poster-seconds>   → <out-base>.mp4 and <out-base>.jpg
// Keeps the file under MAX_MB (default 10) by raising the CRF a step at a time.
import {execFileSync} from 'node:child_process';
import {statSync} from 'node:fs';

const [src, base, posterAt = '3'] = process.argv.slice(2);
if (!src || !base) throw new Error('usage: node scripts/web.mjs <render.mp4> <out-base> <poster-seconds>');
const maxBytes = Number(process.env.MAX_MB || 10) * 1e6;
const [w, h] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', src])
  .toString().trim().split(',').map(Number);
for (let crf = 24; crf <= 32; crf += 2) {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p',
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', `${base}.mp4`]);
  const size = statSync(`${base}.mp4`).size;
  console.log(`${base}.mp4  crf ${crf}  ${(size / 1e6).toFixed(1)} MB`);
  if (size <= maxBytes) break;
}
execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(posterAt), '-i', src, '-frames:v', '1', '-vf', `scale=${w > h ? '1280:720' : '720:1280'}`, '-q:v', '3', `${base}.jpg`]);
