# demo-pipeline

Generates a click-through demo video for a web app. Playwright records the browser, TTS narrates each scene, ffmpeg stitches them into a 1080p MP4.

**Stack:** Playwright · OpenAI TTS / Kokoro (local) / ElevenLabs / macOS `say` · ffmpeg

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
node pipeline.mjs greenpert

# Override TTS backend
node pipeline.mjs greenpert --tts=kokoro          # free, local
node pipeline.mjs greenpert --tts=openai          # ~$0.04/video
node pipeline.mjs greenpert --tts=say             # macOS fallback
```

Output: `output/<project>-demo-<backend>.mp4`

## TTS backends

| Backend | Quality | Cost (~90s video) | Notes |
|---|---|---|---|
| `openai` | Very good | ~$0.04 (tts-1-hd) | Default. Voices: `alloy` `echo` `fable` `onyx` `nova` `shimmer` |
| `kokoro` | Good | Free | Local 82M model, downloads once (~330 MB). Voices: `af_bella` `am_michael` `bm_george` `bf_emma` |
| `elevenlabs` | Excellent | ~$0.12 (turbo) | Needs Starter plan + API key with `text_to_speech` scope |
| `say` | Robotic | Free | macOS only. Voices: `Samantha` `Daniel` `Karen` |

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
lib/narrate.mjs   narrate(text, opts, outWavPath) → { durationSec, charsUsed }
lib/record.mjs    record(cfg) → webmPath
lib/merge.mjs     buildNarrationTrack(scenes, outWav, workDir)
                  muxToMp4({ videoPath, audioPath, outMp4, crf, preset })
lib/cost.mjs      assertWithinBudget(backend, model, chars, capUSD)
```

See `AGENTS.md` for full agent/LLM usage guide.

## License

MIT
