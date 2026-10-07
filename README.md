# demo-pipeline

Generates a click-through demo video for a web app. Playwright records the browser, TTS narrates each scene, ffmpeg stitches them into a 1080p MP4 — with optional cinematic zoom, animated cursor, intro/outro cards, logo watermark, and subtitles.

**Stack:** Playwright · edge-tts / OpenAI / Kokoro / ElevenLabs / macOS `say` · ffmpeg

## Modes

| Mode | What you get |
|---|---|
| `simple` | Plain continuous screen recording + narration. Fast. |
| `zoom` | Cinematic landscape: per-scene push-in zoom toward each click, animated fake cursor + click ripple, intro & outro title cards, logo watermark, subtitles. |
| `short` | Vertical social cut (TikTok/Reels/Shorts): portrait 9:16, punchier zoom, snappy cards, big burned captions. Pair with `--preset=highlights` for a fast, engaging clip. |
| `studio` | Highest quality, landscape. A sharp capture (Chrome screencast at 2× resolution) composed in Remotion: browser window on a gradient, camera that springs to each click and frames its row/toolbar, drawn cursor with click ripples, each click landing on its narration word, word-lit captions, animated intro/outro, click and transition sounds, optional ducked music. Needs `cd motion && npm install` once. |

```bash
node pipeline.mjs greenpert --mode=zoom                      # landscape cinematic
node pipeline.mjs greenpert --mode=short --preset=highlights  # vertical reel
node pipeline.mjs todomvc --mode=studio                       # studio quality (public demo site)
```

### Studio mode

```bash
cd motion && npm install && cd ..        # once: Remotion
node pipeline.mjs todomvc --mode=studio
node pipeline.mjs --url=https://site.com --mode=studio
```

Options: `--viewport=1600x900` (CSS size of the captured browser; captured at 2×), `--zoom=1.7` (max camera zoom),
`--music=<file>` (ducked under the voice), `--subs=off` (no captions), `--watermark=off`, `--concurrency=<n>` (Remotion).
A scene may set `cue: 'word'` so its first click lands on that spoken word; without it, the click lands on the first
narration word that matches the clicked element's label (e.g. "Active" for an Active link). Project configs can set
`studio: { viewport, dpr, zoom, colors, accent, music, musicGain, captions, watermark }`.

Word timings come free with `--tts=edge`; other voices fall back to estimated timings (captions still follow the voice,
cue matching is a little less exact). Render time is about 6× the video length on an M2 laptop (35 s video ≈ 3.5 min),
plus the capture itself (real time). No API cost beyond the voice. Remotion is free for individuals and companies of
up to 3 people; larger companies need a Remotion company licence.

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

Output: `output/<project>-demo-<mode>-<backend>.mp4` (+ `.srt` when `--subs=sidecar`)

## TTS backends

| Backend | Quality | Cost (~90s video) | Notes |
|---|---|---|---|
| `edge` | Very good | **Free** | Microsoft neural voices, no key. Voices: `en-US-AvaMultilingualNeural` `en-US-AndrewMultilingualNeural` `en-US-EmmaMultilingualNeural` `en-US-BrianMultilingualNeural`. Unofficial endpoint (auto-retries). |
| `openai` | Very good | ~$0.02 (`gpt-4o-mini-tts`) / ~$0.04 (`tts-1-hd`) | Voices: `alloy` `echo` `fable` `onyx` `nova` `shimmer` `sage` `coral` |
| `kokoro` | Good | Free | Local 82M model, downloads once (~330 MB), fully offline. Voices: `af_bella` `am_michael` `bm_george` `bf_emma` |
| `elevenlabs` | Excellent | ~$0.12 (turbo) | Needs Starter plan + API key with `text_to_speech` scope |
| `say` | Robotic | Free | macOS only. Voices: `Samantha` `Daniel` `Karen` |

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

## Lib interface (for agents/contributors)

```
lib/narrate.mjs   narrate(text, opts, outWavPath) → { durationSec, charsUsed }   (edge|openai|elevenlabs|kokoro|say)
lib/record.mjs    record(cfg) → { webmPath, boundaries, clicks, bodyStart }       (injects cursor + logs clicks)
lib/effects.mjs   buildCinematic({ webmPath, scenes, boundaries, clicks, ... })   (mode 2: zoom, cards, logo, subs)
lib/capture.mjs   capture(cfg) → { videoPath, css, dpr, boundaries, events }      (studio: sharp CDP screencast + click/typing/scroll log)
lib/studio.mjs    buildPlan(cap, scenes, o) · renderStudio({...})                 (studio: timing plan → Remotion motion/src/studio)
lib/subtitle.mjs  buildSrt(scenes, offsetSec, prerollSec) → SRT string
lib/merge.mjs     buildNarrationTrack(...) · muxToMp4({...})                       (mode 1)
lib/cost.mjs      assertWithinBudget(backend, model, chars, capUSD)
```

See `AGENTS.md` for full agent/LLM usage guide.

## Motion videos (built as code, no screen recording)

`motion/` is a second, separate way to make product videos: the product's screens are rebuilt as React components with [Remotion](https://www.remotion.dev), narration comes from TTS with word timings, and every animation lands on the spoken word. One set of scenes renders as light, dark, silent-captioned and vertical (9:16) cuts. Start with [`motion/README.md`](motion/README.md); a small fictional example product ("Acme Tasks") is included.

**Claude skill:** [`skills/product-video`](skills/product-video/SKILL.md) teaches Claude Code the whole workflow. Install it with `cp -r skills/product-video ~/.claude/skills/` and ask for "a product video for <your app>".

## License

MIT
