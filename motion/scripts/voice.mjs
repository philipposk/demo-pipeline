// Narration -> timeline. TTS per script line (cached per voice + text), trim + pause cap + gentle speed-up,
// word timings, then src/timelines/<tag>.json (+ out/<tag>.vtt) and the generated src/timelines/index.ts.
//
// Usage: node scripts/voice.mjs --script=<name> [--tag=<name>] [--retime]   (tag defaults to the script name)
//        node scripts/voice.mjs --script=<name> --takes=4 --lines=reveal,end   # audition: 4 fresh takes per line, no timeline
//   VOICE_PROVIDER=openai|gemini|deepgram|eleven (default openai)   VOICE=<name, or an ElevenLabs voice id> (openai default: marin)
//   ELEVEN_SPEED=0.7-1.2 (ElevenLabs only; part of the cache key)   ELEVEN_MODEL (default eleven_multilingual_v2)
//   PACE=normal|fast (fast: tighter holds, quicker speech)
//   VOICE_STYLE=<how to speak> replaces the default style prompt (write it in the script's language)
//   STT_LANG=<code> is the spoken language for word timings (e.g. el); WPM=<n> the target speed (Greek: 100, so
//   nothing is sped up); PAUSE_CAP=<seconds> the longest pause inside a line (default 0.2)
// Takes land in out/takes/<script>/<id>-t<k>.mp3 (to listen to) and in the raw cache; `"take": k` on the line keeps one.
// Per line, besides text/caption/minSec/holdSec/speed: `say` (what the voice reads, when it differs from the text),
// `style` (replaces the style prompt for that line), `pauseCap` (seconds; replaces PAUSE_CAP), `leadIn` (seconds of
// silence kept before the first word, default 0.03), `take` (an audition take to use).
// Keys are read from the environment, then <project>/.env, then the file named by ENV_FILE (optional), in that order.
// Gemini needs billing on its Google project: the free tier allows only ~10 TTS requests a day.
import {readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readEnv = (f) =>
  existsSync(f)
    ? Object.fromEntries(
        readFileSync(f, 'utf8')
          .split('\n')
          .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
          .filter(Boolean)
          .map((m) => [m[1], m[2].replace(/^['"]|['"]$/g, '')]),
      )
    : {};
const envs = [
  readEnv(join(ROOT, '.env')),
  process.env.ENV_FILE ? readEnv(process.env.ENV_FILE) : {},
];
const keyOf = (name) => process.env[name] || envs.map((e) => e[name]).find(Boolean);

const arg = (name, dflt) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? dflt;
const retime = process.argv.includes('--retime');
const PROVIDER = process.env.VOICE_PROVIDER || 'openai';
const VOICE = process.env.VOICE || {gemini: 'Zephyr', deepgram: 'aura-2-thalia-en', openai: 'marin', eleven: 'EXAVITQu4vr4xnSDxMaL'}[PROVIDER];
const PACE = process.env.PACE || 'normal';
const TTS_KEY = keyOf({gemini: 'GEMINI_API_KEY', deepgram: 'DEEPGRAM_API_KEY', openai: 'OPENAI_API_KEY', eleven: 'ELEVENLABS_API_KEY'}[PROVIDER]);
const ELEVEN_SPEED = process.env.ELEVEN_SPEED ? Number(process.env.ELEVEN_SPEED) : null;
if (ELEVEN_SPEED !== null && !(ELEVEN_SPEED >= 0.7 && ELEVEN_SPEED <= 1.2)) throw new Error('ELEVEN_SPEED must be between 0.7 and 1.2');
const DG_KEY = keyOf('DEEPGRAM_API_KEY');
if (!TTS_KEY) throw new Error(`API key for ${PROVIDER} missing`);

const FPS = 30;
const P = {
  normal: {lead: 6, tail: 12, xf: 10, minScale: 1, holdScale: 1, wpm: 182, maxTempo: 1.12},
  fast: {lead: 4, tail: 6, xf: 8, minScale: 0.78, holdScale: 0.7, wpm: 200, maxTempo: 1.2},
}[PACE];
if (!P) throw new Error(`unknown PACE ${PACE}`);
// Other languages are voiced slower so no word gets warped by the speed-up (Greek: WPM=100).
if (process.env.WPM) P.wpm = Number(process.env.WPM);
const GEMINI_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts';
const STYLE = process.env.VOICE_STYLE ||
  'Voice: bright, warm, confident product-launch narrator. Pace: brisk and snappy, no drawn-out syllables. ' +
  'Pauses: short and crisp at full stops. Tone: upbeat and friendly, a smile in the voice, not salesy.';
// Gemini 2.5 TTS models take no system instruction: the style goes in front of the text as a spoken-style prompt.
const STYLE_IN_PROMPT = /gemini-2\.5/.test(GEMINI_MODEL);
const PAUSE_CAP = Number(process.env.PAUSE_CAP || 0.2);
// Spoken language for word timings, e.g. STT_LANG=el for a Greek script. Default: let the recogniser decide.
const STT_LANG = process.env.STT_LANG || '';

const SCRIPT = arg('script');
if (!SCRIPT) throw new Error('usage: node scripts/voice.mjs --script=<name> [--tag=<name>] [--retime]');
const TAG = arg('tag', SCRIPT);
const script = JSON.parse(readFileSync(join(ROOT, 'src/scripts', `${SCRIPT}.json`), 'utf8'));
const rawDir = join(ROOT, 'public/voice/_raw',
  `${PROVIDER}-${VOICE}${STYLE_IN_PROMPT ? '-25' : ''}${PROVIDER === 'eleven' && ELEVEN_SPEED !== null ? `-s${ELEVEN_SPEED}` : ''}`);
const outDir = join(ROOT, 'public/voice', TAG);
const tlDir = join(ROOT, 'src/timelines');
for (const d of [rawDir, outDir, tlDir, join(ROOT, 'out')]) mkdirSync(d, {recursive: true});
const tlPath = join(tlDir, `${TAG}.json`);
const prev = existsSync(tlPath) ? JSON.parse(readFileSync(tlPath, 'utf8')) : null;
const voiceId = `${PROVIDER}:${VOICE}`;

const ff = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args]);
const sec = (f) =>
  Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 8);

async function tts(text, file, style = STYLE) {
  if (PROVIDER === 'gemini') {
    for (let attempt = 0; attempt < 6; attempt++) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
        method: 'POST',
        headers: {'x-goog-api-key': TTS_KEY, 'Content-Type': 'application/json'},
        body: JSON.stringify({
          ...(STYLE_IN_PROMPT ? {} : {systemInstruction: {parts: [{text: style}]}}),
          contents: [{parts: [{text: STYLE_IN_PROMPT ? `${style}: ${text}` : text}]}],
          generationConfig: {responseModalities: ['AUDIO'], speechConfig: {voiceConfig: {prebuiltVoiceConfig: {voiceName: VOICE}}}},
        }),
      });
      if (r.status === 429 || r.status >= 500) {
        await sleep(3000 * 2 ** attempt);
        continue;
      }
      if (!r.ok) throw new Error(`TTS ${r.status}: ${(await r.text()).slice(0, 300)}`);
      const part = (await r.json()).candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
      if (!part) throw new Error('TTS returned no audio');
      const rate = part.inlineData.mimeType?.match(/rate=(\d+)/)?.[1] || '24000';
      const pcm = `${file}.pcm`;
      writeFileSync(pcm, Buffer.from(part.inlineData.data, 'base64'));
      ff(['-f', 's16le', '-ar', rate, '-ac', '1', '-i', pcm, '-ar', '48000', file]);
      return rmSync(pcm);
    }
    throw new Error('TTS kept failing (rate limit or server error)');
  }
  // ElevenLabs: VOICE is a voice id; there is no style prompt. mp3 at 128 kbps (higher needs a paid tier), then wav.
  if (PROVIDER === 'eleven') {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: {'xi-api-key': TTS_KEY, 'Content-Type': 'application/json'},
      body: JSON.stringify({text, model_id: process.env.ELEVEN_MODEL || 'eleven_multilingual_v2',
        voice_settings: {stability: 0.5, similarity_boost: 0.75, use_speaker_boost: false, speed: ELEVEN_SPEED ?? 1}}),
    });
    if (!r.ok) throw new Error(`TTS ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const mp3 = `${file}.mp3`;
    writeFileSync(mp3, Buffer.from(await r.arrayBuffer()));
    ff(['-i', mp3, '-ar', '48000', '-ac', '1', file]);
    return rmSync(mp3);
  }
  if (PROVIDER === 'deepgram') {
    const r = await fetch(`https://api.deepgram.com/v1/speak?model=${VOICE}&encoding=linear16&sample_rate=48000&container=wav`, {
      method: 'POST',
      headers: {Authorization: `Token ${TTS_KEY}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({text}),
    });
    if (!r.ok) throw new Error(`TTS ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  }
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {Authorization: `Bearer ${TTS_KEY}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({model: 'gpt-4o-mini-tts', voice: VOICE, input: text, instructions: style, response_format: 'wav'}),
  });
  if (!r.ok) throw new Error(`TTS ${r.status}: ${(await r.text()).slice(0, 300)}`);
  writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}

// Deepgram's word timings are tighter than Whisper's, so it is used whenever its key exists.
async function wordTimes(file) {
  if (DG_KEY) {
    // A trimmed line starts on its first word, which the recogniser can miss: give it a short silence to start on.
    const PAD = 0.3;
    const padded = `${file}.pad.wav`;
    ff(['-i', file, '-af', `adelay=${PAD * 1000}`, padded]);
    const r = await fetch(`https://api.deepgram.com/v1/listen?model=nova-3&punctuate=true${STT_LANG ? `&language=${STT_LANG}` : ''}`, {
      method: 'POST',
      headers: {Authorization: `Token ${DG_KEY}`, 'Content-Type': 'audio/wav'},
      body: readFileSync(padded),
    });
    rmSync(padded);
    if (!r.ok) throw new Error(`STT ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const words = (await r.json()).results?.channels?.[0]?.alternatives?.[0]?.words || [];
    return words.map((w) => ({w: w.punctuated_word || w.word, s: +Math.max(0, w.start - PAD).toFixed(2), e: +Math.max(0, w.end - PAD).toFixed(2)}));
  }
  const fd = new FormData();
  fd.append('file', new Blob([readFileSync(file)], {type: 'audio/wav'}), 'line.wav');
  fd.append('model', 'whisper-1');
  fd.append('response_format', 'verbose_json');
  fd.append('timestamp_granularities[]', 'word');
  if (STT_LANG) fd.append('language', STT_LANG.split('-')[0]);
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {method: 'POST', headers: {Authorization: `Bearer ${keyOf('OPENAI_API_KEY')}`}, body: fd});
  if (!r.ok) throw new Error(`STT ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return ((await r.json()).words || []).map((w) => ({w: w.word, s: +w.start.toFixed(2), e: +w.end.toFixed(2)}));
}

// `say`: what the voice reads when it differs from the shown text (a brand name the TTS mispronounces).
// A line's own `style` is part of its cache key, so changing it makes a new take.
const sayOf = (line) => line.say ?? line.text;
// A custom VOICE_STYLE is part of the key too; the default style is not, so older caches stay valid.
const rawOf = (line, take) =>
  join(rawDir, `${line.id}-${hash(sayOf(line) + (line.style ?? (process.env.VOICE_STYLE ? STYLE : '')))}${take ? `.t${take}` : ''}.wav`);

// Raw take -> trimmed, pause-capped, tempo-matched line. Returns the tempo used.
function clean(raw, line, out) {
  const trim = `${out}.trim.wav`;
  const cap = line.pauseCap ?? PAUSE_CAP;
  ff(['-i', raw, '-af',
    `silenceremove=start_periods=1:start_threshold=-50dB:start_silence=${line.leadIn ?? 0.03},areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse,` +
      // cap every internal pause (0.2 s, or PAUSE_CAP) so list-style lines stay snappy
      `silenceremove=stop_periods=-1:stop_duration=${cap}:stop_threshold=-45dB:stop_silence=${cap}`,
    '-ar', '48000', '-ac', '1', trim]);
  const nWords = line.text.split(/\s+/).length;
  // `speed` is a floor that may exceed the pace's cap, for a take that still sounds slow at the cap.
  const tempo = Math.max(line.speed ?? 1, Math.min(P.maxTempo, P.wpm / ((nWords / sec(trim)) * 60)));
  ff(['-i', trim, '-af', `atempo=${tempo.toFixed(3)}`, '-ar', '48000', '-ac', '1', out]);
  rmSync(trim);
  return tempo;
}

// Audition mode: fresh takes of some lines to pick from by ear (the recogniser does not hear a mispronounced word).
const TAKES = Number(arg('takes', 0));
if (TAKES) {
  const ids = arg('lines', '').split(',').filter(Boolean);
  const dir = join(ROOT, 'out/takes', SCRIPT);
  mkdirSync(dir, {recursive: true});
  for (const line of script.filter((l) => !ids.length || ids.includes(l.id))) {
    for (let k = 1; k <= TAKES; k++) {
      let n = k;
      while (existsSync(rawOf(line, n))) n++;
      await tts(sayOf(line), rawOf(line, n), line.style ?? STYLE);
      const wav = join(dir, `${line.id}-t${n}.wav`);
      clean(rawOf(line, n), line, wav);
      ff(['-i', wav, '-b:a', '128k', wav.replace(/\.wav$/, '.mp3')]);
      rmSync(wav);
      console.log(`${line.id} take ${n}: ${wav.replace(/\.wav$/, '.mp3')}`);
    }
  }
  process.exit(0);
}

const scenes = [];
let from = 0;
for (const line of script) {
  const raw = rawOf(line, line.take);
  if (!existsSync(raw)) {
    if (line.take) throw new Error(`${line.id}: take ${line.take} missing (${raw})`);
    await tts(sayOf(line), raw, line.style ?? STYLE);
  }
  const out = join(outDir, `${line.id}.wav`);
  const tempo = clean(raw, line, out);
  const nWords = line.text.split(/\s+/).length;
  const dur = sec(out);
  const old = prev?.voice === voiceId && prev?.scenes?.find((s) => s.id === line.id && s.text === line.text);
  const words = !retime && old?.words?.length && Math.abs(old.dur - dur) < 0.01 ? old.words : await wordTimes(out);

  const voF = Math.ceil(dur * FPS);
  const length = Math.max(P.lead + voF + P.tail, Math.round((line.minSec ?? 0) * P.minScale * FPS)) + Math.round((line.holdSec ?? 0) * P.holdScale * FPS);
  scenes.push({id: line.id, text: line.text, caption: line.caption, file: `voice/${TAG}/${line.id}.wav`, dur: +dur.toFixed(3), tempo: +tempo.toFixed(3),
    wpm: Math.round((nWords / dur) * 60), from, length, voFrom: from + P.lead, words});
  from += length - P.xf;
}
const total = scenes.at(-1).from + scenes.at(-1).length;
writeFileSync(tlPath, JSON.stringify({tag: TAG, script: SCRIPT, fps: FPS, xf: P.xf, voice: voiceId, pace: PACE, total, scenes}, null, 1));

const ts = (f) => {
  const s = f / FPS;
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${(s % 60).toFixed(3).padStart(6, '0')}`;
};
const vtt = ['WEBVTT', ''];
for (const s of scenes) vtt.push(`${ts(s.voFrom)} --> ${ts(s.voFrom + Math.ceil(s.dur * FPS))}`, s.text, '');
writeFileSync(join(ROOT, `out/${TAG}.vtt`), vtt.join('\n'));

// Re-generate the index so every timeline becomes a composition in Root.tsx.
const tags = readdirSync(tlDir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
const ident = (t) => `tl_${t.replace(/[^a-zA-Z0-9]/g, '_')}`;
writeFileSync(join(tlDir, 'index.ts'), [
  '// Generated by scripts/voice.mjs — one entry per timeline JSON in this folder.',
  ...tags.map((t) => `import ${ident(t)} from './${t}.json';`),
  '',
  `export const TIMELINES = {${tags.map((t) => `'${t}': ${ident(t)}`).join(', ')}};`,
  '',
].join('\n'));

for (const s of scenes) console.log(`${s.id.padEnd(11)} ${s.dur.toFixed(2)}s  ${s.wpm} wpm  x${s.tempo}  ${s.length}f`);
console.log(`[${TAG}] total ${total} frames = ${(total / FPS).toFixed(1)} s, voice ${voiceId}, pace ${PACE}`);
