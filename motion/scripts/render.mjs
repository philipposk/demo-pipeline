// Render variants + a QA contact sheet for each.
// Usage: node scripts/render.mjs <tag>:<theme>:<music>[:silent][:vertical] ...   e.g. acme:light acme:dark:my-track acme:dark:none:vertical acme:light::silent
//   <theme>  light | dark (default light)
//   <music>  a file name (without .mp3) from public/music/, or "none". Empty = the product's "music" in src/products.json,
//            and if that is null (or the file is missing) the video has no music.
//   :silent  no voice; each line's "caption" is shown as a title instead
//   :vertical renders the 1080x1920 phone cut (products with "vertical": true in src/products.json)
// The product (composition id prefix and file name) comes from the timeline's "script" via src/products.json.
import {existsSync, readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {basename, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PRODUCTS = JSON.parse(readFileSync(join(ROOT, 'src/products.json'), 'utf8'));
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
  execFileSync('npx', ['remotion', 'render', 'src/index.ts', `${product}-${tag}${vertical ? '-vertical' : ''}`, `out/${name}.mp4`,
    `--props=${JSON.stringify({tag, theme, music, voiceover, format: vertical ? 'vertical' : 'landscape'})}`, '--log=error'],
    {stdio: 'inherit', cwd: ROOT});
  console.log(`${name}.mp4 rendered in ${Math.round((Date.now() - t0) / 1000)} s`);
  execFileSync('node', ['scripts/sheet.mjs', `out/${name}.mp4`, tag, `out/sheet-${name}.jpg`], {stdio: 'inherit', cwd: ROOT});
}
