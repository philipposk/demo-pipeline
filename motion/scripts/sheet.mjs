// Contact sheet for QA: one frame near the end of each scene, tiled.
// Usage: node scripts/sheet.mjs <video.mp4> <timeline-tag> <out.jpg> [cols=4]
import {readFileSync, mkdirSync, rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [video, tag, out, colsArg] = process.argv.slice(2);
const tl = JSON.parse(readFileSync(join(ROOT, 'src/timelines', `${tag}.json`), 'utf8'));
const tmp = join(ROOT, 'out', `.sheet-${tag}`);
rmSync(tmp, {recursive: true, force: true});
mkdirSync(tmp, {recursive: true});
const [w, h] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', video])
  .toString().trim().split(',').map(Number);
const size = h > w ? '270:480' : '480:270'; // vertical cuts get portrait tiles, six to a row
const cols = colsArg || (h > w ? '6' : '4');
tl.scenes.forEach((s, i) => {
  const t = ((s.from + s.length - tl.xf - 4) / tl.fps).toFixed(3);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', t, '-i', video, '-frames:v', '1', '-vf', `scale=${size}`, join(tmp, `${String(i).padStart(2, '0')}.jpg`)]);
});
const rows = Math.ceil(tl.scenes.length / Number(cols));
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(tmp, '%02d.jpg'), '-vf', `tile=${cols}x${rows}:padding=4:color=gray`, '-frames:v', '1', out]);
rmSync(tmp, {recursive: true, force: true});
console.log(out);
