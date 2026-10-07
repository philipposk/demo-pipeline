#!/usr/bin/env node
// Usage:
//   node pipeline.mjs <project>                 # uses cfg.tts default
//   node pipeline.mjs <project> --tts=openai    # override backend
//   node pipeline.mjs <project> --tts=elevenlabs --voice=Rachel
//
// Loads projects/<project>.mjs, narrates each scene, records browser, merges.

import 'dotenv/config';
import { narrate, narrateDialogue } from './lib/narrate.mjs';
import { record } from './lib/record.mjs';
import { buildNarrationTrack, muxToMp4 } from './lib/merge.mjs';
import { buildCinematic } from './lib/effects.mjs';
import { resolveScenes } from './lib/select.mjs';
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
if (!projectName && !flagMap.url) {
  console.error(`Usage: node pipeline.mjs <project> [options]
         node pipeline.mjs --url=https://site.com [options]   # auto-generate scenes
  --url=<live URL>               auto-discover nav + content, build the demo (no config file)
  --mode=simple|zoom|short       simple=plain · zoom=cinematic · short=vertical social cut
  --mode=studio                  sharp capture composed in Remotion (camera, cursor, word captions, cards)
                                 studio options: --viewport=1600x900 --zoom=1.7 --music=<file> --subs=off
  --format=landscape|portrait|square|4:5
  --strategy=blur|crop           vertical fit: blur=keep all · crop=follow click
  --preset=full|highlights|basic which scenes to include
  --scenes=id1,id2               explicit scene set (overrides preset)
  --order=id2,id1                explicit order
  --exclude=id3                  drop scenes
  --dry-run                      print resolved scene list, do not render
  --tts=edge|openai|elevenlabs|kokoro|say   --voice=…  --model=…
  --subs=off|sidecar|burn        --suffix=…`);
  process.exit(1);
}

// Load config: from a project file, or auto-generated from a live URL.
let cfg;
let slug;
if (flagMap.url) {
  const { buildAutoConfig } = await import('./lib/autoscenes.mjs');
  console.log(`Auto-discovering scenes for ${flagMap.url}…`);
  cfg = await buildAutoConfig(flagMap.url, {
    mode: flagMap.mode, tts: flagMap.tts, voice: flagMap.voice, subtitles: flagMap.subs,
  });
  slug = projectName || new URL(flagMap.url).hostname.replace(/^www\./, '').replace(/[^a-z0-9]+/gi, '-');
  console.log(`  found ${cfg.scenes.length} scenes: ${cfg.scenes.map((s) => s.title).join(', ')}`);
} else {
  const cfgPath = path.join(__dirname, 'projects', `${projectName}.mjs`);
  cfg = (await import(cfgPath)).default;
  if (!cfg) throw new Error(`No default export in ${cfgPath}`);
  slug = projectName;
}

// ─── Resolve which scenes to render (preset / explicit / order / exclude) ────
const { selected, summary } = resolveScenes(cfg.scenes, flagMap, cfg);
if (!selected.length) { console.error('No scenes selected.'); process.exit(1); }
if (flagMap['dry-run']) {
  console.log(`Project: ${cfg.name}  ·  preset: ${flagMap.preset || 'full'}\nResolved ${selected.length}/${cfg.scenes.length} scenes:\n${summary}`);
  process.exit(0);
}

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
// ─── Mode / format / subtitles ───────────────────────────────────────────────
const mode = flagMap.mode || cfg.mode || 'simple';     // 'simple' | 'zoom' | 'short'
const isShort = mode === 'short';
const cinematic = mode !== 'simple';
const format = flagMap.format || cfg.format || (isShort ? 'portrait' : 'landscape');
const strategy = flagMap.strategy || cfg.strategy || 'blur';
// Shorts force burned captions (social autoplay is muted) unless CLI overrides.
const subs = flagMap.subs || (isShort ? 'burn' : (cfg.subtitles || 'sidecar'));
const suffix = flagMap.suffix || `${mode}-${format}-${tts.backend}`;

// ─── Two-voice dialogue helpers (product-demo mode) ──────────────────────────
// A scene may declare `dialogue: [{ role: 'user'|'assistant', text }]`. Each role is
// spoken in its own voice (default: male user, female assistant) so the demo plays as a
// live conversation while the real on-page assistant performs the actions.
const DEFAULT_VOICES = {
  user: { backend: 'edge', voice: 'en-US-AndrewMultilingualNeural' },      // male
  assistant: { backend: 'edge', voice: 'en-US-AvaMultilingualNeural' },    // female
};
function dialogueText(scene) {
  return (scene.dialogue || []).map((d) => d.text).join('  ');
}
function resolveTurnOpts(role) {
  const v = (cfg.voices && cfg.voices[role]) || DEFAULT_VOICES[role] || DEFAULT_VOICES.assistant;
  return { rate: tts.rate, speed: tts.speed, ...v };
}

// ─── Budget guard (only the SELECTED scenes are narrated) ─────────────────────
const totalChars = selected.reduce((s, x) => s + (x.narration || dialogueText(x)).length, 0);
const cap = parseFloat(process.env.MAX_COST_PER_VIDEO || '0.20');
console.log(`Project: ${cfg.name}  ·  mode: ${mode}  ·  format: ${format}  ·  scenes: ${selected.length}/${cfg.scenes.length}  ·  TTS: ${tts.backend}${tts.model ? `:${tts.model}` : ''}  ·  subs: ${subs}`);
assertWithinBudget(tts.backend, tts.model || '*', totalChars, cap);

// ─── Paths ───────────────────────────────────────────────────────────────────
const viewport = cfg.viewport || { width: 1920, height: 1080 };
const tmpDir = path.join(__dirname, 'tmp', `${slug}-${suffix}`);
if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });
const audioDir = path.join(tmpDir, 'audio');
mkdirSync(audioDir, { recursive: true });
const videoDir = path.join(tmpDir, 'video');

// ─── 1. Narrate (only the selected scenes, in resolved order) ────────────────
console.log(`[1/4] Narrating ${selected.length} scenes via ${tts.backend}…`);
const enriched = [];
let usedChars = 0;
for (const [i, scene] of selected.entries()) {
  const wavPath = path.join(audioDir, `scene-${String(i).padStart(2, '0')}.wav`);
  let durationSec, charsUsed, words;
  if (Array.isArray(scene.dialogue) && scene.dialogue.length) {
    const turns = scene.dialogue.map((d) => ({ text: d.text, opts: resolveTurnOpts(d.role) }));
    ({ durationSec, charsUsed } = await narrateDialogue(turns, wavPath, path.join(audioDir, `dlg-${String(i).padStart(2, '0')}`)));
    scene.narration = dialogueText(scene); // for subtitles + logging
  } else {
    ({ durationSec, charsUsed, words } = await narrate(scene.narration, tts, wavPath));
  }
  usedChars += charsUsed;
  const sceneSec = durationSec + 0.2 /* preroll */ + 0.6 /* tail pad */;
  enriched.push({ ...scene, wavPath, audioSec: durationSec, sceneSec, words });
  console.log(`  scene ${i} [${scene.id}]: ${durationSec.toFixed(1)}s  "${(scene.narration || '').slice(0, 50)}…"`);
}
const totalAudio = enriched.reduce((s, x) => s + x.sceneSec, 0);
console.log(`  total: ${totalAudio.toFixed(1)}s  ·  ${usedChars} chars`);

// ─── Studio mode: sharp capture → Remotion composition (motion/src/studio) ───
if (mode === 'studio') {
  const { capture } = await import('./lib/capture.mjs');
  const { renderStudio } = await import('./lib/studio.mjs');
  const [vw, vh] = String(flagMap.viewport || cfg.studio?.viewport || '1600x900').split('x').map(Number);
  const studioViewport = { width: vw, height: vh };
  console.log(`[2/3] Capturing ${cfg.url} (viewport ${vw}x${vh} @${cfg.studio?.dpr ?? 2}x)…`);
  const cap = await capture({
    url: cfg.url,
    viewport: studioViewport,
    scenes: enriched,
    workDir: path.join(tmpDir, 'capture'),
    dpr: cfg.studio?.dpr ?? 2,
    padSec: 0.6,
    storageState: cfg.storageState,
    hideSelectors: cfg.hideSelectors,
  });
  const outDir = path.join(__dirname, 'output');
  mkdirSync(outDir, { recursive: true });
  const outMp4 = path.join(outDir, `${slug}-demo-${suffix}.mp4`);
  const u = new URL(cfg.url);
  console.log(`[3/3] Composing in Remotion…`);
  await renderStudio({
    cap,
    scenes: enriched,
    slug,
    outMp4,
    look: {
      title: cfg.intro?.title ?? cfg.name,
      subtitle: cfg.intro?.subtitle ?? '',
      outroTitle: cfg.outro?.title ?? cfg.name,
      outroSubtitle: cfg.outro?.subtitle ?? u.hostname,
      colors: cfg.studio?.colors || cfg.frame?.colors,
      accent: cfg.studio?.accent,
      logo: cfg.logo ? path.join(__dirname, cfg.logo) : null,
      watermark: flagMap.watermark !== 'off' && cfg.studio?.watermark !== false,
      address: (u.hostname + u.pathname).replace(/^www\./, '').replace(/\/$/, ''),
      music: flagMap.music && flagMap.music !== 'off' ? path.resolve(flagMap.music) : (cfg.studio?.music ? path.join(__dirname, cfg.studio.music) : null),
      musicGain: cfg.studio?.musicGain,
      zoom: flagMap.zoom ? Number(flagMap.zoom) : cfg.studio?.zoom,
      captions: flagMap.subs !== 'off' && cfg.studio?.captions !== false,
      introSec: cfg.intro?.dur ? Math.min(cfg.intro.dur, 2.8) : undefined,
      outroSec: cfg.outro?.dur ? Math.min(cfg.outro.dur, 3.2) : undefined,
      concurrency: flagMap.concurrency,
    },
  });
  console.log(`\nDone. → ${outMp4}`);
  process.exit(0);
}

// ─── 2. Record browser ───────────────────────────────────────────────────────
console.log(`[2/4] Recording browser flow at ${cfg.url} (viewport ${viewport.width}x${viewport.height})…`);
const rec = await record({
  url: cfg.url,
  viewport,
  scenes: enriched,
  videoDir,
  padSec: 0.6,
  deviceScaleFactor: cfg.deviceScaleFactor ?? 2,
  cursor: cinematic,
});
console.log(`  video: ${rec.webmPath}  ·  clicks logged: ${rec.clicks.length}`);

// ─── 3. Concat narration track ───────────────────────────────────────────────
console.log(`[3/4] Building narration track…`);
const audioPath = path.join(tmpDir, 'narration.wav');
await buildNarrationTrack(enriched, audioPath, path.join(tmpDir, 'audio-work'));

// ─── 4. Assemble final video ─────────────────────────────────────────────────
const outDir = path.join(__dirname, 'output');
mkdirSync(outDir, { recursive: true });
const outMp4 = path.join(outDir, `${slug}-demo-${suffix}.mp4`);

if (mode === 'simple') {
  console.log(`[4/4] Muxing MP4 (simple mode, CRF ${cfg.video?.crf ?? 17})…`);
  await muxToMp4({
    videoPath: rec.webmPath,
    audioPath,
    outMp4,
    crf: cfg.video?.crf ?? 17,
    preset: cfg.video?.preset ?? 'slow',
  });
} else {
  const baseZoom = cfg.video?.zoom ?? 0.16;
  // Shorts: snappier cards + punchier zoom for engagement.
  const intro = isShort ? { ...cfg.intro, dur: 1.3 } : cfg.intro;
  const outro = isShort ? { ...cfg.outro, dur: 1.8 } : cfg.outro;
  const frame = flagMap.frame ? flagMap.frame !== 'off' : (cfg.video?.frame ?? true);
  console.log(`[4/4] Cinematic assembly (${format} · ${frame ? 'framed' : strategy} · subs=${subs})…`);
  await buildCinematic({
    webmPath: rec.webmPath,
    scenes: enriched,
    boundaries: rec.boundaries,
    clicks: rec.clicks,
    bodyStart: rec.bodyStart,
    narrationWav: audioPath,
    outMp4,
    srtPath: path.join(tmpDir, `${slug}.srt`),
    opts: {
      srcW: viewport.width,
      srcH: viewport.height,
      format,
      strategy,
      fps: cfg.video?.fps ?? 30,
      zoom: isShort ? Math.max(baseZoom, 0.2) : baseZoom,
      logo: cfg.logo ? path.join(__dirname, cfg.logo) : null,
      logoOpacity: cfg.logoOpacity ?? 0.9,
      subtitles: subs,
      frame,
      frameCfg: cfg.frame || {},
      intro,
      outro,
    },
  });
}

console.log(`\nDone. → ${outMp4}`);
