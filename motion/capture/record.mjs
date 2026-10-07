// Screen capture of a real web app for how-to videos, as raw material for a Remotion composition.
//
// Unlike Playwright's recordVideo (VP8 at about 1 Mbps), this reads Chrome's screencast at full device resolution
// (--force-device-scale-factor), so text stays sharp when the composition zooms in. Every helper logs what it did with
// a timestamp (steps, cursor path, clicks, focus boxes, waits); the composition uses that log to cut, speed up waits,
// draw the cursor, zoom and highlight. Nothing here is product-specific: a take is a list of steps
// `{id, run: async (h) => {...}}` whose ids match the narration script's line ids.
//
//   const cap = await record({url, out: 'acme-add', steps, viewport, init});
//
// Output: public/capture/<out>.mp4 (30 fps, crf 14) and src/captures/<out>.json ({w, h, dpr, fps, duration, steps, events}).
import {chromium, devices} from 'playwright';
import {mkdirSync, rmSync, writeFileSync, readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

export async function record({url, out, steps, viewport = {width: 1440, height: 900}, dpr = 2, phone = false, init, ready, fps = 30}) {
  const tmp = join(ROOT, 'out', '.capture', out);
  rmSync(tmp, {recursive: true, force: true});
  mkdirSync(tmp, {recursive: true});
  const browser = await chromium.launch({args: [`--force-device-scale-factor=${dpr}`]});
  const ctx = await browser.newContext(phone
    ? {...devices['iPhone 13'], viewport, deviceScaleFactor: dpr}
    : {viewport, deviceScaleFactor: dpr});
  if (init) await init(ctx);
  const page = await ctx.newPage();
  await page.goto(url, {waitUntil: 'domcontentloaded'});
  if (ready) await ready(page);
  await sleep(600);

  // --- capture ---------------------------------------------------------------------------------------------------
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  const writes = [];
  cdp.on('Page.screencastFrame', ({data, metadata, sessionId}) => {
    const file = `${String(frames.length).padStart(6, '0')}.jpg`;
    frames.push({t: metadata.timestamp, file});
    writes.push(Promise.resolve().then(() => writeFileSync(join(tmp, file), Buffer.from(data, 'base64'))));
    cdp.send('Page.screencastFrameAck', {sessionId}).catch(() => {});
  });
  const size = {w: viewport.width * dpr, h: viewport.height * dpr};
  await cdp.send('Page.startScreencast', {format: 'jpeg', quality: 92, maxWidth: size.w, maxHeight: size.h, everyNthFrame: 1});
  await sleep(300);
  const t0 = Date.now() / 1000;
  const now = () => +(Date.now() / 1000 - t0).toFixed(3);

  // --- helpers ---------------------------------------------------------------------------------------------------
  const events = [];
  const log = (e) => events.push({t: now(), ...e});
  let cursor = {x: viewport.width * 0.62, y: viewport.height * 0.72};
  const boxOf = async (target) => {
    if (target && typeof target.x === 'number' && typeof target.width === 'number') return target;
    const loc = typeof target === 'string' ? page.locator(target).first() : target;
    await loc.waitFor({state: 'visible', timeout: 15000});
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    const b = await loc.boundingBox();
    if (!b) throw new Error(`no box for ${target}`);
    return b;
  };
  const centre = (b, at) => ({x: b.x + (at?.x ?? b.width / 2), y: b.y + (at?.y ?? b.height / 2)});

  const h = {
    page,
    log,
    now,
    sleep,
    // Glide the (real) mouse along an eased path, so hovers fire and the composition can draw the same path.
    async move(target, {ms = 650, at} = {}) {
      const p = typeof target.x === 'number' && target.width === undefined ? target : centre(await boxOf(target), at);
      const from = {...cursor};
      const n = Math.max(8, Math.round(ms / 16));
      for (let i = 1; i <= n; i++) {
        const k = ease(i / n);
        cursor = {x: from.x + (p.x - from.x) * k, y: from.y + (p.y - from.y) * k};
        await page.mouse.move(cursor.x, cursor.y);
        log({type: 'cursor', x: +cursor.x.toFixed(1), y: +cursor.y.toFixed(1)});
        await sleep(ms / n);
      }
    },
    async click(target, {ms = 650, at, hold = 120, after = 450} = {}) {
      const b = await boxOf(target);
      await h.move(centre(b, at), {ms});
      log({type: 'click', x: +cursor.x.toFixed(1), y: +cursor.y.toFixed(1), box: b});
      await page.mouse.down();
      await sleep(hold);
      await page.mouse.up();
      await sleep(after);
    },
    async type(target, text, {cps = 14, click = true} = {}) {
      if (click) await h.click(target, {after: 200});
      log({type: 'type', text});
      for (const ch of text) {
        await page.keyboard.type(ch);
        await sleep(1000 / cps);
      }
      await sleep(300);
    },
    async press(key, {after = 400} = {}) {
      log({type: 'key', key});
      await page.keyboard.press(key);
      await sleep(after);
    },
    // Camera + highlight hint for the composition: zoom on this box from now (until the next focus or step).
    async focus(target, {zoom = 1.6, pad = 16, ring = true} = {}) {
      const b = await boxOf(target);
      log({type: 'focus', box: {x: b.x - pad, y: b.y - pad, width: b.width + 2 * pad, height: b.height + 2 * pad}, zoom, ring});
    },
    unfocus() {
      log({type: 'focus', box: null, zoom: 1, ring: false});
    },
    // A wait the composition may speed through (loading, AI thinking). Returns what the waiter returned.
    async waiting(fn) {
      log({type: 'wait-start'});
      try {
        return await fn();
      } finally {
        log({type: 'wait-end'});
      }
    },
    async scroll(target, {dy = 0, ms = 700} = {}) {
      if (target) {
        const loc = typeof target === 'string' ? page.locator(target).first() : target;
        await loc.evaluate((el) => el.scrollIntoView({behavior: 'smooth', block: 'center'}));
      } else {
        await page.mouse.wheel(0, dy);
      }
      log({type: 'scroll'});
      await sleep(ms);
    },
    async pause(ms = 600) {
      await sleep(ms);
    },
  };

  // --- run -------------------------------------------------------------------------------------------------------
  const stepLog = [];
  let failed = null;
  for (const s of steps) {
    const a = now();
    try {
      await s.run(h);
    } catch (e) {
      failed = `${s.id}: ${e.message.split('\n')[0]}`;
      console.error(`step ${s.id} failed: ${e.message.split('\n')[0]}`);
      await page.screenshot({path: join(tmp, `failed-${s.id}.png`)}).catch(() => {});
    }
    await sleep(250);
    stepLog.push({id: s.id, t0: a, t1: now()});
    if (failed) break;
  }
  await sleep(500);
  const end = now();
  await cdp.send('Page.stopScreencast').catch(() => {});
  await Promise.all(writes);
  await browser.close();
  if (!frames.length) throw new Error('no frames captured');

  // --- frames -> constant-rate mp4 (each frame held until the next one) -----------------------------------------------
  const list = [];
  frames.forEach((fr, i) => {
    const next = i + 1 < frames.length ? frames[i + 1].t : t0 + end;
    list.push(`file '${fr.file}'`, `duration ${Math.max(0.001, next - fr.t).toFixed(4)}`);
  });
  list.push(`file '${frames.at(-1).file}'`);
  writeFileSync(join(tmp, 'frames.txt'), list.join('\n'));
  mkdirSync(join(ROOT, 'public/capture'), {recursive: true});
  const lead = Math.max(0, frames[0].t - t0); // frames start slightly after t0: pad with the first frame
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', join(tmp, 'frames.txt'),
    '-vf', `tpad=start_duration=${lead.toFixed(3)}:start_mode=clone,fps=${fps},scale=${size.w}:${size.h}`,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '14', '-pix_fmt', 'yuv420p', join(ROOT, 'public/capture', `${out}.mp4`)]);
  const data = {name: out, w: size.w, h: size.h, css: viewport, dpr, fps, duration: end, failed, steps: stepLog, events};
  mkdirSync(join(ROOT, 'src/captures'), {recursive: true});
  writeFileSync(join(ROOT, 'src/captures', `${out}.json`), JSON.stringify(data, null, 1));
  // keep src/captures/index.ts in step with the folder, like src/timelines
  const names = readdirSync(join(ROOT, 'src/captures')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
  const ident = (n) => `cap_${n.replace(/[^a-zA-Z0-9]/g, '_')}`;
  writeFileSync(join(ROOT, 'src/captures/index.ts'), [
    '// Generated by capture/record.mjs: one entry per capture JSON in this folder.',
    ...names.map((n) => `import ${ident(n)} from './${n}.json';`),
    '',
    `export const CAPTURES = {${names.map((n) => `'${n}': ${ident(n)}`).join(', ')}};`,
    '',
  ].join('\n'));
  if (!failed) rmSync(tmp, {recursive: true, force: true}); // keep the failure screenshot
  console.log(`${out}: ${frames.length} frames, ${end.toFixed(1)} s, ${stepLog.length} steps${failed ? `, FAILED at ${failed}` : ''}`);
  return data;
}
