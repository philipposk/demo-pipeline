// Quick visual QA without a full render: bundle once, render a few frames as stills, tile them into one sheet.
// Usage: node scripts/stills.mjs <tag> <theme> <frame|scene@local> ...   e.g. acme dark hook@60 add@110 300
//   "scene@local" is a frame inside that scene (scene-local), a bare number is a global frame.
// Output: out/stills/<tag>-<theme>.jpg (3 columns) plus the single frames next to it.
import {readFileSync, mkdirSync, rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import {findBrowser} from './browser.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [tag, theme = 'light', ...specs] = process.argv.slice(2);
const tl = JSON.parse(readFileSync(join(ROOT, 'src/timelines', `${tag}.json`), 'utf8'));
const PRODUCTS = JSON.parse(readFileSync(join(ROOT, 'src/products.json'), 'utf8'));
const product = Object.keys(PRODUCTS).find((p) => PRODUCTS[p].scripts.includes(tl.script));
if (!product) throw new Error(`timeline "${tag}" uses script "${tl.script}", which no product in src/products.json lists`);
const frameOf = (s) => {
  if (!s.includes('@')) return Number(s);
  const [id, local] = s.split('@');
  const sc = tl.scenes.find((x) => x.id === id);
  if (!sc) throw new Error(`no scene "${id}" in ${tag}`);
  return sc.from + Number(local);
};
const frames = (specs.length ? specs : tl.scenes.map((s) => `${s.id}@${s.length - tl.xf - 4}`)).map((s) => [s, frameOf(s)]);

const dir = join(ROOT, 'out/stills', `${tag}-${theme}${process.env.VERTICAL ? '-vertical' : ''}`);
rmSync(dir, {recursive: true, force: true});
mkdirSync(dir, {recursive: true});
const serveUrl = await bundle({entryPoint: join(ROOT, 'src/index.ts')});
// Same browser as remotion.config.ts (undefined = Remotion downloads its own).
const browserExecutable = findBrowser();
// SILENT=1 shows the silent cut, VERTICAL=1 the phone cut, NO_CAPTIONS=1 leaves its word captions out (posters)
const vertical = Boolean(process.env.VERTICAL);
const inputProps = {tag, theme, music: null, voiceover: !process.env.SILENT, format: vertical ? 'vertical' : 'landscape',
  captions: !process.env.NO_CAPTIONS};
const composition = await selectComposition({serveUrl, id: `${product}-${tag}${vertical ? '-vertical' : ''}`, inputProps, browserExecutable});
for (const [i, [spec, frame]] of frames.entries()) {
  const output = join(dir, `${String(i).padStart(2, '0')}.jpg`);
  await renderStill({serveUrl, composition, frame, output, inputProps, imageFormat: 'jpeg', jpegQuality: 90, browserExecutable,
    chromiumOptions: {}, logLevel: 'error'});
  console.log(`${spec} -> frame ${frame}`);
}
const out = join(ROOT, 'out/stills', `${tag}-${theme}${vertical ? '-vertical' : ''}.jpg`);
// COLS=n tiles n frames per row (default 3)
const cols = Number(process.env.COLS || 3);
const rows = Math.ceil(frames.length / cols);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(dir, '%02d.jpg'), '-vf', `scale=${vertical ? '360:640' : '640:360'},tile=${cols}x${rows}:padding=4:color=gray`, '-frames:v', '1', out]);
console.log(out);
