#!/usr/bin/env node
// Usage:
//   node pipeline.mjs <project>                 # uses cfg.tts default
//   node pipeline.mjs <project> --tts=openai    # override backend
//   node pipeline.mjs <project> --tts=elevenlabs --voice=Rachel
//
// Loads projects/<project>.mjs, narrates each scene, records browser, merges.

import 'dotenv/config';
import { narrate } from './lib/narrate.mjs';
import { record } from './lib/record.mjs';
import { buildNarrationTrack, muxToMp4 } from './lib/merge.mjs';
import { assertWithinBudget } from './lib/cost.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, rmSync, existsSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── CLI parsing ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const projectName = args.find((a) => !a.startsWith('--'));
const flagMap = Object.fromEntries(
  args.filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);
if (!projectName) {
  console.error('Usage: node pipeline.mjs <project> [--tts=openai|elevenlabs|kokoro|say] [--voice=…] [--model=…] [--suffix=…]');
  process.exit(1);
}

const cfgPath = path.join(__dirname, 'projects', `${projectName}.mjs`);
const cfg = (await import(cfgPath)).default;
if (!cfg) throw new Error(`No default export in ${cfgPath}`);

// ─── Resolve TTS opts (CLI overrides project defaults) ───────────────────────
// If CLI changes backend, drop cfg.tts.voice/model — they belong to the cfg's backend, not the new one.
const cfgBackend = cfg.tts?.backend || 'say';
const resolvedBackend = flagMap.tts || cfgBackend;
const inheritFromCfg = resolvedBackend === cfgBackend;
const tts = {
  backend: resolvedBackend,
  voice: flagMap.voice || (inheritFromCfg ? cfg.tts?.voice : undefined),
  model: flagMap.model || (inheritFromCfg ? cfg.tts?.model : undefined),
  rate: cfg.tts?.rate || 175,
  speed: cfg.tts?.speed || 1.0,
};
const suffix = flagMap.suffix || tts.backend;

// ─── Budget guard ────────────────────────────────────────────────────────────
const totalChars = cfg.scenes.reduce((s, x) => s + x.narration.length, 0);
const cap = parseFloat(process.env.MAX_COST_PER_VIDEO || '0.20');
console.log(`Project: ${cfg.name}  ·  TTS: ${tts.backend}${tts.model ? `:${tts.model}` : ''}  ·  voice: ${tts.voice ?? '(default)'}`);
assertWithinBudget(tts.backend, tts.model || '*', totalChars, cap);

// ─── Paths ───────────────────────────────────────────────────────────────────
const viewport = cfg.viewport || { width: 1920, height: 1080 };
const tmpDir = path.join(__dirname, 'tmp', `${projectName}-${suffix}`);
if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });
const audioDir = path.join(tmpDir, 'audio');
mkdirSync(audioDir, { recursive: true });
const videoDir = path.join(tmpDir, 'video');

// ─── 1. Narrate ──────────────────────────────────────────────────────────────
console.log(`[1/4] Narrating ${cfg.scenes.length} scenes via ${tts.backend}…`);
const enriched = [];
let usedChars = 0;
for (const [i, scene] of cfg.scenes.entries()) {
  const wavPath = path.join(audioDir, `scene-${String(i).padStart(2, '0')}.wav`);
  const { durationSec, charsUsed } = await narrate(scene.narration, tts, wavPath);
  usedChars += charsUsed;
  const sceneSec = durationSec + 0.2 /* preroll */ + 0.6 /* tail pad */;
  enriched.push({ ...scene, wavPath, audioSec: durationSec, sceneSec });
  console.log(`  scene ${i}: ${durationSec.toFixed(1)}s  "${scene.narration.slice(0, 60)}…"`);
}
const totalAudio = enriched.reduce((s, x) => s + x.sceneSec, 0);
console.log(`  total: ${totalAudio.toFixed(1)}s  ·  ${usedChars} chars`);

// ─── 2. Record browser ───────────────────────────────────────────────────────
console.log(`[2/4] Recording browser flow at ${cfg.url} (viewport ${viewport.width}x${viewport.height})…`);
const webmPath = await record({
  url: cfg.url,
  viewport,
  scenes: enriched,
  videoDir,
  padSec: 0.6,
  deviceScaleFactor: cfg.deviceScaleFactor ?? 2,
});
console.log(`  video: ${webmPath}`);

// ─── 3. Concat narration track ───────────────────────────────────────────────
console.log(`[3/4] Building narration track…`);
const audioPath = path.join(tmpDir, 'narration.wav');
await buildNarrationTrack(enriched, audioPath, path.join(tmpDir, 'audio-work'));

// ─── 4. Mux ──────────────────────────────────────────────────────────────────
console.log(`[4/4] Muxing MP4 (CRF ${cfg.video?.crf ?? 17}, preset ${cfg.video?.preset ?? 'slow'})…`);
const outDir = path.join(__dirname, 'output');
mkdirSync(outDir, { recursive: true });
const outMp4 = path.join(outDir, `${projectName}-demo-${suffix}.mp4`);
await muxToMp4({
  videoPath: webmPath,
  audioPath,
  outMp4,
  crf: cfg.video?.crf ?? 17,
  preset: cfg.video?.preset ?? 'slow',
});

console.log(`\nDone. → ${outMp4}`);
