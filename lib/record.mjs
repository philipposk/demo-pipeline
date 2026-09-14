// Drives Playwright through the scenes while recording video.
// Each scene's on-screen time = max(audio duration + buffer, action time).
//
// Returns the recorded webm PLUS a timeline of scene boundaries and click
// coordinates, so the effects layer can zoom toward where the user clicked.

import { chromium } from 'playwright';
import { mkdirSync, readdirSync, statSync, chmodSync } from 'node:fs';
import path from 'node:path';

// Injected into every page (survives navigation). Draws a fake cursor + click
// ripple — Playwright renders no real cursor in the recorded video — and reports
// each click's coordinates back to Node via the exposed binding.
function cursorInitScript() {
  const cur = document.createElement('div');
  cur.id = '__demo_cursor';
  cur.style.cssText =
    'position:fixed;top:0;left:0;width:26px;height:26px;margin:-13px 0 0 -13px;' +
    'border-radius:50%;background:rgba(10,12,20,.45);box-shadow:0 0 0 2px rgba(255,255,255,.95),0 2px 8px rgba(0,0,0,.35);' +
    'pointer-events:none;z-index:2147483647;transition:transform .07s ease-out;will-change:transform;';
  const mount = () => {
    if (!document.getElementById('__demo_cursor')) {
      (document.body || document.documentElement).appendChild(cur);
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
  let lastX = window.innerWidth / 2;
  let lastY = window.innerHeight / 2;
  const place = (x, y) => {
    lastX = x; lastY = y;
    cur.style.transform = `translate(${x}px,${y}px)`;
  };
  place(lastX, lastY);
  addEventListener('pointermove', (e) => place(e.clientX, e.clientY), true);
  addEventListener('mousemove', (e) => place(e.clientX, e.clientY), true);
  addEventListener('mousedown', (e) => {
    cur.style.transform = `translate(${e.clientX}px,${e.clientY}px) scale(.78)`;
    const r = document.createElement('div');
    r.style.cssText =
      `position:fixed;left:${e.clientX}px;top:${e.clientY}px;width:12px;height:12px;` +
      'margin:-6px 0 0 -6px;border-radius:50%;border:2px solid rgba(52,211,153,.95);' +
      'pointer-events:none;z-index:2147483646;animation:__demoRip .55s ease-out forwards;';
    (document.body || document.documentElement).appendChild(r);
    setTimeout(() => r.remove(), 560);
    try { window.__demoLogClick({ x: e.clientX, y: e.clientY }); } catch (_) {}
  }, true);
  addEventListener('mouseup', (e) => place(e.clientX, e.clientY), true);
  const st = document.createElement('style');
  st.textContent =
    '@keyframes __demoRip{to{width:68px;height:68px;margin:-34px 0 0 -34px;opacity:0}}';
  // Init scripts run before <html> exists; appending then threw and the ripple
  // animation never loaded. Mount once there is a host.
  const mountStyle = () => {
    const host = document.head || document.documentElement;
    if (host && !st.isConnected) host.appendChild(st);
  };
  mountStyle();
  document.addEventListener('DOMContentLoaded', mountStyle);
}

/**
 * @param {object} cfg
 * @param {string} cfg.url
 * @param {{width:number,height:number}} cfg.viewport
 * @param {Array<{action:Function, audioSec:number, sceneSec:number}>} cfg.scenes
 * @param {string} cfg.videoDir
 * @param {number} cfg.padSec
 * @param {number} cfg.deviceScaleFactor
 * @param {boolean} cfg.cursor  - inject fake cursor + log clicks (mode 2).
 * @param {string|null} [cfg.storageState]      - saved login session to start from (lib/auth.mjs).
 * @param {string|null} [cfg.saveStorageState]  - write the (refreshed) session back here afterwards.
 * @param {object} [cfg.contextOptions]         - extra newContext options (colorScheme, locale, timezoneId…).
 * @param {Array<Function|{fn:Function,arg:any}>} [cfg.initScripts] - injected into every page.
 * @param {Function|null} [cfg.beforeScenes]    - async (page) before the timeline starts (e.g. login check).
 * @param {object} [cfg.sceneCtx]               - second argument to every scene.action(page, ctx).
 * @returns {Promise<{webmPath:string, boundaries:Array, clicks:Array, bodyStart:number, measuredTotal:number}>}
 */
export async function record(cfg) {
  const {
    url, viewport, scenes, videoDir,
    padSec = 0.6, deviceScaleFactor = 2, cursor = false,
    storageState = null, saveStorageState = null,
    contextOptions = {}, initScripts = [], beforeScenes = null, sceneCtx = {},
  } = cfg;
  mkdirSync(videoDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  let boundaries, clicks, bodyStart, measuredTotal;
  try {
    const context = await browser.newContext({
      ...contextOptions,
      viewport,
      recordVideo: { dir: videoDir, size: viewport },
      deviceScaleFactor,
      ...(storageState ? { storageState } : {}),
    });

    clicks = [];
    const t0Ref = { v: 0 };
    if (cursor) {
      await context.exposeBinding('__demoLogClick', (_src, d) => {
        clicks.push({ t: (Date.now() - t0Ref.v) / 1000, x: d.x, y: d.y });
      });
      await context.addInitScript(cursorInitScript);
    }
    for (const s of initScripts) {
      if (typeof s === 'function') await context.addInitScript(s);
      else await context.addInitScript(s.fn, s.arg);
    }

    const page = await context.newPage();
    t0Ref.v = Date.now();

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    if (beforeScenes) await beforeScenes(page);

    boundaries = [];
    bodyStart = (Date.now() - t0Ref.v) / 1000;

    for (const [i, scene] of scenes.entries()) {
      const tStart = (Date.now() - t0Ref.v) / 1000;
      const sceneStartMs = Date.now();
      try {
        await scene.action(page, sceneCtx);
      } catch (err) {
        console.error(`[scene ${i}] action error:`, err.message);
      }
      const actionMs = Date.now() - sceneStartMs;
      const targetMs = Math.max((scene.audioSec + padSec) * 1000, actionMs + 400);
      const remaining = targetMs - actionMs;
      if (remaining > 0) await page.waitForTimeout(remaining);
      const tEnd = (Date.now() - t0Ref.v) / 1000;
      boundaries.push({ i, tStart, tEnd });
    }

    await page.waitForTimeout(600);
    measuredTotal = (Date.now() - t0Ref.v) / 1000;

    if (saveStorageState) {
      // Apps that rotate refresh tokens invalidate the old one on use: persist
      // the refreshed session so the next render still starts logged in.
      await context.storageState({ path: saveStorageState });
      try { chmodSync(saveStorageState, 0o600); } catch {}
    }

    await page.close();
    await context.close();
  } finally {
    await browser.close();
  }

  const files = readdirSync(videoDir)
    .filter((f) => f.endsWith('.webm'))
    .map((f) => ({ f, t: statSync(path.join(videoDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!files.length) throw new Error('No video produced by Playwright.');

  return {
    webmPath: path.join(videoDir, files[0].f),
    boundaries,
    clicks,
    bodyStart,
    measuredTotal,
  };
}
