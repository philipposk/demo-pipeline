import React from 'react';
import {AbsoluteFill, Easing, Html5Audio, Sequence, interpolate, interpolateColors, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, SERIF} from './theme';

export type Word = {w: string; s: number; e: number};
export type SceneData = {id: string; text: string; file: string; dur: number; from: number; length: number; voFrom: number; words: Word[]};
export type SceneProps = {sc: SceneData};

export const CL = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
export const EASE = Easing.bezier(0.22, 1, 0.36, 1);
export const lerp = (f: number, a: number, b: number, x: number, y: number, easing = EASE) =>
  interpolate(f, [a, b], [x, y], {...CL, easing});

export const SPRING = {damping: 14, stiffness: 170, mass: 0.7};
export const SNAP = {damping: 22, stiffness: 240, mass: 0.6};
export const BOUNCE = {damping: 9, stiffness: 200, mass: 0.6};

export const useSpring = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  return (at: number, config = SPRING) => spring({frame: f - at, fps, config});
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Scene-local frame at which a narration word starts, so motion lands on the spoken word.
export const useTiming = (sc: SceneData) => {
  const {fps} = useVideoConfig();
  const lead = sc.voFrom - sc.from;
  const fr = (s: number) => lead + Math.round(s * fps);
  return {
    at: (needle: string, nth = 0, fallback = 0, exact = false) => {
      const n = norm(needle);
      const hits = sc.words.filter((w) => (exact ? norm(w.w) === n : norm(w.w).startsWith(n)));
      return hits[nth] ? fr(hits[nth].s) : fallback;
    },
    wi: (i: number, fallback = 0) => (sc.words[i] ? fr(sc.words[i].s) : fallback),
  };
};

export const typed = (text: string, f: number, start: number, cps: number, fps = 30) =>
  text.slice(0, Math.max(0, Math.floor(((f - start) / fps) * cps)));

export const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export const Bg: React.FC = () => {
  const t = useCurrentFrame() / 30;
  const blob = (x: number, y: number, r: number, c: string) => (
    <div style={{position: 'absolute', left: x - r, top: y - r, width: 2 * r, height: 2 * r, borderRadius: '50%',
      background: `radial-gradient(circle at center, ${c} 0%, transparent 68%)`}} />
  );
  return (
    <AbsoluteFill style={{background: C.bg, overflow: 'hidden'}}>
      {blob(380 + Math.sin(t * 0.3) * 90, 1150 + Math.cos(t * 0.25) * 40, 780, C.glowA)}
      {blob(1600 + Math.cos(t * 0.27) * 100, 1130 + Math.sin(t * 0.2) * 50, 720, C.glowB)}
      {blob(1000 + Math.sin(t * 0.18) * 140, -170, 580, C.glowC)}
    </AbsoluteFill>
  );
};

// Scene wrapper: blur-dissolve in and out (scenes overlap by 10 frames) plus a slow camera drift.
export const Shell: React.FC<{length: number; xf: number; last?: boolean; children: React.ReactNode}> = ({length, xf, last, children}) => {
  const f = useCurrentFrame();
  const inP = lerp(f, 0, xf, 0, 1);
  const outP = last ? 0 : lerp(f, length - xf, length, 0, 1, Easing.in(Easing.cubic));
  const scale = interpolate(f, [0, length], [1, 1.03], CL) * (0.97 + 0.03 * inP) * (1 + 0.05 * outP);
  const blur = (1 - inP) * 10 + outP * 12;
  return (
    <AbsoluteFill style={{opacity: Math.min(inP, 1 - outP), transform: `scale(${scale})`, filter: blur > 0.1 ? `blur(${blur}px)` : undefined}}>
      {children}
    </AbsoluteFill>
  );
};

// Slow continuous camera for a held moment: eased push-in over `length` frames plus a small float, so a scene never sits frozen.
export const Drift: React.FC<{length: number; zoom?: number; float?: number; children: React.ReactNode}> = ({length, zoom = 0.07, float = 12, children}) => {
  const f = useCurrentFrame();
  const t = f / 30;
  const z = 1 + zoom * interpolate(f, [0, length], [0, 1], {...CL, easing: Easing.inOut(Easing.sin)});
  return (
    <AbsoluteFill style={{transform: `translate(${Math.cos(t * 0.8) * float * 0.7}px, ${Math.sin(t * 1.1) * float}px) scale(${z})`}}>
      {children}
    </AbsoluteFill>
  );
};

// Spring-in element (rise + scale + un-blur), optional blur-out at `out`.
export const Pop: React.FC<{
  at: number; children: React.ReactNode; dy?: number; dx?: number; scaleFrom?: number; blur?: number;
  config?: typeof SPRING; out?: number; style?: React.CSSProperties;
}> = ({at, children, dy = 36, dx = 0, scaleFrom = 0.92, blur = 10, config = SPRING, out, style}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const p = spring({frame: f - at, fps, config});
  const o = interpolate(f - at, [0, 6], [0, 1], CL);
  const q = out == null ? 0 : lerp(f, out, out + 8, 0, 1);
  const b = (1 - Math.min(p, 1)) * blur + q * 10;
  return (
    <div style={{opacity: o * (1 - q), filter: b > 0.2 ? `blur(${b}px)` : undefined,
      transform: `translate(${(1 - p) * dx}px, ${(1 - p) * dy - q * 40}px) scale(${scaleFrom + (1 - scaleFrom) * p})`, ...style}}>
      {children}
    </div>
  );
};

export const Headline: React.FC<{children: React.ReactNode; size?: number; italic?: boolean; color?: string; style?: React.CSSProperties}> = ({
  children, size = 150, italic, color = C.text, style,
}) => (
  <div style={{fontFamily: SERIF, fontSize: size, lineHeight: 1.04, letterSpacing: '-0.025em', fontStyle: italic ? 'italic' : 'normal',
    fontWeight: 400, color, whiteSpace: 'nowrap', ...style}}>
    {children}
  </div>
);

// Big centred refrain ("Every word."), one word per beat, blurs out at `out`.
export const Refrain: React.FC<{words: string[]; at: number[]; out: number; size?: number}> = ({words, at, out, size = 176}) => (
  <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
    <div style={{display: 'flex', gap: size * 0.24}}>
      {words.map((w, i) => (
        <Pop key={i} at={at[i] ?? at[0] + i * 6} out={out} dy={50}>
          <Headline size={size} italic={i === words.length - 1}>{w}</Headline>
        </Pop>
      ))}
    </div>
  </AbsoluteFill>
);

export const Card: React.FC<{children: React.ReactNode; style?: React.CSSProperties; r?: number; pad?: number | string}> = ({
  children, style, r = 28, pad = 44,
}) => (
  <div style={{position: 'relative', background: C.surface, border: `1px solid ${C.line}`, borderRadius: r, boxShadow: C.shadow,
    padding: pad, boxSizing: 'border-box', ...style}}>
    {children}
  </div>
);

export const Chip: React.FC<{children: React.ReactNode; dark?: boolean; style?: React.CSSProperties}> = ({children, dark, style}) => (
  <span style={{display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 18px', borderRadius: 999, background: dark ? C.ink : C.subtle,
    color: dark ? C.onInk : C.text2, fontSize: 24, fontWeight: 500, whiteSpace: 'nowrap', ...style}}>
    {children}
  </span>
);

export const Dot: React.FC<{color: string; size?: number}> = ({color, size = 14}) => (
  <span style={{display: 'inline-block', width: size, height: size, borderRadius: '50%', background: color, flexShrink: 0}} />
);

export const Eq: React.FC<{color?: string; h?: number}> = ({color = C.blue, h = 26}) => {
  const f = useCurrentFrame();
  return (
    <span style={{display: 'inline-flex', alignItems: 'flex-end', gap: 4, height: h}}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{width: 5, borderRadius: 3, background: color, height: h * (0.3 + 0.7 * Math.abs(Math.sin(f * 0.25 + i * 1.9)))}} />
      ))}
    </span>
  );
};

export const Toggle: React.FC<{on: number}> = ({on}) => (
  <span style={{position: 'relative', display: 'inline-block', width: 72, height: 42, borderRadius: 999,
    background: interpolateColors(Math.min(1, Math.max(0, on)), [0, 1], [C.line2, C.ink])}}>
    <span style={{position: 'absolute', top: 4, left: 4 + Math.min(1.1, on) * 30, width: 34, height: 34, borderRadius: '50%', background: interpolateColors(Math.min(1, Math.max(0, on)), [0, 1], ['#ffffff', C.onInk]),
      boxShadow: '0 1px 3px rgba(0,0,0,0.25)'}} />
  </span>
);

type Pt = {f: number; x: number; y: number};
// Pointer that glides along `path` (coords relative to the positioned parent) and clicks with a ripple.
export const Cursor: React.FC<{path: Pt[]; clicks?: number[]; size?: number}> = ({path, clicks = [], size = 46}) => {
  const f = useCurrentFrame();
  const start = path[0].f;
  if (f < start - 8) return null;
  let x = path[0].x;
  let y = path[0].y;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    if (f >= a.f) {
      const k = interpolate(f, [a.f, b.f], [0, 1], {...CL, easing: Easing.bezier(0.5, 0, 0.15, 1)});
      x = a.x + (b.x - a.x) * k;
      y = a.y + (b.y - a.y) * k;
    }
  }
  const last = clicks.filter((c) => f >= c).pop();
  const since = last == null ? 999 : f - last;
  const dip = interpolate(since, [0, 3, 8], [1, 0.8, 1], CL);
  const rr = interpolate(since, [0, 16], [8, 58], CL);
  return (
    <div style={{position: 'absolute', left: x, top: y, zIndex: 100, opacity: interpolate(f, [start - 8, start], [0, 1], CL)}}>
      {since < 16 && (
        <div style={{position: 'absolute', left: -rr, top: -rr, width: rr * 2, height: rr * 2, borderRadius: '50%',
          border: `4px solid ${C.blue}`, opacity: interpolate(since, [0, 16], [0.55, 0], CL)}} />
      )}
      <svg width={size} height={size} viewBox="0 0 24 24" style={{position: 'absolute', left: -size * 0.125, top: -size * 0.083,
        transform: `scale(${dip})`, transformOrigin: '12.5% 8.3%', filter: 'drop-shadow(0 3px 4px rgba(0,0,0,0.25))'}}>
        <path d="M3 2 L3 19.5 L7.6 15.2 L10.6 21.6 L13.6 20.3 L10.6 14 L17 14 Z" fill="#111" stroke="#fff" strokeWidth={1.5} strokeLinejoin="round" />
      </svg>
    </div>
  );
};

export const Sfx: React.FC<{at: number; src: string; volume?: number}> = ({at, src, volume = 0.45}) => (
  <Sequence from={Math.max(0, at)} durationInFrames={30} layout="none">
    <Html5Audio src={staticFile(src)} volume={volume} />
  </Sequence>
);

type IP = {size?: number; color?: string; sw?: number};
const Icon: React.FC<IP & {children: React.ReactNode}> = ({size = 32, color = 'currentColor', sw = 2, children}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{display: 'block'}}>
    {children}
  </svg>
);
export const IconUpload = (p: IP) => <Icon {...p}><path d="M12 15V4" /><path d="M7 9l5-5 5 5" /><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></Icon>;
export const IconLink = (p: IP) => <Icon {...p}><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" /><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" /></Icon>;
export const IconMic = (p: IP) => <Icon {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" /></Icon>;
export const IconFolder = (p: IP) => <Icon {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></Icon>;
export const IconDoc = (p: IP) => <Icon {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></Icon>;
export const IconCheck = (p: IP) => <Icon {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Icon>;
export const IconChevron = (p: IP) => <Icon {...p}><path d="M9 6l6 6-6 6" /></Icon>;
export const IconSpark = (p: IP) => <Icon {...p}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></Icon>;
export const IconCode = (p: IP) => <Icon {...p}><path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" /></Icon>;
export const IconAudio = (p: IP) => <Icon {...p}><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" /></Icon>;
export const IconCopy = (p: IP) => <Icon {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></Icon>;
