// Sharp screen capture for studio mode. Same scene loop as record.mjs, but
// instead of Playwright's recordVideo (VP8 at ~1 Mbps, viewport resolution) it
// reads Chrome's screencast at full device resolution (viewport × DPR), so text
// stays crisp when the composition zooms in. No cursor is drawn into the page:
// the page only reports what happened (clicks with the clicked element's box
// and label, typing, scrolls, navigations) and the composition draws the cursor,
// ripples and camera moves on top.
//
// Returns { videoPath, css, w, h, dpr, fps, duration, boundaries, events, startUrl }.
// All times are seconds from the start of the capture video.

import { chromium } from 'playwright';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const exec = promisify(execFile);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Runs in every page (survives navigation). Reports interaction events with the
// page's own clock (Date.now(), same clock as the screencast timestamps).
function eventsInitScript() {
  const send = (e) => { try { window.__studioEvent({ ...e, ts: Date.now() }); } catch (_) {} };
  const INTERACTIVE = 'a,button,input,textarea,select,label,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[onclick]';
  const boxOf = (el) => {
    if (!el || !el.getBoundingClientRect) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  // The region worth framing around a click: the nearest ancestor that is a
  // readable block (a row, a toolbar, a card), not the tiny control itself.
  const contextOf = (el) => {
    const vw = innerWidth, vh = innerHeight;
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const r = n.getBoundingClientRect();
      if (r.width > vw * 0.9 || r.height > vh * 0.7) break;
      if (r.width >= Math.min(360, vw * 0.25) && r.height >= 28) return boxOf(n);
    }
    return boxOf(el);
  };
  const labelOf = (el) => {
    if (!el) return '';
    const t = el.getAttribute?.('aria-label') || el.innerText || el.value || el.getAttribute?.('placeholder') || el.title || '';
    return String(t).replace(/\s+/g, ' ').trim().slice(0, 80);
  };
  addEventListener('mousedown', (e) => {
    const el = e.target?.closest?.(INTERACTIVE) || e.target;
    send({ type: 'click', x: e.clientX, y: e.clientY, box: boxOf(el), ctx: contextOf(el), label: labelOf(el) });
  }, true);
  addEventListener('input', (e) => {
    const el = e.target;
    send({ type: 'input', box: boxOf(el), ctx: contextOf(el), label: labelOf(el) });
  }, true);
  let lastScroll = 0;
  addEventListener('scroll', () => {
    const now = Date.now();
    if (now - lastScroll < 250) return;
    lastScroll = now;
    send({ type: 'scroll', y: window.scrollY });
  }, true);
}

/**
 * @param {object} cfg
 * @param {string} cfg.url
 * @param {{width:number,height:number}} cfg.viewport   CSS pixels
 * @param {Array<{action:Function, audioSec:number}>} cfg.scenes
 * @param {string} cfg.workDir
 * @param {number} [cfg.dpr=2]
 * @param {number} [cfg.padSec=0.6]
 * @param {number} [cfg.fps=30]
 * @param {number} [cfg.quality=85]   screencast JPEG quality
 * @param {string} [cfg.storageState] optional saved login
 * @param {string[]} [cfg.hideSelectors] CSS selectors to hide (dev badges etc.)
 */
export async function capture(cfg) {
  const {
    url, viewport, scenes, workDir,
    dpr = 2, padSec = 0.6, fps = 30, quality = 85,
    storageState, hideSelectors = [],
  } = cfg;
  const frameDir = path.join(workDir, 'frames');
  rmSync(frameDir, { recursive: true, force: true });
  mkdirSync(frameDir, { recursive: true });

  const browser = await chromium.launch({ headless: true, args: [`--force-device-scale-factor=${dpr}`] });
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: dpr,
    ...(storageState ? { storageState } : {}),
  });
  if (hideSelectors.length) {
    const css = hideSelectors.map((s) => `${s}{display:none!important}`).join('');
    await context.addInitScript((css) => {
      const add = () => { const st = document.createElement('style'); st.textContent = css; (document.head || document.documentElement).appendChild(st); };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
    }, css);
  }

  const raw = [];
  await context.exposeBinding('__studioEvent', (_src, e) => raw.push(e));
  await context.addInitScript(eventsInitScript);

  const page = await context.newPage();
  page.on('framenavigated', (fr) => {
    if (fr === page.mainFrame()) raw.push({ type: 'nav', ts: Date.now(), url: fr.url() });
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await sleep(500);
  raw.length = 0; // the initial load is not part of the video
  const startUrl = page.url();

  // ── screencast ────────────────────────────────────────────────────────────
  const cdp = await context.newCDPSession(page);
  const frames = [];
  const writes = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const file = `${String(frames.length).padStart(6, '0')}.jpg`;
    frames.push({ t: metadata.timestamp, file });
    writes.push(Promise.resolve().then(() => writeFileSync(path.join(frameDir, file), Buffer.from(data, 'base64'))));
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  const w = viewport.width * dpr;
  const h = viewport.height * dpr;
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality, maxWidth: w, maxHeight: h, everyNthFrame: 1 });
  await sleep(300);
  const t0 = Date.now() / 1000;
  const now = () => Date.now() / 1000 - t0;

  // ── scenes (same timing rule as record.mjs) ─────────────────────────────────
  const boundaries = [];
  for (const [i, scene] of scenes.entries()) {
    const tStart = now();
    const startMs = Date.now();
    try {
      await scene.action(page);
    } catch (err) {
      console.error(`[scene ${i}] action error:`, err.message.split('\n')[0]);
    }
    const actionMs = Date.now() - startMs;
    const targetMs = Math.max((scene.audioSec + padSec) * 1000, actionMs + 400);
    if (targetMs > actionMs) await sleep(targetMs - actionMs);
    boundaries.push({ i, tStart, tEnd: now() });
  }
  await sleep(500);
  const duration = now();

  await cdp.send('Page.stopScreencast').catch(() => {});
  await Promise.all(writes);
  await browser.close();
  if (!frames.length) throw new Error('Screencast produced no frames.');

  // ── frames → constant-rate mp4 (each frame held until the next one) ─────────
  const list = [];
  frames.forEach((fr, i) => {
    const next = i + 1 < frames.length ? frames[i + 1].t : t0 + duration;
    list.push(`file '${fr.file}'`, `duration ${Math.max(0.001, next - fr.t).toFixed(4)}`);
  });
  list.push(`file '${frames.at(-1).file}'`);
  writeFileSync(path.join(frameDir, 'frames.txt'), list.join('\n'));
  const lead = Math.max(0, frames[0].t - t0); // first frame arrives slightly after t0
  const videoPath = path.join(workDir, 'capture.mp4');
  await exec('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(frameDir, 'frames.txt'),
    '-vf', `tpad=start_duration=${lead.toFixed(3)}:start_mode=clone,fps=${fps},scale=${w}:${h}:flags=lanczos`,
    '-t', duration.toFixed(3),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p', videoPath]);
  rmSync(frameDir, { recursive: true, force: true });

  const events = raw
    .map((e) => ({ ...e, t: +(e.ts / 1000 - t0).toFixed(3) }))
    .filter((e) => e.t >= 0 && e.t <= duration)
    .map(({ ts, ...e }) => e);

  const span = frames.length > 1 ? frames.at(-1).t - frames[0].t : 0;
  console.log(`  capture: ${frames.length} frames over ${span.toFixed(1)}s (${(frames.length / Math.max(span, 0.001)).toFixed(1)} fps avg) at ${w}x${h}, ${events.length} events`);
  return { videoPath, css: viewport, w, h, dpr, fps, duration, boundaries, events, startUrl };
}
