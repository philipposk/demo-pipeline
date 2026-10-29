// Render variants + a QA contact sheet for each.
// Usage: node scripts/render.mjs <tag>:<theme>:<music>[:silent][:vertical] ...   e.g. acme:light acme:dark:my-track acme:dark:none:vertical acme:light::silent
//   <theme>  light | dark (default light)
//   <music>  a file name (without .mp3) from public/music/, or "none". Empty = the product's "music" in src/products.json,
//            and if that is null (or the file is missing) the video has no music.
//   :silent  no voice; each line's "caption" is shown as a title instead
//   STRICT_MOTION=1 makes the freeze check (below) exit with an error instead of a warning
//   LOUDNORM=<LUFS> normalises the finished file's sound to that loudness, video copied (YouTube: -14; renders come
//            out quieter, about -26 dB mean). Off by default.
//   CONCURRENCY=<n> and OTV_CACHE=<bytes> are passed to Remotion (CONCURRENCY=1 OTV_CACHE=400000000 when memory is short).
//            A render that runs out of memory ("Failed to fetch", "Could not extract frame") is tried once more by itself
//            with CONCURRENCY=1 OTV_CACHE=300000000.
//   SCALE=<n> renders larger (Remotion --scale): SCALE=1.3333 makes a 1440p master, which YouTube serves with a better
//            codec, so UI text stays sharp.
//   :vertical renders the 1080x1920 phone cut (products with "vertical": true in src/products.json)
// The product (composition id prefix and file name) comes from the timeline's "script" via src/products.json.
import {existsSync, readFileSync, renameSync} from 'node:fs';
import {execFileSync, spawnSync} from 'node:child_process';
import {basename, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PRODUCTS = JSON.parse(readFileSync(join(ROOT, 'src/products.json'), 'utf8'));
const STRICT = process.env.STRICT_MOTION === '1';
const FREEZE_MIN = 0.5; // seconds of identical frames that count as dead air
const FREEZE_IGNORE_END = 0.6; // a still end card is fine

// Dead-air check: ffmpeg freezedetect over the render; returns frozen ranges longer than FREEZE_MIN (the last FREEZE_IGNORE_END s ignored).
const frozenRanges = (file) => {
  const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-map', '0:v:0', '-vf', `freezedetect=n=0.003:d=${FREEZE_MIN}`, '-f', 'null', '-'], {encoding: 'utf8'});
  const out = [];
  let start = null;
  for (const l of r.stderr.split('\n')) {
    const a = l.match(/freeze_start: ([\d.]+)/);
    const b = l.match(/freeze_end: ([\d.]+)/);
    if (a) start = Number(a[1]);
    if (b && start != null) {
      // ffmpeg reports a long freeze in chunks; join chunks that touch
      const last = out.at(-1);
      if (last && start - last[1] < 0.05) last[1] = Number(b[1]);
      else out.push([start, Number(b[1])]);
      start = null;
    }
  }
  if (start != null) {
    const last = out.at(-1);
    if (last && start - last[1] < 0.05) last[1] = dur;
    else out.push([start, dur]);
  }
  return out.map(([s, e]) => [s, Math.min(e, dur - FREEZE_IGNORE_END)]).filter(([s, e]) => e - s > FREEZE_MIN);
};

// Normalise the sound of a finished render in place (the picture is copied, not re-encoded). A cut without sound is left alone.
function loudnorm(file, lufs) {
  if (!(lufs <= -5 && lufs >= -40)) throw new Error(`LOUDNORM must be a loudness in LUFS such as -14, not "${process.env.LOUDNORM}"`);
  const hasAudio = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file]).toString().trim();
  if (!hasAudio) return console.log(`${basename(file)}: no sound, loudness left alone`);
  const tmp = file.replace(/\.mp4$/, '.loudnorm.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-map', '0', '-c:v', 'copy', '-af', `loudnorm=I=${lufs}:TP=-1.5:LRA=11`,
    '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', tmp]);
  renameSync(tmp, file);
  console.log(`${basename(file)}: sound normalised to ${lufs} LUFS`);
}

const OUT_OF_MEMORY = /Failed to fetch|Could not extract frame|disk space is low/i;
if (process.env.SCALE && !(Number(process.env.SCALE) > 0.25 && Number(process.env.SCALE) <= 2)) throw new Error(`SCALE must be a number such as 1.3333, not "${process.env.SCALE}"`);

const specs = process.argv.slice(2);
if (!specs.length) throw new Error('usage: node scripts/render.mjs <tag>:<theme>:<music>[:silent][:vertical] ...');

for (const spec of specs) {
  const [tag, theme = 'light', musicKey, ...flags] = spec.split(':');
  const tlFile = join(ROOT, 'src/timelines', `${tag}.json`);
  if (!existsSync(tlFile)) throw new Error(`no timeline "${tag}": run node scripts/voice.mjs --script=<name> --tag=${tag} first`);
  const tl = JSON.parse(readFileSync(tlFile, 'utf8'));
  const product = Object.keys(PRODUCTS).find((p) => PRODUCTS[p].scripts.includes(tl.script));
  if (!product) throw new Error(`timeline "${tag}" uses script "${tl.script}", which no product in src/products.json lists`);
  if (theme !== 'light' && theme !== 'dark') throw new Error(`unknown theme "${theme}" (light | dark)`);
  // music: explicit key, else the product's default; null = no music
  let music = null;
  let m = 'nomusic';
  const wanted = musicKey === 'none' ? null : musicKey ? `music/${musicKey}.mp3` : PRODUCTS[product].music;
  if (wanted) {
    if (existsSync(join(ROOT, 'public', wanted))) {
      music = wanted;
      m = basename(wanted, '.mp3');
    } else if (musicKey) {
      throw new Error(`music file public/${wanted} not found (see README, "Music"); use "none" to render without`);
    } else {
      console.warn(`note: default music public/${wanted} not found, rendering without music`);
    }
  }
  const voiceover = !flags.includes('silent');
  const vertical = flags.includes('vertical');
  if (vertical && !PRODUCTS[product].vertical) throw new Error(`${product} has no vertical cut (set "vertical": true in src/products.json once it does)`);
  const base = product.toLowerCase();
  const name = `${tag.startsWith(base) ? tag : `${base}-${tag}`}-${theme}-${m}${voiceover ? '' : '-silent'}${vertical ? '-vertical' : ''}`;
  const t0 = Date.now();
  const remotion = (concurrency, cache) => {
    const r = spawnSync('npx', ['remotion', 'render', 'src/index.ts', `${product}-${tag}${vertical ? '-vertical' : ''}`, `out/${name}.mp4`,
      `--props=${JSON.stringify({tag, theme, music, voiceover, format: vertical ? 'vertical' : 'landscape'})}`, '--log=error',
      // For a machine short of memory or disk (long real-app captures): CONCURRENCY=1 OTV_CACHE=400000000
      ...(concurrency ? [`--concurrency=${concurrency}`] : []),
      ...(cache ? [`--offthreadvideo-cache-size-in-bytes=${cache}`] : []),
      ...(process.env.SCALE ? [`--scale=${Number(process.env.SCALE)}`] : [])],
    {stdio: ['inherit', 'inherit', 'pipe'], cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
    if (r.stderr) process.stderr.write(r.stderr);
    return r;
  };
  let r = remotion(process.env.CONCURRENCY, process.env.OTV_CACHE);
  // Big recordings in several panes, or 1080p takes, ran out of memory at concurrency 2: one more try, one frame at a time.
  if (r.status !== 0 && OUT_OF_MEMORY.test(r.stderr ?? '') && process.env.CONCURRENCY !== '1') {
    console.warn(`${name}.mp4: ran out of memory, rendering again one frame at a time (CONCURRENCY=1 OTV_CACHE=300000000)`);
    r = remotion('1', '300000000');
  }
  if (r.status !== 0) throw new Error(`remotion render failed for ${spec}${OUT_OF_MEMORY.test(r.stderr ?? '') ? ' (out of memory or disk: close other apps, free disk space, render one at a time)' : ''}`);
  console.log(`${name}.mp4 rendered in ${Math.round((Date.now() - t0) / 1000)} s`);
  const frozen = frozenRanges(join(ROOT, 'out', `${name}.mp4`));
  if (frozen.length) {
    const msg = `${name}.mp4 has dead air (frozen > ${FREEZE_MIN} s): ${frozen.map(([a, b]) => `${a.toFixed(2)}-${b.toFixed(2)} s (${(b - a).toFixed(1)} s)`).join(', ')}. ` +
      'Cut minSec/holdSec in the script or add motion to those moments (README: "No dead air").';
    if (STRICT) throw new Error(msg);
    console.warn(`WARNING: ${msg}`);
  } else console.log(`${name}.mp4: no frozen stretch over ${FREEZE_MIN} s`);
  execFileSync('node', ['scripts/sheet.mjs', `out/${name}.mp4`, tag, `out/sheet-${name}.jpg`], {stdio: 'inherit', cwd: ROOT});
  if (process.env.LOUDNORM) loudnorm(join(ROOT, 'out', `${name}.mp4`), Number(process.env.LOUDNORM));
}
