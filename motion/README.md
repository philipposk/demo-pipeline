# Motion product videos (Remotion)

A small engine for short, motion-designed product videos built as code, with no screen recording. The UI is rebuilt as React
components, a narration script drives the timing, and every animation lands on the spoken word. Two example products show the
whole pattern (see Examples). Read this guide before starting a new product.

## Examples

**Catchy** (`src/catchy/`): a real product, a meeting-notes app; this is its landing video (catchy.6x7.gr). 52 s, 11 scenes, landscape only. The fuller reference: cursor-driven UI, a live transcript, speaker colours, several kinds of scene.

```bash
node scripts/render.mjs catchy:light            # out/catchy-light-nomusic.mp4 (about 2 min)
node scripts/render.mjs catchy:dark             # dark cut
node scripts/render.mjs catchy:light::silent    # no voice, captions from each line's "caption"
```

The published video had music under it: "Pop Track 03" by Lily J from Mixkit (Mixkit Stock Music Free License, mixkit.co id 729). No music file is committed, so the render has none. To get the original sound, download it, normalise it as in section 7, save it as `public/music/pop-track-03.mp3` and render again; `products.json` already points to that path.

**Acme Tasks** (`src/acme/`): a made-up to-do app and the smallest starting point. 14 s, 3 scenes, with a phone (9:16) cut.

```bash
node scripts/render.mjs acme:light              # out/acme-light-nomusic.mp4 (about 30 s)
node scripts/render.mjs acme:dark::vertical     # 1080x1920 phone cut
```

Both voices are committed, so neither render needs an API key.

**Why code, not a screen recording**
- The UI is rebuilt from the product's real design tokens, so it stays sharp at 3-4x zoom.
- Nothing logs into or waits on a live app.
- Changing a line, the name or the theme means one edit and a re-render (the 14 s example renders in about 30 s).
- Light, dark, silent-captioned and phone (9:16) cuts all come from the same scenes.

**Tools and cost**
- [Remotion](https://www.remotion.dev) 4: React to MP4. Free for individuals and companies of up to 3 people; larger companies need a paid licence (see remotion.dev/license). It is not MIT.
- ffmpeg and ffprobe on your PATH (render, voice, contact sheets and the web copy all call them).
- Node 20+.
- Voice: OpenAI `gpt-4o-mini-tts`, a fraction of a cent for the example and a few cents for a one-minute video.
- Word timings: Deepgram (preferred) or OpenAI Whisper (fallback).
- Rendering reuses Playwright's chrome-headless-shell when it is installed, otherwise Remotion downloads its own browser once.

## 1. Quick start

```bash
npm install
cp .env.example .env            # add OPENAI_API_KEY (and optionally DEEPGRAM_API_KEY); .env is gitignored
node scripts/voice.mjs --script=acme            # only needed to regenerate; the example's voice is committed
node scripts/render.mjs acme:light              # out/acme-light-nomusic.mp4 + out/sheet-acme-light-nomusic.jpg
node scripts/render.mjs acme:dark::vertical     # 1080x1920 phone cut
node scripts/render.mjs acme:light::silent      # no voice, captions from each line's "caption"
npx remotion studio                             # live preview in the browser
```

Without API keys you can still render the committed example voice; you only need keys to voice a new or changed script.

## 2. Layout

```
.env                    API keys (gitignored): OPENAI_API_KEY, DEEPGRAM_API_KEY, GEMINI_API_KEY, ELEVENLABS_API_KEY. Never print or commit.
remotion.config.ts      Browser lookup, jpeg frames q95, concurrency 4, h264 crf 16
scripts/
  voice.mjs             TTS per line -> clean-up -> word timings -> src/timelines/<tag>.json + out/<tag>.vtt
  clips.mjs             Voices of people inside the video (a call, a team), with word times (section 5)
  scan.mjs              When a box's colour changes in a recording (crops, sync)
  render.mjs            Render variants + a QA contact sheet:  node scripts/render.mjs <tag>:<theme>:<music>[:silent][:vertical]
  stills.mjs            Quick QA stills without a full render (SILENT=1, VERTICAL=1, COLS=n)
  vspecs.mjs            Three frames per scene for stills.mjs
  sheet.mjs             Contact sheet (one frame near the end of every scene)
  web.mjs               Web copy + poster (section 8)
  sfx.sh                Regenerates public/sfx/*.wav with ffmpeg
  browser.mjs           Finds a Playwright chrome-headless-shell (REMOTION_BROWSER overrides)
src/
  index.ts, Root.tsx    One composition per timeline, id "<Product>-<tag>" (+ "-vertical")
  products.json         Per product: narration scripts, default music, "vertical": true
  products.ts           THE registry: product key -> Demo component
  types.ts              Timeline, DemoProps, timelineOf()
  lib.tsx               The kit (section 4.3)
  theme.ts              Fonts, default light/dark tokens (C), applyTheme()
  vertical.tsx          Phone kit: Reframe (camera over the 16:9 stage), WordCaptions, EdgeFades
  audio.tsx             DemoAudio: voice lines, whooshes, ducked music
  caption.tsx           Caption: the silent cut's word-by-word pill
  footage.tsx           Plays real-app captures inside a scene (optional, section 4.7)
  screen.tsx            Edits one long screen recording of a real run: makeEdit, Pane, SpeedBadge (section 4.8)
  acme/                 Example product (small): Demo.tsx, scenes.tsx, kit.tsx, vertical.ts
  catchy/               Example product (full landing video): Demo.tsx, scenes1-3.tsx, kit.tsx (logo, speaker colours, theme call)
  scripts/<name>.json   Narration scripts, one per cut
  timelines/            Generated by voice.mjs (do not edit); index.ts lists them
public/
  sfx/                  click.wav, whoosh.wav (generated, section 7)
  music/                Your tracks (gitignored; section 7)
  voice/<tag>/          Processed narration per timeline; voice/_raw/ is the TTS cache (gitignored)
capture/record.mjs      Optional real-app screen capture kit (needs `npm i -D playwright`); serveAs() for the real address
capture/screen-take/    rec.sh, play.sh, mark.sh: recording a real run on macOS (section 4.8)
out/                    Renders, sheets, VTTs, stills (gitignored)
```

## 3. Adding your product

A product is a folder of scenes, a narration script, and two registry lines. Nothing else in the engine changes.

1. **Copy the example.** `cp -r src/acme src/<id>`. Rename `AcmeDemo` and edit `SCENES`: a map from script line `id` to a scene component.
2. **Write the script** `src/scripts/<id>.json` (section 4.2). Every line `id` must exist in `SCENES`.
3. **Register it in two places:**
   - `src/products.json`: `"<Product>": {"scripts": ["<id>"], "music": null, "vertical": true}`. The key is the composition prefix and the file-name prefix. `scripts` lists every narration script this product owns (a cut of the same scenes with other words is another script id). `music` is a path such as `"music/track.mp3"` or `null`.
   - `src/products.ts`: `import {<Name>Demo} from './<id>/Demo';` and add `<Product>: <Name>Demo` to `DEMOS`.
4. **Give it its look.** Either use the default tokens, or write `src/<id>/theme.ts` with an `apply<Product>Theme(theme)` that does `Object.assign(C, {...})` with the product's real values (same keys as `C` in `src/theme.ts`) and call it at the top of the Demo instead of `applyTheme`. Because `C` is mutable, one composition renders both themes.
5. **Voice it:** `node scripts/voice.mjs --script=<id>` (tag defaults to the script id), then `node scripts/render.mjs <id>:light`.
6. **QA:** `node scripts/stills.mjs <id> light` (and `VERTICAL=1`, `SILENT=1`), then read the stills.

**More than one cut of a product** (a short version, another voice, a clip that reuses some scenes): add another script id to the product's `scripts`, then `node scripts/voice.mjs --script=<id> --tag=<tag>`. Each tag becomes its own composition, `<Product>-<tag>`.

**Bringing a product folder from an older checkout of this engine:**
- It imported `DemoProps`, `Timeline` and `timelineOf` from a product file; they now live in `src/types.ts`. Change that import path.
- It must keep its own files for anything that used to live in the engine's theme or kit and is not in this one (a logo component, named colour maps). Move those into the product's folder.
- Copy its `src/scripts/*.json`, `src/timelines/*.json` and `public/voice/<tag>/`, add the two registry lines from step 3, and run `node scripts/voice.mjs` once (it regenerates `src/timelines/index.ts`).
- Timelines must carry a `script` field; there is no default script any more.

## 4. Making a video for a new product

### 4.1 Study the product
1. List the shipped features with the file or route that implements each one. **Only shipped features may appear in the video.**
2. Read the design tokens: fonts, light and dark colours, radii, hairline or shadow style, the logo SVG, accent colours.
3. Read the existing marketing copy: hero line, pitch, pricing facts.
4. Invent one realistic fake scenario that every beat reuses (names, tasks, numbers). It should feel real and stay consistent across scenes. Never use real customer data.

### 4.2 Write the script: `src/scripts/<id>.json`

```json
[
  {"id": "hook", "text": "Meet Acme Tasks. A to-do list that stays out of your way.", "minSec": 4.4},
  {"id": "add",  "text": "Type a task, press enter, and it lands on your list.", "minSec": 4.4,
   "caption": "Type a task, press enter: it lands on your list."},
  {"id": "done", "text": "Tick it off when it's done. Acme Tasks. Less clutter, more done.", "minSec": 4.6, "holdSec": 0.6}
]
```

- `id`: the scene component key.
- `text`: what is spoken.
- `minSec`: minimum scene length, when the visuals need more time than the voice. Keep it near the voice length (see "No dead air" below).
- `holdSec`: extra hold at the end, usually on the end card (about 0.6 s).
- `caption`: the on-screen text for the silent cut (`""` for none).
- `speed`: a minimum tempo, e.g. 1.08 for a line that sounds slow. It may exceed the pace's cap (1.12 normal).

**No dead air.** Keep scene length minus (lead + voice) at about 1 s or less, unless an animated end card fills it. Any extra `minSec` needs matching motion (`Drift` in `lib.tsx` pushes in slowly on a held scene). `render.mjs` runs ffmpeg freezedetect after every render and prints a WARNING for any frozen stretch over 0.5 s (the last 0.6 s is ignored); fix every one. `STRICT_MOTION=1` makes it fail instead.

Recommended structure: hook, name reveal, input, core output, organisation, unique features, sharing, end card with the name and a call to action. A repeating refrain gives rhythm.

Writing rules:
- About 110 words for about 55 s. One idea per line, short sentences, concrete nouns.
- Every claim must map to a shipped feature. Make no speed claims such as "in seconds" unless measured.
- Avoid a hard pause right after a single word, as in "One: ..." or "Two: ...". The pause cap can clip the word and it sounds glitchy. Write "First, ..." and "Second, ..." instead.
- Avoid unclear phrases; read each line aloud for a stranger.
- Say the product name in the reveal and on the end card.

### 4.3 Build the scenes

Each scene is `React.FC<{sc: SceneData}>`. Use `useTiming(sc)` so motion lands on the spoken words:

```tsx
const {at, wi} = useTiming(sc);
const tNotes = at('notes', 0, 44);       // scene-local frame where the word "notes..." starts (0 = first match, 44 = fallback)
const tCode  = at('code', 1, 145, true); // second exact match of "code" (startsWith would also match "codex")
const tName  = wi(1, 18);                // frame of the 2nd spoken word
```

**The kit in `lib.tsx`**

| Group | Exports |
|---|---|
| Motion | `Pop` (spring rise, scale and un-blur in; optional `out` blurs it away), `Drift` (slow push-in and float for a held scene), `Shell` (scene dissolve plus slow camera drift; used by the Demo), `Bg` (drifting glows), `useSpring`, `lerp`, `SPRING` / `SNAP` / `BOUNCE` |
| Type | `Headline` (serif kinetic headlines), `Refrain` (big centred words, one per beat), `typed()` (typewriter text) |
| UI | `Card`, `Chip`, `Dot`, `Eq` (3-bar equaliser), `Toggle`, and icons such as `IconUpload` and `IconMic`. Put the product's own logo in its folder (see `src/acme/kit.tsx`). |
| Interaction | `Cursor` (glides along a path relative to its positioned parent, clicks with a ripple) and `Sfx` (click and whoosh sounds at a frame) |

**Patterns that work**
- Show one UI fragment at a time, large, on the canvas. Never show a full screen.
- In a carousel of fragments, slide the active one to centre on the beat.
- After a click, push the camera in on what matters (scale about 1.2 with `transformOrigin` on the important row).
- Put the cursor inside the element it clicks, using a relative path, so you don't need to measure the layout. Use fixed sizes for the card and rows, so cursor targets are plain arithmetic (see `CARD` in `src/acme/kit.tsx`).
- Build lists row by row in time with spoken words.
- Draw connector lines with SVG `pathLength=1` and an animated `strokeDashoffset`.
- Clamp late animations to the scene length (`Math.min(t, sc.length - 22)`) so a fast cut doesn't chop them.

### 4.4 Registering compositions
See section 3, step 3. Each timeline JSON stores the `script` it was voiced from; `Root.tsx` and `render.mjs` find the product through `products.json`. Compositions are `<Product>-<tag>` and `<Product>-<tag>-vertical`; render output is `<product>-<tag>-<theme>-<music|nomusic>[-silent][-vertical].mp4`.

### 4.5 Phone (vertical) cut

Scenes stay as they are (drawn on the 1920x1080 stage). The vertical cut shows the stage through a moving camera and adds big word-by-word captions, so it works muted in a feed.
1. In the product's Demo, branch on `format === 'vertical'`: background, each scene inside `<Reframe sc keys cy>`, then `<EdgeFades>`, a small logo header, `<WordCaptions>` per scene, and `<DemoAudio>` (see `src/acme/Demo.tsx`).
2. Write camera keys per scene id (`src/acme/vertical.ts`): `{x, y, z}` in stage pixels, each optionally landing on a spoken word (`at`, `d` frames early). Keep UI at z 0.85-1.15 (readable on a phone) and wide headlines at about 0.8. Keys whose word is not in a script's line are skipped, so one map serves several scripts.
3. List scenes whose narration is already the on-screen headline in `NO_CAPTIONS`, and logo scenes in `NO_HEADER`.
4. Set `"vertical": true` in `products.json`, render with `:vertical`, and check with `VERTICAL=1 COLS=6 node scripts/stills.mjs <tag> light $(node scripts/vspecs.mjs <tag>)`. Look for cut-off content and empty frames.

Captions show the script's spelling at the speech-to-text timings (`alignWords`), so brand spellings the recogniser mangles still read correctly.

### 4.6 Silent cut
`:silent` hides the voice and shows each line's `caption` as a pill (`src/caption.tsx`). Use it for autoplay and social.

### 4.7 Real-app footage (optional)
The pipeline's `--mode=studio` (repo root) is the automatic version of this: it captures any configured project or URL,
then renders the `Studio` composition (`src/studio/Studio.tsx`) with props written by `lib/studio.mjs`. Per-render files
go to `public/studio/<slug>/` (gitignored).

`capture/record.mjs` records a web app through Chrome's screencast at full device resolution and logs every step, click
and focus box; `src/footage.tsx` plays that inside a scene. Needs Playwright (`npm i -D playwright`, or the app's own when
`motion/` sits inside the app). Output goes to `public/capture/` and `src/captures/` (the first is gitignored).

Use it when the video must show the real app, not a rebuilt one. What keeps it fast: **the app is never signed in and
never waits on a server.** The app gets dev-only harness pages that render its real components with made-up data and
scripted events, served by its dev server; the capture drives those pages, and nothing touches a database or an AI service.

1. **Harness pages in the app** (dev only, a 404 in production): the real page's components, a fixture with the story's
   data, a fetch stub that answers every API call the page makes, and a timeline of scripted events (a line arriving, a
   status changing). Mark the DOM nodes the capture needs (`data-*` attributes) instead of relying on text.
2. **Capture script** `capture/<product>-<id>.mjs`: one `record()` call per take (laptop, phone, light and dark). A take
   is a list of steps `{id, run: async (h) => {...}}` whose ids match the script's line ids. Helpers: `h.click`, `h.type`,
   `h.press`, `h.move`, `h.scroll`, `h.focus(target, {zoom})` (a camera and ring cue), `h.unfocus`, `h.waiting(fn)` (a wait
   the composition speeds up), `h.pause(ms)`, `h.log({type: 'mark', name, box})` (a box the composition reads, e.g. a
   sentence to highlight). `init(ctx)` sets cookies, `localStorage` and `ctx.clock` before the page loads; `context`
   passes extra context options such as `{timezoneId, locale}`. Output: `public/capture/<out>.mp4` plus
   `src/captures/<out>.json` (steps, events, CSS size, dpr). A failed step stops the take and leaves a screenshot in
   `out/.capture/<out>/`.
   - Record at dpr 2-3 so text stays sharp at 2x zoom. `record()` scales a capture above about 8.9 Mpx down, because
     Remotion's decoder shows only the keyframes of bigger video (above H.264 level 5.1), and encodes GOP 15 without
     B-frames so frozen-frame seeks are exact.
   - Check the app's layout breakpoints before picking a viewport, so the take shows the layout you want.
   - `CHROME_PATH` points at a Chromium build when Playwright's own browser is not downloaded.
3. **Composition:** each scene plays one step with `<Footage cap={...} step="..." width height ringColor />`. Its props:
   - `camera`: shots `{f, box, zoom, ring}` set by the scene, instead of the capture's focus events.
   - `followY` (phones): the page's full width fills the screen and the camera pans up and down to each focus.
   - `from` (seconds into the step), `speed` (faster than real time), `lead` (frames before the step starts).
   - `overlay(t)`: marks drawn in the app's CSS-pixel space at source time `t`, e.g. a highlighter over a sentence.
   - `tap`: a finger tap instead of the arrow cursor.
   Logged waits play compressed to about 0.8 s, and the step's last frame holds.
4. **Themes:** record every take in both themes; the Demo swaps captures and its own palette with an `apply<Product>(theme)`.
5. **Variants** are extra scripts on the same Demo: list them in `products.json` and map extra line ids in `SCENES`.
6. **Sync with recorded sound** (a voice clip, a call): the page shows reactions 0.7-1.1 s after the sound, per take.
   Measure the offset on stills and keep it per capture name.
7. **QA:** stills of every scene and every sync frame (spoken word vs. the word on screen), then render one variant at a time.
8. **The real address on screen:** `serveAs(ctx, {origin: 'https://app.example.com', app: 'http://localhost:3000'})` in
   `init(ctx)` loads the harness under the real address while the local server answers every request, so share links and
   address bars read like the real site and nothing reaches it. The dev server's websocket is proxied too (Next.js does not
   hydrate without it; needs Node 22+). Record `https://app.example.com/<harness page>`.
9. **16:9 and vertical from two takes:** text is readable on a phone only with a tall take. Record the same steps twice
   (e.g. 1440x900 for 16:9 and 980x1150 for 9:16), log the boxes the camera needs as marks
   (`h.log({type: 'mark', name: 'panel', box})`), and let the Demo pick the take by `format` and read the boxes from it,
   so one set of scenes serves both.
10. **People talking in the video:** make their voices with `scripts/clips.mjs` (section 5). The harness can type each
   line word by word at the clip's word end times; measure the page's lag behind the sound on a tile of frames per take
   and offset the footage by it.
11. **The user's own work beside the app** (their homepage, a slide) is drawn in Remotion, not recorded: it is their
   material, not the app's, and it can animate when the app's result lands.

### 4.8 Real run (screen recording, macOS)

Only when the brief needs proof that it really happens (an agent fixing and deploying something live). Everything else is
a harness (4.7): faster, repeatable, no real accounts. A real run needs:

- **A separate demo site** with its own repo and deploy (a tiny static site with one bug and a test), never a real
  product. Its `CLAUDE.md` holds the deploy and verify steps; its `.claude/settings.json` allows only the tools needed,
  so no permission prompt appears on camera; `.git/info/exclude` keeps media out (personal files can land in the folder
  mid-take). A page that reloads itself when its code changes shows the deploy landing.
- **The person signs in themself** and flips the system settings (Do Not Disturb on, Stage Manager off). Everything else
  is done for them; when they must act, give exact clicks (Chrome's zoom via its menu, not a shortcut that opens Siri).
- **Pre-recorded voices** for the people in the story (`scripts/clips.mjs`), played through the speakers with
  `capture/screen-take/play.sh`, and **a director**: play the next clip only once the agent has done its part (poll the
  page's DOM once with a long-waiting script, `curl` the live site until the deploy lands), log milestones with
  `mark.sh`.
- **The recording:** `capture/screen-take/rec.sh <out.mp4> [screen index]` (avfoundation, 30 fps, Retina) until
  `pkill -INT -f avfoundation`. `rec.sh`, `play.sh` and `mark.sh` log epoch times to `take.log`, so the edit places the
  clean clip audio exactly where it was heard. Arrange the windows first with AppleScript (`set bounds of w to {...}`) and
  check with `screencapture -x`. Crop the menu bar off (`crop=2560:1588:0:76` on a 1280x832 Retina screen) and re-encode
  with `-g 15 -bf 0`.
- **A coding agent on camera:** start it with a clean environment (`env -i HOME=... PATH=... <cli>`), so it does not
  inherit another session's; use a current CLI (an old one on PATH lists old models); turn off plugins and status lines
  that would show, per folder in `.claude/settings.local.json`. Type its command into the running terminal once its
  tools are connected (`osascript -e 'tell application "Terminal" to do script "..." in selected tab of front window'`);
  a slash command given at start-up runs before its tools connect.
- **The edit:** `src/screen.tsx`. `makeEdit(PIECES)` maps output time to recording time (cuts, and speed-ups that
  `SpeedBadge` marks "▶▶ ×N"); `Pane` frames one window of the recording in a slot with camera shots and rings; place
  the clean clip audio with `<Html5Audio trimBefore trimAfter>` at `edit.outOf(piece, logged second)`; narration by output
  second.
- **Show what really happened.** If the agent waited for a typed "go" instead of acting on a spoken approval, the video
  says "It waits for your go" and cuts the spoken one. Never narrate something the take did not show. Mark it on the end
  card: "A real run, sped up where marked".
- Chrome shows "… started debugging this browser" in every window while an agent drives it, pushing the page down
  (56 px) and coming and going: find when with `node scripts/scan.mjs <rec.mp4> <x,y,w,h>` and shift the pane's crop
  (`Pane` `dy`), or keep browser automation out of the take. Hide private things: the tab strip, sidebars of real data,
  other windows.

## 5. Voice: `scripts/voice.mjs`

```bash
node scripts/voice.mjs --script=<id>                       # normal pace, voice marin; tag defaults to the script id
PACE=fast node scripts/voice.mjs --script=<id> --tag=<id>fast
VOICE=cedar node scripts/voice.mjs --script=<id> --tag=<id>cedar
node scripts/voice.mjs --script=<id> --retime              # re-fetch word timings only
node scripts/voice.mjs --script=<id> --takes=4 --lines=reveal,end   # audition: 4 fresh takes of these lines, no timeline
```

**Pipeline, per line**
1. TTS, cached by provider, voice and text (`public/voice/_raw/`).
2. Trim the silence at both ends, and cap internal pauses at 0.2 s (`PAUSE_CAP`, at -45 dB).
3. Gently speed up to about 182 wpm, at most x1.12. The fast pace targets 200 wpm, at most x1.2.
4. Get word timings and build the timeline: `scene length = max(lead + voice + tail, minSec) + holdSec`. Scenes overlap by `xf` frames, which gives the dissolve (normal: lead 6, tail 12, xf 10; fast: 4, 6, 8).
5. Write `out/<tag>.vtt` and regenerate `src/timelines/index.ts`.

**Per-line fields** besides `text`, `caption`, `minSec`, `holdSec` and `speed`:
- `say`: what the voice reads when it differs from the caption (a brand name spelled the way the voice says it right).
- `style`: a style prompt for this line only (a firmer start, a calmer line). It is part of the cache key.
- `pauseCap`: this line's pause cap in seconds.
- `leadIn`: seconds of silence kept before the first word (default 0.03), so a soft first sound is not cut.
- `take`: which audition take to use (below).

**Pick takes by ear.** TTS mispronounces a word now and then, and the speech recogniser does not notice: it can report a
garbled word as the right one with full confidence. For any line that matters, run `--takes=N --lines=<ids>`: it saves N
fresh takes as `out/takes/<script>/<id>-t<k>.mp3` and in the raw cache. Have someone who speaks the language listen (for a
short line, with the sound before it mixed in), then set `"take": k` on the line in every script that has it and re-run.
A take liked except for one long pause can be cut by hand (ffmpeg `atrim` plus a 10 ms `acrossfade`) and saved as the
next take file next to the original (`public/voice/_raw/<voice>/<id>-<hash>.t<k>.wav`). Re-voicing often loses the
delivery that made the take good, and splicing one word in from another line sounds like an echo.

**Other languages:** `STT_LANG=<code>` (e.g. `el`) for word timings, a `VOICE_STYLE` written in that language, and `WPM`
low enough that no line is sped up (Greek: 100). Speeding Greek up even 1.2x warped words. A custom `VOICE_STYLE` is
part of the cache key.

**Keys** are read from the environment, then `.env`, then the file named by `ENV_FILE` (optional).

**Providers** (`VOICE_PROVIDER`)

| Provider | Notes |
|---|---|
| `openai` (default) | `gpt-4o-mini-tts`, style set through `instructions`, so it never reads the style aloud. Voices: marin, cedar, coral and more. Disclose "AI voice" wherever the video is published. |
| `gemini` | Style must go in `systemInstruction`, otherwise it reads the style text aloud. Gemini 2.5 TTS models (`GEMINI_TTS_MODEL=gemini-2.5-flash-preview-tts`) take no system instruction, so `voice.mjs` puts the style in front of the text: write it in the script's language. The free tier stops after 10 requests a day per model, so it needs billing on its Google project; a 429 that names `FreeTier` means the key's project has no billing yet. |
| `deepgram` | Aura-2 voices with no style control. Fine, but flatter. |
| `eleven` | ElevenLabs (`ELEVENLABS_API_KEY`, `VOICE=<voice id>`, `ELEVEN_SPEED=0.7-1.2`, model `eleven_multilingual_v2`). No style prompt; mp3 at 128 kbps (higher needs a paid tier). The free tier is not for commercial use; Starter is. Stock voices that worked: Sarah `EXAVITQu4vr4xnSDxMaL` (warm, confident), Brian `nPczCjzI2devNBz1zQrb` (deep, dry); Chris and Liam read very fast. |
| Avoid | edge-tts (unclear commercial licence). |

**Pacing by ear.** People hear "slow and weird" quickly. Calm or confident style prompts made OpenAI lines drag; a comma
in mid-sentence adds a pause ("120 minutes, every month" reads better without it); odd phrases stand out. Re-voice with a
natural-pace style or try another provider, and send two short samples for the person to pick from.

**Voices of people in the video** (a client on a call, a team): `node scripts/clips.mjs <spec.json>`. Each clip is one or
more lines, each with its own OpenAI voice and style, joined with gaps; output `<out>/<clip>.wav` and `<out>/clips.json`
with word times per line, for typing in harness pages and word-lit captions. Pick clearly different voices: a recogniser
merges two similar ones into one speaker.

**Word timings:** Deepgram nova-3 when `DEEPGRAM_API_KEY` exists, because its timings are tighter than Whisper's (Whisper sometimes puts two words 0.02 s apart). Without it the OpenAI key is used for Whisper. Each line gets 0.3 s of silence in front before it is sent, so the recogniser does not miss the first word.

## 6. Render, QA, variants

```bash
node scripts/render.mjs <tag>:<theme>:<music>[:silent][:vertical] ...
# theme: light | dark      music: a file name from public/music/ (no .mp3), "none", or empty (= the product's default, or no music)
```

**QA every render**
1. Check the freeze warning (see "No dead air" in 4.2) and fix anything over 0.5 s.
2. Read `out/sheet-<name>.jpg` (one frame near the end of each scene).
3. Check that nothing is cropped wrongly and that no text or claim is inaccurate.
4. Check that late animations are not cut off, and look at light and dark separately.
5. Listen for glitches at pauses, a reveal that doesn't match the word, and music that is too loud. Music is ducked to 0.2 under the voice and rises to 0.42 in the gaps.

**Audio check:** `ffmpeg -i X.mp4 -af volumedetect -f null -`. Renders come out quiet (about -26 dB mean):
`LOUDNORM=-14 node scripts/render.mjs ...` normalises the finished file to -14 LUFS for YouTube (picture copied).
`SCALE=1.3333` renders a 1440p master (2560x1440, or 1440x2560 for the phone cut): YouTube serves 1440p uploads with a
better codec, so UI text stays sharp. Right after upload YouTube plays only 240p/360p until HD processing finishes
(minutes to an hour); the uploader cannot set a default quality. Music
files are normalised to -16 LUFS when added (section 7).

**Finding moments:** `node scripts/scan.mjs <video.mp4> <x,y,w,h>` prints when a box's colour jumps (a bar appearing, a
price changing), for crops and sync. A tile of frames with timestamps (`ffmpeg ... -vf "fps=10,tile=6x4"`) shows the lag
between a sound and the page's reaction.

## 7. Music and sound effects

**Music is optional.** With no track the video renders with voice and effects only (`acme-light-nomusic.mp4`). No music files ship with this repo, and everything in `public/music/` except `SOURCES.txt` is gitignored.

To add a track:
1. Pick one from a royalty-free library whose licence allows your use, for example Mixkit (https://mixkit.co/free-stock-music/, Mixkit Stock Music Free License: commercial use, no credit; read the licence yourself, and do not redistribute the files).
   On a Mixkit tag page (for example `mixkit.co/free-stock-music/tag/electronic/`) each track's mp3
   (`assets.mixkit.co/music/<id>/<id>.mp3`) follows its title in the page's HTML. Check the file's duration against the
   track listing before using it: pages also hold featured tracks. Ask the person before downloading anything.
2. Normalise it and save it into `public/music/`:
   ```bash
   ffmpeg -i in.mp3 -af "loudnorm=I=-16:TP=-1.5:LRA=11" -ar 48000 -b:a 192k public/music/<name>.mp3
   ```
3. Render with it: `node scripts/render.mjs acme:light:<name>`, or make it a product's default with `"music": "music/<name>.mp3"` in `products.json`.
4. Record the source and licence in `public/music/SOURCES.txt` (committed) so others can fetch the same track.

Avoid YouTube Audio Library standard tracks (licensed for YouTube only), the Uppbeat free tier (not for company use) and MusicGen (non-commercial).

**Sound effects** (`public/sfx/click.wav`, `whoosh.wav`) are generated with ffmpeg by `scripts/sfx.sh` (a sine tick over a soft thump, and band-passed pink noise), so there is nothing to license. Edit and re-run the script to change them.

## 8. Publish (web)

```bash
node scripts/web.mjs out/X.mp4 out/site/demo-light 12.5   # demo-light.mp4 + demo-light.jpg (poster from 12.5 s: a UI-rich frame)
cp out/<tag>.vtt out/site/demo.vtt
```

`web.mjs` encodes h264 CRF 24 with loudness-normalised AAC and faststart, and raises the CRF until the file is under `MAX_MB` (default 10). The poster is 1280x720, or 720x1280 for a phone cut. If the video already shows text at the bottom, add ` line:5%` to each cue's timing line so captions that someone turns on sit at the top, and don't make the track `default`. Use brand-neutral file names such as `demo-light.mp4`. Embed one `<video preload="none">` per theme and show the one that matches the page theme, with a "Narrated with an AI voice" note.

## 9. Style recipe

- **Canvas:** light, with soft drifting colour glows. Dark is a black canvas with subtler glows.
- **Cuts:** almost no hard cuts. Scenes blur-dissolve with a slight scale.
- **Headlines:** big serif in bursts of 2-4 words, centred, with the punch word in italics.
- **UI:** one fragment at a time, large and often cropped, hairline borders, soft long shadows, in the product's real fonts and colours.
- **Motion:** springy scale-ins with a small overshoot. Each beat lasts 1-2.5 s. Animate on the spoken word.
- **Voice:** bright, warm and brisk, about 180 wpm, no hype words.
- **End card:** logo plus wordmark, the tagline in italics, a call-to-action pill.

## 10. Pitfalls

- **Don't screen-record the live app** for marketing video unless you must: sign-in automation, waits on real processing and timing overruns cost days. When the real UI must be shown, record dev harness pages with made-up data instead (4.7).
- **Real-app footage:**
  - `<Freeze>` clamps its frame to the composition length, so a long capture showed earlier frames. `Footage` plays a
    held frame through a `<Sequence>` with a negative offset instead.
  - Remotion shows only the keyframes of video above about 8.9 Mpx; `record()` scales down (4.7).
  - Caption word matching (`norm` in `src/vertical.tsx` and `src/lib.tsx`) keeps letters in any alphabet (`\p{L}`);
    with `[a-z]` only, every Greek word matched the empty string.
- **Fonts:** Inter turns an "x" between digits into "×" (contextual alternates). Set `fontFeatureSettings: '"calt" 0'` on
  brand names and addresses that contain one.
- **Register before voicing:** a timeline whose script no product lists is skipped (with a warning) and cannot be
  rendered; add the product to `products.json` and `products.ts` first.
- **One render at a time on the machine,** across all projects and sessions. Check with
  `pgrep -f "remotion rende[r] src/"` (the bracket stops it matching itself). Never `pgrep -fl`: it prints environments,
  API keys included. Never delete `$TMPDIR/remotion-webpack-bundle-*` while anything renders.
- **Browser for captures:** Playwright's downloaded browsers can vanish with disk cleanup. Point `CHROME_PATH` at
  Playwright's headless shell, not full Chrome: full Chrome's screencast covers only its window (about 813 of 900 px)
  and the frames come out stretched.
- **"TypeError: Failed to fetch"** during a render of a big recording (a 4 Mpx screen recording in three panes, or 1080p
  takes) means memory ran out at concurrency 2. `render.mjs` now tries such a render once more by itself with
  `CONCURRENCY=1 OTV_CACHE=300000000`.
- **Memory and disk on long captures:** "Could not extract frame from compositor … disk space is low" means the machine
  ran out of memory or disk, not a code bug. Render one at a time with `CONCURRENCY=1 OTV_CACHE=400000000`, check free
  disk first, and delete `$TMPDIR/remotion-webpack-bundle-*` (about 250 MB each) after every render, once nothing else
  renders. A 4 Mpx recording in three panes failed with "Failed to fetch" at concurrency 2 and worked at 1 with a smaller
  cache.
- **Shell and tooling:** zsh does not split `$var` in `for` loops (use node runners or arrays); BSD `sed` has no `\b`; Node ESM resolves packages relative to the script file's folder.
- **Remotion:**
  - The audio component is `Html5Audio`.
  - A `volume` callback receives the frame relative to the audio's own start.
  - TypeScript loses null-narrowing inside `.map` callbacks; pass the checked value into a small component.
- **Secrets:** keep keys in `.env`, never print them, never commit them.
- **Rings and cursors drift from their targets.** A fixed-height flex column shrinks its rows, so use fixed sizes, measure targets from a still, and check every ring on the stills.
- **Disk:** `out/` grows by several MB per render. Delete old renders when done.

## 11. Use as a Claude skill

`skills/product-video/SKILL.md` (in the repo root next to `motion/`) teaches Claude Code the workflow above. Copy the `product-video` folder into `~/.claude/skills/` (all projects) or your project's `.claude/skills/`, then ask Claude to "make a product video for <your app>". The skill expects this engine to be available (clone the repo or point it at a local copy).
