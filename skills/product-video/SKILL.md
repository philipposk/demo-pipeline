---
name: product-video
description: Make a motion-designed product, demo, explainer or how-to video (short promo, feature walkthrough) for an app or website. Builds the UI as React code with Remotion, adds AI narration timed to the words, and renders light/dark and wide/vertical cuts with no screen recording.
---

# Product video (Remotion engine)

Builds a 15-90 s video where the product's screens are rebuilt as code, animations land on spoken words, and one set of scenes renders as light, dark, silent-captioned and phone (9:16) cuts.

The engine is a folder called `motion/`. Its README is the full reference: read it completely before starting. This skill is the workflow; do not duplicate the README.

## 0. Prerequisites

- Node 20+, `ffmpeg` and `ffprobe` on PATH (`ffmpeg -version` to check).
- `OPENAI_API_KEY` for narration (gpt-4o-mini-tts) and as word-timing fallback (Whisper). `DEEPGRAM_API_KEY` is optional: tighter word timings (nova-3) when present. `GEMINI_API_KEY` only for `VOICE_PROVIDER=gemini`.
- Keys live in `motion/.env` (gitignored; template `.env.example`). Never print them, never echo them in commands, never commit `.env`. If a key is missing, ask the user to add it to `.env` themselves. Without keys you can still render the committed example voice.
- Remotion is free for individuals and small companies, paid above that. Tell the user to check remotion.dev/license if this is for a larger company.

## 1. Get the engine

- Remote: `git clone https://github.com/philipposk/demo-pipeline` and use its `motion/` folder.
- Or use a local path the user gives you.
- Work in a copy or a branch, not in someone else's live render folder.
- `cd motion && npm install`. Then smoke test: `node scripts/render.mjs acme:light` (about 35 s) and look at `out/sheet-acme-light-nomusic.jpg`.

## 2. Study the product (before writing anything)

1. List shipped features and the file or route behind each. Only shipped features go in the video.
2. Read the real design tokens: fonts, light and dark colours, radii, borders/shadows, logo SVG, accents. Prefer reading the code; use screenshots if no code is available.
3. Read existing marketing copy for the hero line, pitch, pricing facts. Do not invent claims.
4. Invent ONE consistent fake scenario (company, people, tasks, numbers) used in every scene.
5. Decide the goal and length: promo (30-60 s) or how-to for one feature (15-40 s). Ask the user only if the audience or call to action is unclear.

## 3. Write the script

Create `src/scripts/<id>.json`: a list of `{id, text, minSec?, holdSec?, caption?, speed?}`, one line per scene. Format and rules are in README 4.2. Essentials:

- About 110 words per 55 s. One idea per line, short sentences, concrete nouns.
- Structure: hook, name reveal, input, core output, organisation, unique features, sharing, end card (name + call to action). A repeated refrain gives rhythm.
- Every claim maps to a shipped feature. No speed claims ("in seconds") unless measured.
- No hard pause after a single word ("One: ..."); write "First, ...". The pause cap clips it.
- Say the product name in the reveal and on the end card.
- Give each line a `caption` for the silent cut.
- No dead air: keep scene length minus (lead + voice) at about 1 s or less, unless an animated end card fills it. Any extra `minSec` needs matching motion (`Drift`).
- Show the script to the user for approval before spending on voice.

## 4. Voice

```bash
node scripts/voice.mjs --script=<id>      # tag defaults to the script id
```

Voice cost is a fraction of a cent for a few lines, a few cents for a minute. Output: processed audio in `public/voice/<tag>/`, `src/timelines/<tag>.json` (word timings, scene lengths), `out/<tag>.vtt`. Re-run only for changed lines (TTS is cached). `--retime` refetches timings only. Change style with `PACE=fast` or `VOICE=cedar`.

## 5. Build the scenes

Copy the example: `cp -r src/acme src/<id>`; rename the Demo; edit `SCENES` (script line id to scene component). Read `src/acme/scenes.tsx` and `kit.tsx` first, and copy their patterns.

- Rebuild UI fragments as React components using the product's real tokens. Put the logo and named colours in the product folder, not the engine kit. Apply tokens with an `apply<Product>Theme` that does `Object.assign(C, {...})` (README section 3, step 4) so one composition renders both themes.
- Time motion to speech with `useTiming(sc)`: `at('word', n, fallbackFrame)`, `wi(n, fallbackFrame)`.
- Show ONE fragment at a time, large, never a full screen. Push the camera in after a click (scale about 1.2). Build lists row by row on spoken words.
- Use fixed sizes for cards and rows so cursor targets are arithmetic; put the `Cursor` inside the element it clicks.
- Clamp late animations to the scene length so a fast cut does not chop them.
- Phone cut: branch on `format === 'vertical'` in the Demo and write camera keys in `vertical.ts` (README 4.5). Keep UI at z 0.85-1.15.
- Real-app footage (`capture/record.mjs`) is optional and a last resort; sign-in and waiting cost days. Prefer rebuilt UI.

## 6. Register the product

Two places; nothing else in the engine changes:

1. `src/products.json`: `"<Product>": {"scripts": ["<id>"], "music": null, "vertical": true}`. The key is the composition prefix.
2. `src/products.ts`: `import {<Name>Demo} from './<id>/Demo';` and add `<Product>: <Name>Demo` to `DEMOS`.

More cuts of one product: add another script id to `scripts`, then `node scripts/voice.mjs --script=<id> --tag=<tag>`. Each tag becomes composition `<Product>-<tag>`. Timelines must carry a `script` field. Run `npx tsc --noEmit` after wiring.

## 7. QA with stills (cheap) before any render (slower)

```bash
node scripts/stills.mjs <tag> light                 # also: dark; VERTICAL=1; SILENT=1; COLS=6
VERTICAL=1 COLS=6 node scripts/stills.mjs <tag> light $(node scripts/vspecs.mjs <tag>)
```

Read the images yourself (Read tool). Check: cropped or empty frames, text overflow, cursor/ring misaligned with its target, wrong claims, light and dark separately, vertical safe areas and caption overlap. Fix, re-run stills, repeat. Only the changed scenes need re-checking.

## 8. Render variants

```bash
node scripts/render.mjs <tag>:light ... <tag>:dark ... <tag>:light::vertical <tag>:light::silent
# format: <tag>:<theme>:<music>[:silent][:vertical]
```

Run one render at a time. After every render check the freeze warning (ffmpeg freezedetect) and fix anything frozen over 0.5 s (cut `minSec`/`holdSec`, or add motion); `STRICT_MOTION=1` makes it fail. Each writes `out/<name>.mp4` and a contact sheet `out/sheet-<name>.jpg`; read the sheet. Check audio levels with `ffmpeg -i X.mp4 -af volumedetect -f null -`. Music is optional: none ships. To add one, follow README section 7 (royalty-free source whose licence you have read, loudnorm, save in `public/music/`, record in `SOURCES.txt`). Delete old renders from `out/` when done.

## 9. Web copies and poster

```bash
node scripts/web.mjs out/X.mp4 out/site/demo-light 12.5   # mp4 (under 10 MB) + poster from a UI-rich frame
cp out/<tag>.vtt out/site/demo.vtt
```

Use brand-neutral file names. Embed `<video preload="none">` per theme; add a "Narrated with an AI voice" note. If the video already shows bottom text, put VTT cues at `line:5%` and do not make the track default (README 8).

## 10. Quality bar

- Calm, premium, readable: big serif headline bursts of 2-4 words with an italic punch word, springy scale-ins, blur-dissolve scene changes, almost no hard cuts, each beat 1-2.5 s.
- UI is crisp at 3-4x zoom, uses the product's real fonts and colours, one fragment at a time.
- Every animation lands on its spoken word; no dead frames; no cut-off content in any variant.
- Voice bright, warm, brisk (about 180 wpm), no hype words.
- Audio: voice clear, music (if any) ducked under it, no clipping.

## 11. Lessons that save days

- Do not screen-record the live app unless forced; rebuild the UI.
- Fixed-height flex columns shrink rows and make rings/cursors drift. Use fixed sizes, measure from a still.
- Brand spellings the recogniser mangles still read right in captions (script spelling at STT timings).
- Remotion audio component is `Html5Audio`; a `volume` callback gets the frame relative to the audio's own start.
- zsh does not word-split `$var` in `for` loops; BSD `sed` has no `\b`; Node ESM resolves packages relative to the script file.
- Never run dev servers or renders in the background and in parallel with others; one process at a time.

## 12. Safety and honesty

- Invented companies, people and data only. No real customer data, real names, emails, or screenshots of real accounts.
- Do not imitate another real company's brand. Use only the user's own product tokens and logo.
- The voice is synthetic: say so wherever the video is published ("Narrated with an AI voice"), and in the video itself if the platform or product policy requires it.
- Music and sound: use only sources whose licence permits the use; record the source.
- Never print, log or commit API keys. Never push or deploy anything without the user's explicit instruction.

## 13. Cost and time

- Voice: under a cent for ~15 s, a few cents for a minute. Rendering is local and free.
- Example (17 s) renders in about 35 s; a 60 s video with all four variants takes roughly 10-15 min of render time.
- Realistic effort for a new product: study and script 30 min, scenes 2-4 h of iteration with stills, final renders and web copies 30 min.
- Disk: each render adds several MB in `out/`.

## Reporting

When done, give the user: the output paths (mp4s, posters, VTT), the list of variants, anything unverified (e.g. silent cut checked by stills only), and the AI-voice disclosure reminder.
