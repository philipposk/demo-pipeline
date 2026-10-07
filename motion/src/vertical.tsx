import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {CL, SceneData, Word, useTiming} from './lib';

// Vertical (9:16) cuts for phones and social feeds. Every product draws its scenes on a 1920x1080 stage; a vertical cut
// shows that stage through a moving camera ("reframe") on a 1080x1920 canvas and adds big word-by-word captions, so
// the video works muted while scrolling. A product supports it by passing `format` to its Demo and giving a focus map:
// for each scene id, camera keys {x, y, z} in stage pixels, each landing on a spoken word (`at`) or at the scene start.

export type FocusKey = {x: number; y: number; z: number; at?: string; nth?: number; exact?: boolean; f?: number; d?: number};
export type FocusMap = Record<string, FocusKey[]>;

export const STAGE = {w: 1920, h: 1080};
const CAM = {damping: 24, stiffness: 90, mass: 1};

// Camera for the current scene-local frame: springs from key to key (a key whose word is not in this line is skipped,
// so one map serves every script that reuses the scene).
export const useFocus = (sc: SceneData, keys?: FocusKey[]) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {at} = useTiming(sc);
  const ks = keys?.length ? keys : [{x: STAGE.w / 2, y: STAGE.h / 2, z: 0.6}];
  let cur = {x: ks[0].x, y: ks[0].y, z: ks[0].z};
  for (const k of ks.slice(1)) {
    const base = k.at ? at(k.at, k.nth ?? 0, -1e6, k.exact) : (k.f ?? 0);
    if (base < -1e5) continue;
    const p = spring({frame: f - (base + (k.d ?? -8)), fps, config: CAM});
    cur = {x: cur.x + (k.x - cur.x) * p, y: cur.y + (k.y - cur.y) * p, z: cur.z + (k.z - cur.z) * p};
  }
  return cur;
};

// The stage, framed so focus point (x, y) sits at (canvas centre, cy), scaled by z.
export const Reframe: React.FC<{sc: SceneData; keys?: FocusKey[]; cy: number; children: React.ReactNode}> = ({sc, keys, cy, children}) => {
  const {width} = useVideoConfig();
  const {x, y, z} = useFocus(sc, keys);
  return (
    <div style={{position: 'absolute', left: 0, top: 0, width: STAGE.w, height: STAGE.h, transformOrigin: '0 0',
      transform: `translate(${width / 2 - x * z}px, ${cy - y * z}px) scale(${z})`}}>
      {children}
    </div>
  );
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9æøå]/g, '');

// Speech-to-text words (exact timings, but its own spelling: "acme", "AcmeTasks.") aligned to the script's words,
// so captions show the script's spelling at the spoken time.
export const alignWords = (text: string, heard: Word[]): Word[] => {
  const S = text.split(/\s+/).filter(Boolean);
  const out: Word[] = [];
  let j = 0;
  for (let i = 0; i < S.length; i++) {
    const s = norm(S[i]);
    const w = heard[Math.min(j, heard.length - 1)];
    if (!w) break;
    const w2 = heard[j + 1];
    if (j < heard.length && s !== norm(w.w) && w2 && norm(w.w) + norm(w2.w) === s) {
      out.push({w: S[i], s: w.s, e: w2.e}); // "built-in" heard as "built" "in"
      j += 2;
    } else if (j < heard.length && S[i + 1] && s + norm(S[i + 1]) === norm(w.w)) {
      const mid = (w.s + w.e) / 2; // "Acme Tasks" heard as "AcmeTasks"
      out.push({w: S[i], s: w.s, e: mid}, {w: S[i + 1], s: mid, e: w.e});
      i++;
      j++;
    } else {
      const last = out.at(-1);
      out.push(j < heard.length ? {w: S[i], s: w.s, e: w.e} : {w: S[i], s: last?.e ?? 0, e: (last?.e ?? 0) + 0.3});
      j++;
    }
  }
  return out;
};

// Groups of words that fit one caption block; a sentence end always closes a group.
const groupWords = (words: Word[], maxChars: number) => {
  const groups: number[][] = [];
  let cur: number[] = [];
  let len = 0;
  words.forEach((w, i) => {
    if (cur.length && len + 1 + w.w.length > maxChars) {
      groups.push(cur);
      cur = [];
      len = 0;
    }
    len += (cur.length ? 1 : 0) + w.w.length;
    cur.push(i);
    if (/[.?!:]$/.test(w.w)) {
      groups.push(cur);
      cur = [];
      len = 0;
    }
  });
  if (cur.length) groups.push(cur);
  return groups;
};

// Big captions: the block holding the spoken word, that word in the accent colour.
export const WordCaptions: React.FC<{sc: SceneData; font: string; color: string; accent: string; top: number; size?: number; maxChars?: number}> = ({
  sc, font, color, accent, top, size = 70, maxChars = 22,
}) => {
  const f = useCurrentFrame();
  const {fps, width} = useVideoConfig();
  const words = React.useMemo(() => alignWords(sc.text, sc.words), [sc.text, sc.words]);
  const groups = React.useMemo(() => groupWords(words, maxChars), [words, maxChars]);
  if (!words.length) return null;
  const t = (f - (sc.voFrom - sc.from)) / fps;
  let idx = 0;
  words.forEach((w, i) => {
    if (t >= w.s - 0.04) idx = i;
  });
  const gi = Math.max(0, groups.findIndex((g) => g.includes(idx)));
  const g = groups[gi];
  const gStart = words[g[0]].s;
  // quick fades, so the outgoing line is gone before the next scene's first word
  const o = interpolate(t, [words[0].s - 0.2, words[0].s - 0.05, words.at(-1)!.e + 0.15, words.at(-1)!.e + 0.35], [0, 1, 1, 0], CL);
  const pop = interpolate(t, [gStart - 0.05, gStart + 0.12], [0, 1], CL);
  return (
    <div style={{position: 'absolute', left: 0, top, width, display: 'flex', justifyContent: 'center', opacity: o}}>
      <div style={{maxWidth: width - 120, textAlign: 'center', fontFamily: font, fontSize: size, fontWeight: 700, lineHeight: 1.16,
        letterSpacing: '-0.02em', color, transform: `translateY(${(1 - pop) * 18}px) scale(${0.96 + 0.04 * pop})`}}>
        {g.map((wi, k) => (
          <span key={wi} style={{color: wi === idx && t <= words[wi].e + 0.15 ? accent : color, opacity: t >= words[wi].s - 0.04 ? 1 : 0.38}}>
            {words[wi].w}{k < g.length - 1 ? ' ' : ''}
          </span>
        ))}
      </div>
    </div>
  );
};

// Soft fades at the top and bottom, so the reframed stage melts into the canvas behind the header and captions.
export const EdgeFades: React.FC<{bg: string; top: number; bottom: number}> = ({bg, top, bottom}) => {
  const {height} = useVideoConfig();
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: top, background: `linear-gradient(180deg, ${bg} 55%, transparent)`}} />
      <div style={{position: 'absolute', left: 0, right: 0, top: height - bottom, height: bottom, background: `linear-gradient(0deg, ${bg} 62%, transparent)`}} />
    </AbsoluteFill>
  );
};
