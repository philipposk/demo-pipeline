#!/usr/bin/env node
// Usage:
//   node pipeline.mjs <project>                 # uses cfg.tts default
//   node pipeline.mjs <project> --tts=openai    # override backend
//   node pipeline.mjs <project> --tts=elevenlabs --voice=Rachel
//   node pipeline.mjs login <project>           # apps behind a login: log in once, session saved to .auth/
//
// Loads projects/<project>.mjs, narrates each scene, records browser, merges.

import 'dotenv/config';
import { narrate, narrateDialogue } from './lib/narrate.mjs';
import { record } from './lib/record.mjs';
import { buildNarrationTrack, muxToMp4 } from './lib/merge.mjs';
import { buildCinematic } from './lib/effects.mjs';
import { resolveScenes } from './lib/select.mjs';
import { assertWithinBudget } from './lib/cost.mjs';
import { statePathFor, needsAuth, login, assertLoggedIn, stateExists } from './lib/auth.mjs';
import { resolveMask, maskInitScript } from './lib/mask.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, rmSync, existsSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── CLI parsing ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const positionals = args.filter((a) => !a.startsWith('--'));
const isLogin = positionals[0] === 'login';
const projectName = isLogin ? positionals[1] : positionals[0];
const flagMap = Object.fromEntries(
  args.filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);
if (isLogin && !projectName) {
  console.error('Usage: node pipeline.mjs login <project>   # opens a browser; you log in yourself; session saved to .auth/<project>.json');
  process.exit(1);
}
if (!projectName && !flagMap.url) {
  console.error(`Usage: node pipeline.mjs <project> [options]
         node pipeline.mjs --url=https://site.com [options]   # auto-generate scenes
         node pipeline.mjs login <project>                    # save a login session once (apps behind a login)
  --url=<live URL>               auto-discover nav + content, build the demo (no config file)
  --mode=simple|zoom|short       simple=plain · zoom=cinematic · short=vertical social cut
  --format=landscape|portrait|square|4:5
  --strategy=blur|crop           vertical fit: blur=keep all · crop=follow click
  --preset=full|highlights|basic which scenes to include
  --scenes=id1,id2               explicit scene set (overrides preset)
  --order=id2,id1                explicit order
  --exclude=id3                  drop scenes
  --dry-run                      print resolved scene list, do not render
  --lang=en|da                   narration language (scenes may carry { en, da } text)
  --mask=off                     disable the project's privacy blur
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

// ─── Login subcommand: headed browser, the human logs in, we save the session ─
const statePath = cfg.auth ? statePathFor(cfg, slug, __dirname) : null;
const loginCmd = `node pipeline.mjs login ${slug}`;
if (isLogin) {
  if (!cfg.auth) { console.error(`projects/${slug}.mjs has no auth config — nothing to log in to.`); process.exit(1); }
  await login(cfg, statePath); // exits
}

// ─── Mode + language (needed before scene text is resolved) ──────────────────
const mode = flagMap.mode || cfg.mode || 'simple';     // 'simple' | 'zoom' | 'short'
const isShort = mode === 'short';
const cinematic = mode !== 'simple';
const lang = flagMap.lang || cfg.lang || 'en';
// Text fields may be a string or a per-language map { en: '…', da: '…' }.
const pick = (v) => (v == null || typeof v !== 'object' ? v : (v[lang] ?? v.en ?? Object.values(v)[0]));
// Shorts use a scene's punchier `shortNarration` when it has one.
cfg.scenes = cfg.scenes.map((s) => ({
  ...s,
  title: pick(s.title),
  narration: pick(isShort && s.shortNarration ? s.shortNarration : s.narration),
  ...(Array.isArray(s.dialogue) ? { dialogue: s.dialogue.map((d) => ({ ...d, text: pick(d.text) })) } : {}),
}));

// ─── Resolve which scenes to render (preset / explicit / order / exclude) ────
const { selected, summary } = resolveScenes(cfg.scenes, flagMap, cfg);
if (!selected.length) { console.error('No scenes selected.'); process.exit(1); }
const useAuth = needsAuth(cfg, selected);
if (flagMap['dry-run']) {
  const words = selected.reduce((n, s) => n + (s.narration || '').split(/\s+/).filter(Boolean).length, 0);
  const cards = cinematic ? (isShort ? 1.3 + 1.8 : (cfg.intro?.dur ?? 2.8) + (cfg.outro?.dur ?? 3.2)) : 0;
  const est = words / 2.45 + selected.length * 0.8 + cards; // edge neural voices measured 2.4–2.6 words/s
  console.log(`Project: ${cfg.name}  ·  preset: ${flagMap.preset || 'full'}  ·  mode: ${mode}  ·  lang: ${lang}\nResolved ${selected.length}/${cfg.scenes.length} scenes:\n${summary}`);
  console.log(`  ≈${Math.round(est)}s estimated (${words} words at ~2.45 words/s${cards ? ` + ${cards.toFixed(1)}s cards` : ''}; slow live-app steps can add more)`);
  if (cfg.auth) {
    console.log(`  login: ${useAuth ? 'needed' : 'not needed (public scenes only)'}  ·  saved session ${stateExists(statePath) ? 'found' : 'missing'}: ${path.relative(__dirname, statePath)}`);
  }
  process.exit(0);
}
if (useAuth && !stateExists(statePath)) {
  console.error(`This project needs a saved login session (${path.relative(__dirname, statePath)} is missing).\nRun once, log in yourself in the window that opens, then re-run:\n  ${loginCmd}`);
  process.exit(1);
}

// ─── Resolve TTS opts (CLI overrides project defaults) ───────────────────────
// A project may set per-language voices in cfg.ttsByLang; otherwise cfg.tts.
// If CLI changes backend, drop the cfg voice/model — they belong to the cfg's backend, not the new one.
const baseTts = cfg.ttsByLang?.[lang] || cfg.tts;
const cfgBackend = baseTts?.backend || 'say';
const resolvedBackend = flagMap.tts || cfgBackend;
const inheritFromCfg = resolvedBackend === cfgBackend;
const tts = {
  backend: resolvedBackend,
  voice: flagMap.voice || (inheritFromCfg ? baseTts?.voice : undefined),
  model: flagMap.model || (inheritFromCfg ? baseTts?.model : undefined),
  rate: baseTts?.rate || 175,
  speed: baseTts?.speed || 1.0,
};
// ─── Format / subtitles ──────────────────────────────────────────────────────
const format = flagMap.format || cfg.format || (isShort ? 'portrait' : 'landscape');
const strategy = flagMap.strategy || cfg.strategy || 'blur';
// Shorts force burned captions (social autoplay is muted) unless CLI overrides.
const subs = flagMap.subs || (isShort ? 'burn' : (cfg.subtitles || 'sidecar'));
const presetTag = flagMap.preset && flagMap.preset !== 'full' ? flagMap.preset : null;
const suffix = flagMap.suffix || [mode, format, tts.backend, presetTag, lang !== 'en' ? lang : null].filter(Boolean).join('-');

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
console.log(`Project: ${cfg.name}  ·  mode: ${mode}  ·  format: ${format}  ·  lang: ${lang}  ·  scenes: ${selected.length}/${cfg.scenes.length}  ·  TTS: ${tts.backend}${tts.model ? `:${tts.model}` : ''}  ·  subs: ${subs}`);
assertWithinBudget(tts.backend, tts.model || '*', totalChars, cap);

// ─── Paths ───────────────────────────────────────────────────────────────────
// A project may record vertical/square cuts at a smaller viewport so the UI reads larger.
const viewport = cfg.viewports?.[format] || cfg.viewport || { width: 1920, height: 1080 };
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
  let durationSec, charsUsed;
  if (Array.isArray(scene.dialogue) && scene.dialogue.length) {
    const turns = scene.dialogue.map((d) => ({ text: d.text, opts: resolveTurnOpts(d.role) }));
    ({ durationSec, charsUsed } = await narrateDialogue(turns, wavPath, path.join(audioDir, `dlg-${String(i).padStart(2, '0')}`)));
    scene.narration = dialogueText(scene); // for subtitles + logging
  } else {
    ({ durationSec, charsUsed } = await narrate(scene.narration, tts, wavPath));
  }
  usedChars += charsUsed;
  const sceneSec = durationSec + 0.2 /* preroll */ + 0.6 /* tail pad */;
  enriched.push({ ...scene, wavPath, audioSec: durationSec, sceneSec });
  console.log(`  scene ${i} [${scene.id}]: ${durationSec.toFixed(1)}s  "${(scene.narration || '').slice(0, 50)}…"`);
}
const totalAudio = enriched.reduce((s, x) => s + x.sceneSec, 0);
console.log(`  total: ${totalAudio.toFixed(1)}s  ·  ${usedChars} chars`);

// ─── 2. Record browser ───────────────────────────────────────────────────────
// The first selected scene may start somewhere other than cfg.url (e.g. a public page).
const startUrl = selected[0]?.startUrl || cfg.url;
const maskOpts = resolveMask(cfg.mask, flagMap.mask);
const initScripts = [...(cfg.initScripts || [])];
if (maskOpts) initScripts.push({ fn: maskInitScript, arg: maskOpts });
console.log(`[2/4] Recording browser flow at ${startUrl} (viewport ${viewport.width}x${viewport.height}${useAuth ? ' · saved login' : ''}${maskOpts ? ' · privacy blur on' : ''})…`);
const rec = await record({
  url: startUrl,
  viewport,
  scenes: enriched,
  videoDir,
  padSec: 0.6,
  deviceScaleFactor: cfg.deviceScaleFactor ?? 2,
  cursor: cinematic,
  storageState: useAuth ? statePath : null,
  saveStorageState: useAuth ? statePath : null,
  contextOptions: cfg.contextOptions || {},
  initScripts,
  beforeScenes: useAuth ? (page) => assertLoggedIn(page, cfg.auth, loginCmd) : (cfg.beforeScenes || null),
  sceneCtx: { mode, format, lang, preset: flagMap.preset || 'full', state: {} },
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
  // Card text may also be per-language.
  const cardText = (c) => (c ? { ...c, title: pick(c.title), subtitle: pick(c.subtitle) } : c);
  // Shorts: snappier cards + punchier zoom for engagement.
  const intro = isShort ? { ...cardText(cfg.intro), dur: 1.3 } : cardText(cfg.intro);
  const outro = isShort ? { ...cardText(cfg.outro), dur: 1.8 } : cardText(cfg.outro);
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
