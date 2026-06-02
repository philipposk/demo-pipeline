# demo-pipeline

Generates a click-through demo video for one of your projects. Free, local, no API keys.

**Stack:** Playwright records the browser, macOS `say` does the voiceover, ffmpeg stitches them together.

## One-time setup

```bash
cd "$(dirname "$0")"   # this folder
npm install
npm run install-browsers   # downloads Chromium for Playwright (~150MB)
```

You also need `ffmpeg` on PATH (`brew install ffmpeg`) and macOS (for `say`).

## Run a demo

```bash
# 1. Start the target app yourself first (in another terminal):
#    cd ~/Devoloper\ Projects/Greenpert && npm run dev
# 2. Then:
node pipeline.mjs greenpert
```

Outputs `output/<project>-demo.mp4`.

## Add a new project

Drop a config file at `projects/<name>.mjs`. See `projects/greenpert.mjs` as a template. Each config exports:

- `name` — display name
- `url` — base URL (e.g. `http://localhost:3000`)
- `viewport` — `{width, height}` (default 1280x800)
- `voice` — macOS voice name (default `Samantha`)
- `scenes` — array of `{narration, action}`. `action` is `async (page) => { ... }`. Each scene's on-screen time is padded to the narration's audio length, so clicks and words stay in sync.

## Voice options

```bash
say -v "?"   # list installed voices
```

Good ones: `Samantha`, `Daniel`, `Karen`, `Tom`, `Alex`.

## Upgrading to a real TTS later

Replace `lib/narrate.mjs` with a function that calls ElevenLabs / OpenAI TTS and saves a WAV. Same interface — `narrate(text, voice, outPath) -> seconds`.
