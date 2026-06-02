# demo-pipeline — agent guide

## What this is

A local pipeline that produces a click-through demo video for a web app.
No SaaS, no manual recording. You give it a config file, it outputs an `.mp4`.

**Location on disk:** `/Users/phktistakis/Devoloper Projects/demo-pipeline/`

## How it works — 4 steps

1. **Narrate** — synthesise each scene's narration text to a WAV file (TTS backend: OpenAI / ElevenLabs / Kokoro / macOS `say`).
2. **Record** — Playwright drives Chromium headless through the app, recording a `.webm`. Each scene waits long enough for its audio to play.
3. **Track** — concat per-scene WAVs with silence padding into one narration track, timed to match the video.
4. **Mux** — ffmpeg merges video + audio into `output/<project>-demo-<tts>.mp4` (H.264 CRF 17, AAC 192k).

## Prerequisites

All must be on PATH / installed once:
- `ffmpeg` (brew install ffmpeg)
- Node ≥ 20 (ESM)
- Chromium for Playwright: `cd` into this dir, run `npm run install-browsers`
- For Kokoro: first run auto-downloads ~330 MB model to `~/.cache/huggingface/`

## Run a demo

```bash
# 1. Start the target app (separate terminal)
cd "/Users/phktistakis/Devoloper Projects/Greenpert" && npm run dev

# 2. Render — default backend is what the project config declares (openai for greenpert)
cd "/Users/phktistakis/Devoloper Projects/demo-pipeline"
node pipeline.mjs greenpert

# Override TTS backend
node pipeline.mjs greenpert --tts=kokoro
node pipeline.mjs greenpert --tts=openai --voice=nova --model=tts-1-hd
node pipeline.mjs greenpert --tts=elevenlabs --voice=<voice-id>
node pipeline.mjs greenpert --tts=say --voice=Samantha

# --suffix=<label> names the output file; defaults to the backend name
node pipeline.mjs greenpert --tts=openai --suffix=v2
```

Output lands in:
```
/Users/phktistakis/Devoloper Projects/demo-pipeline/output/<project>-demo-<suffix>.mp4
```

## TTS backends

| Backend | Quality | Cost per ~90s video | Notes |
|---|---|---|---|
| `openai` | Very good | ~$0.04 (tts-1-hd) / ~$0.02 (tts-1) | Recommended default. Key in `.env`. |
| `elevenlabs` | Excellent | ~$0.12 (turbo) | Needs paid account + correct API key scopes. |
| `kokoro` | Good | $0.00 | Local, ~330 MB download once. Voice ids: `af_bella`, `am_michael`, `bf_emma`, `bm_george`. |
| `say` | Robotic | $0.00 | Fallback. macOS only. Voice name = macOS voice e.g. `Samantha`. |

Cost guard: pipeline reads `MAX_COST_PER_VIDEO` from `.env` (default `0.20`) and aborts before API calls if estimate exceeds it.

## API keys — `.env`

File lives at `/Users/phktistakis/Devoloper Projects/demo-pipeline/.env` (chmod 600, git-ignored).

Required keys:
```
OPENAI_API_KEY=...
ELEVENLABS_API_KEY=...
MAX_COST_PER_VIDEO=0.20
```

Never read or log this file's contents. Never commit it.

## Adding a new project

1. Create `projects/<name>.mjs` — use `projects/greenpert.mjs` as template.
2. Export a default object with these fields:

```js
export default {
  name: 'My App',                          // display name
  url: 'http://localhost:3000',            // base URL of running app
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 2,                    // 2 = retina-sharp, 3 = heavier
  tts: {
    backend: 'openai',                     // default backend for this app
    model: 'tts-1-hd',
    voice: 'nova',                         // openai: alloy|echo|fable|onyx|nova|shimmer
  },
  video: { crf: 17, preset: 'slow' },      // ffmpeg encode settings
  scenes: [
    {
      narration: 'Text that will be spoken during this scene.',
      action: async (page) => {
        // Playwright actions — clicks, navigation, scroll, waits.
        // page is a Playwright Page. The scene waits until both:
        // (a) action completes AND (b) narration audio duration elapses.
        await page.getByRole('link', { name: /Strains/i }).click();
        await page.waitForLoadState('domcontentloaded');
      },
    },
    // … more scenes
  ],
};
```

3. Start the app, then `node pipeline.mjs <name>`.

## Investigating a new app before writing scenes

Use `inspect.mjs` to screenshot every route and dump headings/buttons/links:

```bash
# Edit inspect.mjs: change `routes` array and base URL to match target app.
node inspect.mjs
# Screenshots land in tmp/gp-*.png for visual reference.
```

## Lib files (internals — do not break the interface)

| File | Responsibility |
|---|---|
| `lib/narrate.mjs` | Dispatches `narrate(text, opts, outWavPath)` to TTS backend. Returns `{durationSec, charsUsed}`. |
| `lib/record.mjs` | `record(cfg)` — launches Playwright, steps through scenes, returns `.webm` path. |
| `lib/merge.mjs` | `buildNarrationTrack(scenes, outWav, workDir)` + `muxToMp4(cfg)` |
| `lib/cost.mjs` | `assertWithinBudget(backend, model, chars, capUSD)` — throws if over budget. |

## Known issues / gotchas

- **ElevenLabs free tier** — library voices blocked via API. Needs Starter ($5/mo) plan OR a personal cloned voice. Also needs a key with `text_to_speech` scope (regenerate in ElevenLabs dashboard).
- **Age-gate / cookie banners** — handle inside the first scene's `action` using `dismissAgeGate`-style helper. See `projects/greenpert.mjs` for pattern.
- **Selector drift** — if a button/link label changes in the app, Playwright silently skips it and logs `[scene N] action error`. Fix: update the `getByRole` / `getByText` call in the config.
- **Dev server port** — if target app starts on a non-3000 port, update `url` in the project config.
- **Kokoro model location** — cached at `~/.cache/huggingface/hub/`. Delete to force re-download. First run can take 30–60s to load into memory.
- **tmp/ is wiped each run** — safe to delete manually if disk is tight.

## Phase 2 — adding more projects

Each project needs only its own `projects/<name>.mjs`. The pipeline, lib, and .env are shared. Workflow per new project:

1. Run `node inspect.mjs` (edit routes/URL first) → read terminal output + screenshots.
2. Write scenes list from what you see + the project's README.
3. Run once with `--tts=say` first (free, fast) to verify click flow, then switch to `openai` or `kokoro` for final render.
