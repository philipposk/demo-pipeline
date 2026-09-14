# demo-pipeline

Generates a click-through demo video for a web app. Playwright records the browser, TTS narrates each scene, ffmpeg stitches them into a 1080p MP4 — with optional cinematic zoom, animated cursor, intro/outro cards, logo watermark, and subtitles.

**Stack:** Playwright · edge-tts / OpenAI / Kokoro / ElevenLabs / macOS `say` · ffmpeg

## Modes

| Mode | What you get |
|---|---|
| `simple` | Plain continuous screen recording + narration. Fast. |
| `zoom` | Cinematic landscape: per-scene push-in zoom toward each click, animated fake cursor + click ripple, intro & outro title cards, logo watermark, subtitles. |
| `short` | Vertical social cut (TikTok/Reels/Shorts): portrait 9:16, punchier zoom, snappy cards, big burned captions. Pair with `--preset=highlights` for a fast, engaging clip. |

```bash
node pipeline.mjs greenpert --mode=zoom                      # landscape cinematic
node pipeline.mjs greenpert --mode=short --preset=highlights  # vertical reel
```

## Aspect ratios

`--format=landscape|portrait|square|4:5` (recording is always 16:9; the effects layer reframes).
`--strategy=blur|crop` — how a 16:9 source fits a vertical frame:
- `blur` (default): whole frame centered, blurred copy fills the margins — nothing lost.
- `crop`: crop+follow the click point — fills the screen, may cut the sides.

```bash
node pipeline.mjs greenpert --mode=zoom --format=square
node pipeline.mjs greenpert --mode=short --strategy=crop
```

## Pick / reorder which features appear

Every scene can declare `id`, `title`, `tags`, `priority` (0-100). Then:

```bash
--preset=full|highlights|basic     # full=all · highlights=top/spread · basic=core 3
--scenes=s0,s3,s10                 # explicit set (overrides preset)
--order=s10,s0,s3                  # explicit order
--exclude=s5                       # drop scenes
--dry-run                          # print the resolved list, render nothing
```

```bash
node pipeline.mjs greenpert --preset=basic --dry-run
node pipeline.mjs greenpert --scenes=s0,s3,s6,s10 --order=s3,s0,s6,s10
```

## One-time setup

```bash
npm install
npm run install-browsers   # downloads Chromium (~150 MB)
brew install ffmpeg        # if not already installed
```

Copy `.env.example` to `.env` and fill in your keys (only needed for paid backends):

```
OPENAI_API_KEY=sk-...
ELEVENLABS_API_KEY=sk_...
MAX_COST_PER_VIDEO=0.20   # hard abort if estimate exceeds this
```

## Run a demo

```bash
# 1. Start the target app (separate terminal)
cd ~/path/to/your-app && npm run dev

# 2. Render
node pipeline.mjs greenpert --mode=zoom

# Override TTS backend
node pipeline.mjs greenpert --tts=edge            # free, realistic (recommended)
node pipeline.mjs greenpert --tts=kokoro          # free, local, offline
node pipeline.mjs greenpert --tts=openai --model=gpt-4o-mini-tts  # ~$0.02/video
node pipeline.mjs greenpert --tts=say             # macOS fallback

# Subtitles: off | sidecar (.srt next to mp4) | burn (into the picture)
node pipeline.mjs greenpert --mode=zoom --subs=burn
```

Output: `output/<project>-demo-<mode>-<format>-<backend>[-<preset>][-<lang>].mp4` (+ `.srt` when `--subs=sidecar`)

## Deal Agent (`projects/dealagent.mjs`)

```bash
node pipeline.mjs login dealagent                                    # once: log in yourself with the DEMO fund account
node pipeline.mjs dealagent --mode=zoom                              # 60–90 s landscape ad
node pipeline.mjs dealagent --mode=short --preset=highlights         # 20–30 s vertical reel
node pipeline.mjs dealagent --mode=zoom --format=square --preset=highlights
node pipeline.mjs dealagent --mode=zoom --lang=da                    # Danish narration
node pipeline.mjs dealagent --preset=public --mode=zoom              # login + signup pages only, no login needed
```

Record from a dedicated demo fund, never a customer's. The label, deal-move and Egon steps write to that account; `DEALAGENT_READONLY=1` skips every write. Logo: this repo is public, so the Valuer mark isn't committed. Copy `src/assets/valuer-logo22.png` from the frontend repo to `assets/brand/dealagent-logo.png` (git-ignored) to show it on the cards and as a watermark.

## TTS backends

| Backend | Quality | Cost (~90s video) | Notes |
|---|---|---|---|
| `edge` | Very good | **Free** | Microsoft neural voices, no key. Voices: `en-US-AvaMultilingualNeural` `en-US-AndrewMultilingualNeural` `en-US-EmmaMultilingualNeural` `en-US-BrianMultilingualNeural`. Danish: `da-DK-ChristelNeural` `da-DK-JeppeNeural`. Unofficial endpoint (auto-retries); Microsoft publishes no terms for it. |
| `openai` | Very good | ~$0.02 (`gpt-4o-mini-tts`) / ~$0.04 (`tts-1-hd`) | Voices: `alloy` `echo` `fable` `onyx` `nova` `shimmer` `sage` `coral` |
| `kokoro` | Good | Free | Local 82M model, downloads once (~330 MB), fully offline. Voices: `af_bella` `am_michael` `bm_george` `bf_emma`. No Danish. |
| `elevenlabs` | Excellent | ~$0.12 (turbo) | Needs Starter plan + API key with `text_to_speech` scope. Free tier is non-commercial. Speaks Danish (`eleven_multilingual_v2`, `eleven_flash_v2_5`). |
| `say` | Robotic | Free | macOS only. Voices: `Samantha` `Daniel` `Karen`. Danish: `Sara`. |

**Voice clone (your own voice):** Chatterbox (free, local, MIT) or ElevenLabs. Not yet wired — see `AGENTS.md` roadmap.

## Add a new project

Create `projects/<name>.mjs`. Use `projects/greenpert.mjs` as a template.

Key fields:

```js
export default {
  name: 'My App',
  url: 'http://localhost:3000',
  viewport: { width: 1920, height: 1080 },
  tts: { backend: 'openai', model: 'tts-1-hd', voice: 'nova' },
  video: { crf: 17, preset: 'slow' },
  scenes: [
    {
      narration: 'Text spoken during this scene.',
      action: async (page) => {
        // Playwright — clicks, navigation, scroll.
        // Scene waits until both action + audio duration complete.
        await page.getByRole('link', { name: /Dashboard/i }).click();
        await page.waitForLoadState('domcontentloaded');
      },
    },
  ],
};
```

Run `node inspect.mjs` first (edit the `routes` array inside) to screenshot every route and dump available buttons/links — helps you write accurate selectors.

## Apps behind a login (no passwords in the pipeline)

Add an `auth` block to the project (see `projects/dealagent.mjs`), then log in **once, yourself**:

```bash
node pipeline.mjs login <project>     # opens a real browser window; you log in; the session is saved
node pipeline.mjs <project> ...       # every render starts logged in
```

- The session lands in `.auth/<project>.json` (git-ignored, chmod 600). It holds live login tokens: treat it like a password.
- The pipeline never types, reads or stores credentials. It only reuses the browser session you created.
- After each render the refreshed session is written back, so apps that rotate refresh tokens keep working.
- A render that stops with "Saved session is no longer valid" just needs the `login` command again.
- Scenes tagged `public` don't need the session: `--preset=public` renders without logging in.
- Run one render at a time (renders share the saved session and `output/.cine-work`).

## Privacy blur

A project `mask` block blurs personal data inside the page before it is recorded, in every mode:

```js
mask: { emails: true, patterns: ['\\b\\d{6}-\\d{4}\\b'], selectors: ['[data-private]'], blurPx: 8 }
```

Emails and identity-provider user ids (`auth0|…`) are blurred by default; `patterns` and `selectors` add more. `--mask=off` turns it off for an internal cut.

## Languages, short copy and other project options

- Any scene text, and intro/outro `title`/`subtitle`, can be `{ en: '…', da: '…' }`. Pick with `--lang=da`; `ttsByLang` sets the voice per language.
- `shortNarration` on a scene replaces its narration in `--mode=short` (reels need punchier lines).
- `startUrl` on a scene: where recording starts when that scene comes first.
- `viewports: { portrait, square }`: record vertical/square cuts at a smaller size so the UI reads larger.
- `contextOptions` (Playwright context: colour scheme, locale, time zone) and `initScripts` (run in the page before the app's own scripts).
- Scene actions get `(page, ctx)` with `ctx = { mode, format, lang, preset, state }`.
- `--dry-run` also prints an estimated length, so presets can be tuned without rendering.

## Lib interface (for agents/contributors)

```
lib/narrate.mjs   narrate(text, opts, outWavPath) → { durationSec, charsUsed }   (edge|openai|elevenlabs|kokoro|say)
lib/record.mjs    record(cfg) → { webmPath, boundaries, clicks, bodyStart }       (injects cursor + logs clicks)
lib/auth.mjs      login(cfg, statePath) · assertLoggedIn(page, auth, cmd)          (saved-session login, no credentials)
lib/mask.mjs      resolveMask(cfg.mask, flag) · maskInitScript(opts)                (in-page privacy blur)
lib/effects.mjs   buildCinematic({ webmPath, scenes, boundaries, clicks, ... })   (mode 2: zoom, cards, logo, subs)
lib/subtitle.mjs  buildSrt(scenes, offsetSec, prerollSec) → SRT string
lib/merge.mjs     buildNarrationTrack(...) · muxToMp4({...})                       (mode 1)
lib/cost.mjs      assertWithinBudget(backend, model, chars, capUSD)
```

See `AGENTS.md` for full agent/LLM usage guide.

## License

MIT
