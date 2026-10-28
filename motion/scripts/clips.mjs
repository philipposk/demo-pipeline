// Voices for people inside a video (a client on a call, a team in a meeting), as opposed to the narrator
// (scripts/voice.mjs). Each clip is one or more lines, each line its own voice, joined with short gaps; every line gets
// word times, so a harness page can type the words in time with the clip and the composition can light up captions.
//
// Usage: node scripts/clips.mjs <spec.json>
//   spec: {"out": "public/<product>", "model": "gpt-4o-mini-tts", "lang": "en",
//          "lines": [{"clip": "client", "voice": "coral", "text": "…", "style": "…", "gap": 0.45, "take": 2}]}
// Output: <out>/<clip>.wav per clip and <out>/clips.json {clip: {sec, lines: [{voice, text, s, e, words: [[w, s, e]]}]}}
// (times in seconds from the clip's start). Takes are cached in out/clips-cache by voice + style + text (+ take).
// Pick clearly different voices for different people: two similar voices get merged into one speaker by a recogniser.
// OPENAI_API_KEY (and DEEPGRAM_API_KEY, for tighter word times) are read from the environment, then <project>/.env, then
// the file named by ENV_FILE (optional), in that order.
import {readFileSync, writeFileSync, mkdirSync, existsSync, rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readEnv = (f) =>
  existsSync(f)
    ? Object.fromEntries(readFileSync(f, 'utf8').split('\n').map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean)
      .map((m) => [m[1], m[2].replace(/^['"]|['"]$/g, '')]))
    : {};
const envs = [readEnv(join(ROOT, '.env')), process.env.ENV_FILE ? readEnv(process.env.ENV_FILE) : {}];
const keyOf = (name) => process.env[name] || envs.map((e) => e[name]).find(Boolean);
const OPENAI = keyOf('OPENAI_API_KEY');
const DG = keyOf('DEEPGRAM_API_KEY');

if (!process.argv[2]) throw new Error('usage: node scripts/clips.mjs <spec.json>');
const spec = JSON.parse(readFileSync(resolve(process.argv[2]), 'utf8'));
if (!spec.out || !Array.isArray(spec.lines) || !spec.lines.length) throw new Error('the spec needs "out" and a list of "lines"');
for (const l of spec.lines) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(l.clip ?? '')) throw new Error(`clip name "${l.clip}": letters, numbers, dashes`);
  if (!l.voice || !l.text) throw new Error(`clip "${l.clip}": every line needs "voice" and "text"`);
}
if (!OPENAI) throw new Error('OPENAI_API_KEY is needed');
const out = join(ROOT, spec.out);
const cache = join(ROOT, 'out/clips-cache');
for (const d of [out, cache]) mkdirSync(d, {recursive: true});
const ff = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args]);
const sec = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());
const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 10);
const LANG = spec.lang || '';

async function tts(line, file) {
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {Authorization: `Bearer ${OPENAI}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({model: spec.model || 'gpt-4o-mini-tts', voice: line.voice, input: line.text, instructions: line.style || '', response_format: 'wav'}),
  });
  if (!r.ok) throw new Error(`TTS ${r.status}: ${(await r.text()).slice(0, 300)}`);
  writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}

// Deepgram's word times when its key exists, else Whisper's.
async function words(file) {
  if (!DG) {
    const fd = new FormData();
    fd.append('file', new Blob([readFileSync(file)], {type: 'audio/wav'}), 'line.wav');
    fd.append('model', 'whisper-1');
    fd.append('response_format', 'verbose_json');
    fd.append('timestamp_granularities[]', 'word');
    if (LANG) fd.append('language', LANG.split('-')[0]);
    const w = await fetch('https://api.openai.com/v1/audio/transcriptions', {method: 'POST', headers: {Authorization: `Bearer ${OPENAI}`}, body: fd});
    if (!w.ok) throw new Error(`STT ${w.status}: ${(await w.text()).slice(0, 300)}`);
    return ((await w.json()).words || []).map((x) => [x.word, +x.start.toFixed(2), +x.end.toFixed(2)]);
  }
  const r = await fetch(`https://api.deepgram.com/v1/listen?model=nova-3&punctuate=true${LANG ? `&language=${LANG}` : ''}`, {
    method: 'POST', headers: {Authorization: `Token ${DG}`, 'Content-Type': 'audio/wav'}, body: readFileSync(file),
  });
  if (!r.ok) throw new Error(`STT ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const ws = (await r.json()).results?.channels?.[0]?.alternatives?.[0]?.words || [];
  return ws.map((w) => [w.punctuated_word || w.word, +w.start.toFixed(2), +w.end.toFixed(2)]);
}

const clips = {};
for (const line of spec.lines) (clips[line.clip] ??= []).push(line);
const result = {};
for (const [clip, lines] of Object.entries(clips)) {
  const parts = [];
  const meta = [];
  let t = 0;
  for (const [i, line] of lines.entries()) {
    const raw = join(cache, `${line.voice}-${hash(`${line.style || ''}|${line.text}`)}${line.take ? `.t${line.take}` : ''}.wav`);
    if (!existsSync(raw)) {
      if (line.take) throw new Error(`${clip}: take ${line.take} of "${line.text.slice(0, 30)}" is missing (${raw})`);
      await tts(line, raw);
    }
    // trim the take's own silence at both ends, keep a few ms of lead-in
    const trimmed = join(cache, `${clip}-${i}.trim.wav`);
    ff(['-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.04,areverse,' +
      'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse', '-ar', '48000', '-ac', '1', trimmed]);
    const len = sec(trimmed);
    const gap = i ? (line.gap ?? 0.45) : 0;
    if (gap) {
      const sil = join(cache, `${clip}-${i}.gap.wav`);
      ff(['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', gap.toFixed(3), sil]);
      parts.push(sil);
      t += gap;
    }
    parts.push(trimmed);
    meta.push({voice: line.voice, text: line.text, s: +t.toFixed(2), e: +(t + len).toFixed(2),
      words: (await words(trimmed)).map(([w, s, e]) => [w, +(s + t).toFixed(2), +(e + t).toFixed(2)])});
    t += len;
  }
  const list = join(cache, `${clip}.txt`);
  writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n'));
  ff(['-f', 'concat', '-safe', '0', '-i', list, '-ar', '48000', '-ac', '1', join(out, `${clip}.wav`)]);
  for (const p of parts) rmSync(p, {force: true});
  rmSync(list);
  result[clip] = {sec: +t.toFixed(2), lines: meta};
  console.log(`${clip}: ${t.toFixed(2)} s, ${lines.length} line(s)`);
}
const jsonPath = join(out, 'clips.json');
const prev = existsSync(jsonPath) ? JSON.parse(readFileSync(jsonPath, 'utf8')) : {};
writeFileSync(jsonPath, JSON.stringify({...prev, ...result}, null, 1));
console.log(`clips.json: ${Object.keys(result).join(', ')}`);
