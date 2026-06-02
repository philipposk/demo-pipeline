// Subtitle generation — we already know each scene's narration text and audio
// duration, so we build a perfectly-synced SRT directly. No Whisper needed.
// Each scene is split into readable cues (≤2 lines) timed proportionally to
// character count across the scene's audio window.

/** Seconds → "HH:MM:SS,mmm" SRT timestamp. */
function srtTime(sec) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const milli = ms % 1000;
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(milli, 3)}`;
}

/** Split text into chunks of ≤ maxChars, breaking on sentence/clause/space. */
function chunk(text, maxChars = 84) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return [clean];
  const words = clean.split(' ');
  const chunks = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars) {
      if (cur) chunks.push(cur.trim());
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
    // Prefer to break right after sentence-ending punctuation.
    if (/[.!?]$/.test(cur) && cur.length > maxChars * 0.5) {
      chunks.push(cur.trim());
      cur = '';
    }
  }
  if (cur) chunks.push(cur.trim());
  return chunks;
}

/** Wrap a chunk to ≤2 display lines of ~42 chars. */
function twoLines(text, maxLen = 42) {
  if (text.length <= maxLen) return text;
  const words = text.split(' ');
  let a = '';
  let i = 0;
  for (; i < words.length; i++) {
    if ((a + ' ' + words[i]).trim().length > maxLen) break;
    a = (a + ' ' + words[i]).trim();
  }
  const b = words.slice(i).join(' ');
  return b ? `${a}\n${b}` : a;
}

/**
 * Build SRT from enriched scenes.
 * @param {Array<{narration:string, audioSec:number, sceneSec:number}>} scenes
 * @param {number} offsetSec  - leading offset (e.g. intro card duration).
 * @param {number} prerollSec - silence before each scene's voice (matches merge.mjs).
 */
export function buildSrt(scenes, offsetSec = 0, prerollSec = 0.2) {
  const blocks = [];
  let cum = offsetSec;
  let idx = 1;
  for (const s of scenes) {
    const start = cum + prerollSec;
    const parts = chunk(s.narration, 84);
    const totalChars = parts.reduce((n, p) => n + p.length, 0) || 1;
    let t = start;
    for (const part of parts) {
      const dur = s.audioSec * (part.length / totalChars);
      const cueStart = t;
      const cueEnd = t + dur;
      blocks.push(`${idx}\n${srtTime(cueStart)} --> ${srtTime(cueEnd)}\n${twoLines(part)}\n`);
      idx += 1;
      t = cueEnd;
    }
    cum += s.sceneSec;
  }
  return blocks.join('\n');
}
