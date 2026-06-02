// Drives Playwright through the scenes while recording video.
// Each scene's on-screen time = max(audio duration + buffer, action time).

import { chromium } from 'playwright';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * @param {object} cfg
 * @param {string} cfg.url
 * @param {{width:number,height:number}} cfg.viewport
 * @param {Array<{narration:string, action:Function, audioSec:number}>} cfg.scenes
 * @param {string} cfg.videoDir
 * @param {number} cfg.padSec
 * @param {number} cfg.deviceScaleFactor  - 2 default; 3 = retina-crisp text (heavier).
 * @returns {Promise<string>} - Absolute path to the recorded .webm.
 */
export async function record(cfg) {
  const { url, viewport, scenes, videoDir, padSec = 0.6, deviceScaleFactor = 2 } = cfg;
  mkdirSync(videoDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport,
    recordVideo: { dir: videoDir, size: viewport },
    deviceScaleFactor,
  });
  const page = await context.newPage();

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  for (const [i, scene] of scenes.entries()) {
    const sceneStart = Date.now();
    try {
      await scene.action(page);
    } catch (err) {
      console.error(`[scene ${i}] action error:`, err.message);
    }
    const actionMs = Date.now() - sceneStart;
    const targetMs = Math.max((scene.audioSec + padSec) * 1000, actionMs + 400);
    const remaining = targetMs - actionMs;
    if (remaining > 0) await page.waitForTimeout(remaining);
  }

  await page.waitForTimeout(800);

  await page.close();
  await context.close();
  await browser.close();

  const files = readdirSync(videoDir)
    .filter((f) => f.endsWith('.webm'))
    .map((f) => ({ f, t: statSync(path.join(videoDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!files.length) throw new Error('No video produced by Playwright.');
  return path.join(videoDir, files[0].f);
}
