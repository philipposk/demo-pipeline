// Multi-backend TTS dispatcher.
// All backends share the same contract:
//   narrate(text, opts, outWavPath) -> Promise<{ durationSec, charsUsed }>
//
// Backend chosen by opts.backend: 'edge' | 'kokoro' | 'openai' | 'elevenlabs' | 'say'

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, unlinkSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Top-level entry — dispatches to a backend.
 * @param {string} text
 * @param {object} opts                 - { backend, voice, model, rate }
 * @param {string} outWavPath
 * @returns {Promise<{durationSec:number, charsUsed:number}>}
 */
export async function narrate(text, opts, outWavPath) {
  const backend = opts.backend || 'say';
  switch (backend) {
    case 'say':        return narrateSay(text, opts, outWavPath);
    case 'edge':       return narrateEdge(text, opts, outWavPath);
    case 'openai':     return narrateOpenAI(text, opts, outWavPath);
    case 'elevenlabs': return narrateElevenLabs(text, opts, outWavPath);
    case 'kokoro':     return narrateKokoro(text, opts, outWavPath);
    default: throw new Error(`Unknown backend: ${backend}`);
  }
}

/**
 * Two-voice (or N-voice) dialogue narration. Narrates each turn with its OWN voice,
 * then concatenates the clips with a short gap so a male "user" and female "assistant"
 * trade lines within a single scene. Powers the product-demo mode.
 *
 * @param {Array<{text:string, opts:object}>} turns  - per-turn text + TTS opts (backend/voice)
 * @param {string} outWavPath
 * @param {string} workDir
 * @returns {Promise<{durationSec:number, charsUsed:number}>}
 */
export async function narrateDialogue(turns, outWavPath, workDir) {
  mkdirSync(workDir, { recursive: true });
  const parts = [];
  let chars = 0;
  for (const [i, t] of turns.entries()) {
    const w = path.join(workDir, `turn-${String(i).padStart(2, '0')}.wav`);
    const { charsUsed } = await narrate(t.text, t.opts, w);
    chars += charsUsed;
    parts.push(w);
  }
  const gapPath = path.join(workDir, 'gap.wav');
  await silenceWav(0.3, gapPath);
  const listPath = path.join(workDir, 'dialogue.txt');
  const lines = [];
  parts.forEach((p, i) => {
    if (i) lines.push(`file '${gapPath}'`);
    lines.push(`file '${p}'`);
  });
  writeFileSync(listPath, lines.join('\n'));
  await exec('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', listPath,
    '-ar', '44100', '-ac', '2', outWavPath,
  ]);
  return { durationSec: await probeDuration(outWavPath), charsUsed: chars };
}

async function silenceWav(seconds, outPath) {
  await exec('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-t', String(seconds.toFixed(3)), outPath,
  ]);
}

// ─────────────────────────────────────────── helpers

async function probeDuration(wavPath) {
  try {
    const { stdout } = await exec('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      wavPath,
    ]);
    return parseFloat(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

async function normaliseToWav(srcPath, outWavPath) {
  await exec('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-i', srcPath,
    '-ar', '44100', '-ac', '2',
    outWavPath,
  ]);
}

// ─────────────────────────────────────────── macOS `say`

async function narrateSay(text, opts, outWavPath) {
  const voice = opts.voice || 'Samantha';
  const rate = opts.rate || 175;
  const aiff = outWavPath.replace(/\.wav$/, '.aiff');
  if (existsSync(aiff)) unlinkSync(aiff);
  if (existsSync(outWavPath)) unlinkSync(outWavPath);
  await exec('say', ['-v', voice, '-r', String(rate), '-o', aiff, text]);
  await normaliseToWav(aiff, outWavPath);
  unlinkSync(aiff);
  return { durationSec: await probeDuration(outWavPath), charsUsed: text.length };
}

// ─────────────────────────────────────────── edge-tts (Microsoft Edge neural — FREE)

async function narrateEdge(text, opts, outWavPath) {
  // node-edge-tts is CommonJS; bridge via dynamic import in this ESM module.
  const mod = await import('node-edge-tts');
  const EdgeTTS = mod.EdgeTTS || mod.default?.EdgeTTS || mod.default;
  const voice = opts.voice || 'en-US-AvaMultilingualNeural';
  // Best narration voices: en-US-AvaMultilingualNeural (f), en-US-AndrewMultilingualNeural (m),
  // en-US-EmmaMultilingualNeural (f), en-US-BrianMultilingualNeural (m).
  const rate = opts.edgeRate || '+0%';
  const pitch = opts.edgePitch || '+0Hz';

  const tts = new EdgeTTS({
    voice,
    outputFormat: 'audio-24khz-96kbitrate-mono-mp3',
    rate,
    pitch,
    volume: '+0%',
    timeout: 20000,
  });

  const mp3Path = outWavPath.replace(/\.wav$/, '.edge.mp3');
  if (existsSync(mp3Path)) unlinkSync(mp3Path);

  // Retry — unofficial endpoint occasionally drops the connection.
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await tts.ttsPromise(text, mp3Path);
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  if (lastErr) throw new Error(`edge-tts failed after retries: ${lastErr.message}`);

  await normaliseToWav(mp3Path, outWavPath);
  unlinkSync(mp3Path);
  return { durationSec: await probeDuration(outWavPath), charsUsed: text.length };
}

// ─────────────────────────────────────────── OpenAI TTS

async function narrateOpenAI(text, opts, outWavPath) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY missing in .env');
  const model = opts.model || 'tts-1-hd';                    // tts-1 / tts-1-hd / gpt-4o-mini-tts
  const voice = opts.voice || 'nova';                        // alloy, echo, fable, onyx, nova, shimmer, sage, coral...
  const speed = opts.speed || 1.0;

  const body = { model, voice, input: text, response_format: 'wav', speed };
  // gpt-4o-mini-tts supports steerable tone via `instructions`.
  if (model === 'gpt-4o-mini-tts' && opts.instructions) body.instructions = opts.instructions;

  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`OpenAI TTS ${res.status}: ${errBody.slice(0, 300)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const tmpPath = outWavPath + '.raw.wav';
  writeFileSync(tmpPath, buf);
  await normaliseToWav(tmpPath, outWavPath);
  unlinkSync(tmpPath);
  return { durationSec: await probeDuration(outWavPath), charsUsed: text.length };
}

// ─────────────────────────────────────────── ElevenLabs

async function narrateElevenLabs(text, opts, outWavPath) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY missing in .env');
  // Voice IDs from https://api.elevenlabs.io/v1/voices  — Rachel by default.
  const voiceId = opts.voice || '21m00Tcm4TlvDq8ikWAM';            // "Rachel" — clear female narrator
  const modelId = opts.model || 'eleven_turbo_v2_5';               // cheap + fast + good

  // mp3_44100_128 is allowed on the free tier; pcm_* is Pro+. We re-encode to WAV with ffmpeg below.
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0 },
      }),
    }
  );
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`ElevenLabs ${res.status}: ${errBody.slice(0, 300)}`);
  }
  const mp3 = Buffer.from(await res.arrayBuffer());
  const rawPath = outWavPath + '.mp3';
  writeFileSync(rawPath, mp3);
  await normaliseToWav(rawPath, outWavPath);
  unlinkSync(rawPath);
  return { durationSec: await probeDuration(outWavPath), charsUsed: text.length };
}

// ─────────────────────────────────────────── Kokoro-82M (local)

let _kokoroTTS = null;
async function getKokoro() {
  if (_kokoroTTS) return _kokoroTTS;
  const { KokoroTTS } = await import('kokoro-js');
  // First run downloads ~330 MB model. Cached in ~/.cache/huggingface.
  _kokoroTTS = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
    dtype: 'q8',          // quantised — small + fast, slight quality dip vs fp32
    device: 'cpu',        // 'wasm' fallback if needed; MPS not yet wired in transformers.js
  });
  return _kokoroTTS;
}

async function narrateKokoro(text, opts, outWavPath) {
  const voice = opts.voice || 'af_bella';  // af_bella, am_michael, bf_emma, bm_george, etc.
  const tts = await getKokoro();
  const audio = await tts.generate(text, { voice });
  // kokoro-js exposes a .save(path) helper for WAV.
  const tmpPath = outWavPath + '.kokoro.wav';
  await audio.save(tmpPath);
  await normaliseToWav(tmpPath, outWavPath);
  unlinkSync(tmpPath);
  return { durationSec: await probeDuration(outWavPath), charsUsed: text.length };
}
