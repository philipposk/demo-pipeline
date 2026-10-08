// Studio mode: turns a sharp capture (lib/capture.mjs) + per-scene narration
// into a Remotion render (motion/src/studio). This file does all the timing
// decisions as plain data — which source frame plays when, where the camera
// zooms, where the cursor glides, which caption word lights up — and the
// composition only draws them. Frames are 30 fps unless opts.fps says otherwise.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOTION = path.join(__dirname, '..', 'motion');

const VO_LEAD = 0.25;   // voice starts this long after its scene starts
const CAM_LEAD = 14;    // frames the camera starts moving before a click
const GLIDE = 16;       // frames the cursor glides into a click
const STOP = new Set(['the', 'and', 'for', 'you', 'your', 'with', 'this', 'that', 'what', 'are', 'from', 'into', 'here', 'there', 'just', 'new']);

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hex = (c) => (String(c).startsWith('0x') ? `#${String(c).slice(2)}` : c);

/** Word timings when the TTS backend gave none: spread by word length. */
export function estimateWords(text, durSec) {
  const words = text.split(/\s+/).filter(Boolean);
  const weight = (w) => w.length + 2 + (/[.!?]$/.test(w) ? 5 : /[,;:]$/.test(w) ? 2 : 0);
  const total = words.reduce((n, w) => n + weight(w), 0) || 1;
  const span = Math.max(0.1, durSec - 0.1);
  let t = 0.05;
  return words.map((w) => {
    const d = (weight(w) / total) * span;
    const out = { w, s: +t.toFixed(3), e: +(t + d * 0.85).toFixed(3) };
    t += d;
    return out;
  });
}

/** Caption chunks: one per sentence, long sentences split into balanced parts of ≤ maxChars. */
function chunkWords(words, maxChars = 46) {
  const sentences = [];
  let cur = [];
  for (const w of words) {
    cur.push(w);
    if (/[.!?]$/.test(w.w)) { sentences.push(cur); cur = []; }
  }
  if (cur.length) sentences.push(cur);
  const chunks = [];
  for (const sent of sentences) {
    const len = sent.reduce((n, x) => n + x.w.length + 1, 0) - 1;
    const parts = Math.ceil(len / maxChars);
    if (parts <= 1) { chunks.push(sent); continue; }
    // cut at word boundaries near equal character shares (re-balanced after each cut), preferring commas
    const lenOf = (ws) => ws.reduce((n, x) => n + x.w.length + 1, 0) - 1;
    const rest = sent.slice();
    let part = [];
    while (rest.length) {
      const remaining = lenOf(rest);
      const target = remaining / Math.max(1, Math.ceil(remaining / maxChars));
      part = [];
      let acc = 0;
      while (rest.length) {
        const w = rest.shift();
        part.push(w);
        acc += w.w.length + 1;
        if (rest.length > 1 && (acc >= target - 2 || (/,$/.test(w.w) && acc >= target * 0.6))) break;
      }
      if (rest.length) { chunks.push(part); part = []; }
    }
    if (part.length) chunks.push(part);
  }
  return chunks;
}

/** The narration word a scene's first click should land on (explicit cue, else label match). */
function cueWord(scene, words, click) {
  if (scene.cue) {
    const n = norm(scene.cue);
    return words.find((w) => norm(w.w).startsWith(n)) || null;
  }
  if (!click?.label) return null;
  const tokens = click.label.split(/\s+/).map(norm).filter((t) => t.length >= 3 && !STOP.has(t));
  if (!tokens.length) return null;
  return words.find((w) => tokens.includes(norm(w.w))) || null;
}

/**
 * Build the render plan (pure data) from a capture and the narrated scenes.
 * @param {object} cap     capture() result
 * @param {Array} scenes   enriched scenes: { id, narration, cue?, wavPath, audioSec, words? }
 * @param {object} o       { fps, introSec, outroSec, zoom, captions, assets: {voices[], click, whoosh} }
 */
export function buildPlan(cap, scenes, o) {
  const fps = o.fps ?? 30;
  const F = (s) => Math.round(s * fps);
  const INTRO = F(o.introSec ?? 2.4);
  const OUTRO = F(o.outroSec ?? 2.8);
  const XF = 15;
  const zMax = o.zoom ?? 1.7;
  const { css } = cap;
  const bodyFrom = INTRO - XF;
  const cap0 = cap.boundaries[0]?.tStart ?? 0;

  // ── segments: which stretch of the capture each scene plays ─────────────────
  const focusTypes = new Set(['click', 'input']);
  const segments = [];
  const voices = [];
  const allWords = [];
  for (const [i, sc] of scenes.entries()) {
    const b = cap.boundaries[i];
    const from = bodyFrom + F(b.tStart - cap0);
    const len = Math.max(1, F(b.tEnd - b.tStart));
    const words = (sc.words?.length ? sc.words : estimateWords(sc.narration || '', sc.audioSec))
      .map((w) => ({ w: String(w.w).trim(), s: w.s, e: w.e }))
      .filter((w) => w.w);
    const evs = cap.events.filter((e) => e.t >= b.tStart && e.t < b.tEnd);
    const firstClick = evs.find((e) => e.type === 'click');
    // Shift the footage so the click lands on its narration word. The shift is
    // taken out of (or added to) idle time, so it is limited by the idle tail.
    let shift = 0;
    const cue = cueWord(sc, words, firstClick);
    if (firstClick && cue) {
      const want = VO_LEAD + cue.s - 0.1 - (firstClick.t - b.tStart);
      const lastEv = Math.max(...evs.map((e) => e.t));
      const idleTail = Math.max(0, b.tEnd - lastEv - 0.35);
      const idleHead = Math.max(0, firstClick.t - b.tStart - 0.05);
      shift = clamp(want, -Math.min(idleTail, idleHead), idleTail);
    }
    segments.push({ id: sc.id, from, len, capStart: +(b.tStart).toFixed(3), capEnd: +(b.tEnd).toFixed(3), shift: +shift.toFixed(3), cue: cue?.w || null });
    const voFrom = from + F(VO_LEAD);
    voices.push({ src: o.assets.voices[i], from: voFrom, len: Math.ceil(sc.audioSec * fps) + 2 });
    for (const w of words) allWords.push({ w: w.w, f: voFrom + F(w.s), e: voFrom + F(w.e), scene: i });
  }
  const last = segments.at(-1);
  const bodyLen = last.from + last.len + F(0.3) - bodyFrom;
  const outroFrom = bodyFrom + bodyLen - XF;
  const total = outroFrom + OUTRO;

  // capture time → global frame (through the scene's shift)
  const frameOf = (t) => {
    let i = cap.boundaries.findIndex((b) => t >= b.tStart && t < b.tEnd);
    if (i < 0) i = t < cap0 ? 0 : segments.length - 1;
    const s = segments[i];
    return clamp(s.from + F(t - s.capStart + s.shift), s.from, s.from + s.len - 1);
  };

  // ── focus events: clicks, and the first keystroke of each typing burst ──────
  const focus = [];
  let lastInput = null;
  for (const e of cap.events) {
    if (e.type === 'click') {
      focus.push({ f: frameOf(e.t), kind: 'click', x: e.x, y: e.y, box: e.box, ctx: e.ctx, end: frameOf(e.t) });
    } else if (e.type === 'input' && e.box) {
      const f = frameOf(e.t);
      const same = lastInput && Math.abs(lastInput.box.x - e.box.x) < 2 && Math.abs(lastInput.box.y - e.box.y) < 2 && f - lastInput.end < F(1.5);
      if (same) { lastInput.end = f; continue; }
      lastInput = { f, kind: 'input', x: e.box.x + e.box.width / 2, y: e.box.y + e.box.height / 2, box: e.box, ctx: e.ctx, end: f };
      focus.push(lastInput);
    }
  }
  focus.sort((a, b) => a.f - b.f);
  // scrolls / navigations to another page zoom the camera out (a scroll right
  // before a click is Playwright bringing the target into view, and a #hash
  // change keeps the same page, so both are ignored)
  const page = (u) => String(u || '').split('#')[0];
  let url = cap.startUrl;
  const outs = cap.events
    .filter((e) => {
      if (e.type === 'scroll') return true;
      if (e.type !== 'nav') return false;
      const moved = page(e.url) !== page(url);
      url = e.url;
      return moved;
    })
    .map((e) => frameOf(e.t))
    .filter((f) => !focus.some((x) => x.f >= f && x.f - f < F(0.7)));

  // ── camera keys (css px, z = 1 is the whole window) ────────────────────────
  const full = { x: css.width / 2, y: css.height / 2, z: 1 };
  const viewFor = (fx) => {
    // frame the clicked control's context (its row / toolbar / card), centred on that block
    const b = fx.ctx || fx.box || { x: fx.x - 20, y: fx.y - 20, width: 40, height: 40 };
    const z = clamp(Math.min(css.width / (b.width * 1.35), css.height / (b.height * 1.35)), 1, zMax);
    const big = b.width > css.width * 0.6 || b.height > css.height * 0.6;
    return { x: big ? fx.x : b.x + b.width / 2, y: big ? fx.y : b.y + b.height / 2, z: +z.toFixed(3) };
  };
  const inside = (v, p, margin = 0.08) => {
    const hw = css.width / (2 * v.z), hh = css.height / (2 * v.z);
    const cx = clamp(v.x, hw, css.width - hw), cy = clamp(v.y, hh, css.height - hh);
    return Math.abs(p.x - cx) < hw * (1 - margin) && Math.abs(p.y - cy) < hh * (1 - margin);
  };
  const camera = [{ f: bodyFrom, ...full }];
  let zoomed = null;        // current view when zoomed in
  let activity = -1e9;      // frame of the last focus activity
  const zoomOut = (f) => {
    if (!zoomed) return;
    const at = Math.max(f, camera.at(-1).f + 8);
    camera.push({ f: at, ...full });
    zoomed = null;
  };
  for (const fx of focus) {
    for (const of of outs) if (zoomed && of > activity && of < fx.f - F(0.7)) zoomOut(of - 6);
    const view = viewFor(fx);
    const gap = fx.f - activity;
    if (zoomed && gap < F(6) && inside(zoomed, fx)) {
      // already in view: re-centre only if it moved a lot
      const hw = css.width / (2 * zoomed.z);
      if (Math.hypot(view.x - zoomed.x, view.y - zoomed.y) > hw * 0.35) {
        zoomed = { ...view, z: zoomed.z };
        camera.push({ f: Math.max(fx.f - CAM_LEAD, camera.at(-1).f + 8), ...zoomed });
      }
    } else if (zoomed && gap < F(2.5)) {
      zoomed = view;
      camera.push({ f: Math.max(fx.f - CAM_LEAD, camera.at(-1).f + 8), ...zoomed });
    } else {
      if (zoomed) zoomOut(Math.min(activity + F(1.5), fx.f - CAM_LEAD - F(0.9)));
      zoomed = view;
      camera.push({ f: Math.max(fx.f - CAM_LEAD, camera.at(-1).f + 8), ...zoomed });
    }
    activity = Math.max(fx.end, fx.f);
  }
  for (const of of outs) if (zoomed && of > activity) zoomOut(of - 6);
  if (zoomed) zoomOut(Math.min(activity + F(2.2), outroFrom - F(1)));

  // ── cursor: glide into every click ──────────────────────────────────────────
  const clicks = focus.filter((x) => x.kind === 'click').map((x) => ({ f: x.f, x: +x.x.toFixed(1), y: +x.y.toFixed(1) }));

  // ── captions ───────────────────────────────────────────────────────────────
  const captions = [];
  if (o.captions !== false) {
    for (let i = 0; i < scenes.length; i++) {
      const ws = allWords.filter((w) => w.scene === i);
      for (const ch of chunkWords(ws)) captions.push({ from: ch[0].f - 3, end: ch.at(-1).e + 10, words: ch.map((w) => ({ w: w.w, f: w.f })) });
    }
    for (let i = 0; i < captions.length - 1; i++) captions[i].end = Math.min(captions[i].end, captions[i + 1].from);
  }

  // ── sound effects ──────────────────────────────────────────────────────────
  const sfx = [];
  if (o.assets.click) for (const c of clicks) sfx.push({ src: o.assets.click, from: Math.max(0, c.f - 1), volume: 0.35 });
  if (o.assets.whoosh) {
    sfx.push({ src: o.assets.whoosh, from: Math.max(0, bodyFrom - 6), volume: 0.18 });
    sfx.push({ src: o.assets.whoosh, from: Math.max(0, outroFrom - 6), volume: 0.18 });
  }

  return {
    fps, total,
    intro: { from: 0, len: INTRO },
    body: { from: bodyFrom, len: bodyLen },
    outro: { from: outroFrom, len: OUTRO },
    xf: XF,
    segments, camera, clicks, captions, voices, sfx,
  };
}

/**
 * Render a studio video.
 * @param {object} o
 * @param {object} o.cap       capture() result
 * @param {Array}  o.scenes    enriched scenes
 * @param {string} o.slug
 * @param {string} o.outMp4
 * @param {object} o.look      { title, subtitle, outroTitle, outroSubtitle, colors:[c0,c1], logo, watermark, address, music, musicGain, zoom, captions, introSec, outroSec, fps }
 */
export async function renderStudio({ cap, scenes, slug, outMp4, look }) {
  if (!existsSync(path.join(MOTION, 'node_modules', '@remotion', 'cli'))) {
    throw new Error('Studio mode needs Remotion: run `cd motion && npm install` once.');
  }
  const rel = `studio/${slug}`;
  const pub = path.join(MOTION, 'public', rel);
  rmSync(pub, { recursive: true, force: true });
  mkdirSync(pub, { recursive: true });

  copyFileSync(cap.videoPath, path.join(pub, 'capture.mp4'));
  const voices = scenes.map((sc, i) => {
    const name = `voice-${String(i).padStart(2, '0')}.wav`;
    copyFileSync(sc.wavPath, path.join(pub, name));
    return `${rel}/${name}`;
  });
  let logo = null;
  if (look.logo && existsSync(look.logo)) {
    const name = `logo${path.extname(look.logo)}`;
    copyFileSync(look.logo, path.join(pub, name));
    logo = `${rel}/${name}`;
  }
  let music = null;
  if (look.music && existsSync(look.music)) {
    const name = `music${path.extname(look.music)}`;
    copyFileSync(look.music, path.join(pub, name));
    music = { src: `${rel}/${name}`, gain: look.musicGain ?? 1 };
  }

  const plan = buildPlan(cap, scenes, {
    fps: look.fps ?? 30,
    introSec: look.introSec,
    outroSec: look.outroSec,
    zoom: look.zoom,
    captions: look.captions,
    assets: { voices, click: 'sfx/click.wav', whoosh: 'sfx/whoosh.wav' },
  });

  const props = {
    ...plan,
    width: 1920,
    height: 1080,
    capture: { src: `${rel}/capture.mp4`, css: cap.css, fps: cap.fps, duration: +cap.duration.toFixed(3) },
    title: look.title || '',
    subtitle: look.subtitle || '',
    outroTitle: look.outroTitle || look.title || '',
    outroSubtitle: look.outroSubtitle || '',
    colors: (look.colors || ['0x1f7a5a', '0x14233f']).map(hex),
    accent: hex(look.accent || '#34d399'),
    address: look.address || '',
    logo,
    watermark: look.watermark !== false && !!logo,
    music,
  };
  const propsPath = path.join(pub, 'props.json');
  writeFileSync(propsPath, JSON.stringify(props, null, 1));
  const shifted = plan.segments.filter((s) => s.cue).map((s) => `${s.id}→"${s.cue}" ${s.shift >= 0 ? '+' : ''}${s.shift.toFixed(2)}s`);
  console.log(`  plan: ${(plan.total / plan.fps).toFixed(1)}s · ${plan.camera.length} camera keys · ${plan.clicks.length} clicks · ${plan.captions.length} caption chunks${shifted.length ? ` · cues: ${shifted.join(', ')}` : ''}`);

  const t0 = Date.now();
  const extra = look.concurrency ? [`--concurrency=${look.concurrency}`] : [];
  await exec('npx', ['remotion', 'render', 'src/index.ts', 'Studio', outMp4, `--props=${propsPath}`, '--log=error', ...extra],
    { cwd: MOTION, maxBuffer: 64 * 1024 * 1024 });
  console.log(`  remotion render: ${Math.round((Date.now() - t0) / 1000)}s`);
  // Remotion copies all of public/ into every bundle, so per-render files are not
  // left behind there; the props stay next to the capture for debugging.
  copyFileSync(propsPath, path.join(path.dirname(cap.videoPath), 'props.json'));
  rmSync(pub, { recursive: true, force: true });
  return { plan, props };
}
