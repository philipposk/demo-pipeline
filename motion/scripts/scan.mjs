// Find when something changes in a recording: the average colour of one box, sampled over time, and the moments it
// jumps (a browser bar appearing, a price flipping, a button turning red). Used to measure crops and sync on a real run.
//
// Usage: node scripts/scan.mjs <video.mp4> <x,y,w,h> [--fps=10] [--from=<s>] [--to=<s>] [--jump=40]
//   The box is in the video's own pixels. Prints "<second>  #rrggbb" for every jump bigger than --jump (0-441).
import {execFileSync} from 'node:child_process';

const [file, box] = process.argv.slice(2);
const opt = (n, d) => Number(process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d);
const m = /^(\d+),(\d+),(\d+),(\d+)$/.exec(box ?? '');
if (!file || !m) throw new Error('usage: node scripts/scan.mjs <video.mp4> <x,y,w,h> [--fps=10] [--from=s] [--to=s] [--jump=40]');
const [x, y, w, h] = m.slice(1).map(Number);
const fps = opt('fps', 10);
const from = opt('from', 0);
const to = opt('to', 0);
const jump = opt('jump', 40);
const raw = execFileSync('ffmpeg', ['-v', 'error', ...(from ? ['-ss', String(from)] : []), '-i', file, ...(to ? ['-t', String(to - from)] : []),
  '-vf', `fps=${fps},crop=${w}:${h}:${x}:${y},scale=1:1:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {maxBuffer: 1 << 28});
const hex = (r, g, b) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
let prev = null;
for (let i = 0; i + 2 < raw.length; i += 3) {
  const c = [raw[i], raw[i + 1], raw[i + 2]];
  const t = from + i / 3 / fps;
  if (!prev || Math.hypot(c[0] - prev[0], c[1] - prev[1], c[2] - prev[2]) > jump) console.log(`${t.toFixed(2).padStart(8)}  ${hex(...c)}`);
  prev = c;
}
