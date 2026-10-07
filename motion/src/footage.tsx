import React from 'react';
import {Freeze, OffthreadVideo, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {CL} from './lib';

// Real-app footage from capture/record.mjs, played inside a scene: the step's stretch of the recording (waits sped
// up, last frame held), a camera that zooms to each logged focus box, a drawn cursor with click ripples, and a ring
// around the focused element. Everything lives in the app's CSS-pixel space, so one transform frames it all.

export type CapEvent = {t: number; type: string; x?: number; y?: number; box?: Box | null; zoom?: number; ring?: boolean; text?: string};
export type Box = {x: number; y: number; width: number; height: number};
export type Capture = {name: string; w: number; h: number; css: {width: number; height: number}; dpr: number; fps: number; duration: number;
  steps: {id: string; t0: number; t1: number}[]; events: CapEvent[]};

const CAM = {damping: 26, stiffness: 95, mass: 1};

// Source time for a scene time: normal stretches at 1x, logged waits compressed to about 0.8 s, then a held frame.
export const stepClock = (cap: Capture, id: string) => {
  const st = cap.steps.find((s) => s.id === id);
  if (!st) throw new Error(`capture ${cap.name} has no step "${id}"`);
  const evs = cap.events.filter((e) => e.t >= st.t0 && e.t <= st.t1);
  const segs: [number, number, number][] = [];
  let cur = st.t0;
  let ws: number | null = null;
  for (const e of evs) {
    if (e.type === 'wait-start') ws = e.t;
    if (e.type === 'wait-end' && ws != null) {
      if (ws > cur) segs.push([cur, ws, 1]);
      segs.push([ws, e.t, Math.max(1, Math.min(8, (e.t - ws) / 0.8))]);
      cur = e.t;
      ws = null;
    }
  }
  if (st.t1 > cur) segs.push([cur, st.t1, 1]);
  const length = segs.reduce((n, [a, b, r]) => n + (b - a) / r, 0);
  const src = (s: number) => {
    let acc = 0;
    for (const [a, b, r] of segs) {
      const d = (b - a) / r;
      if (s <= acc + d) return a + (s - acc) * r;
      acc += d;
    }
    return st.t1;
  };
  const scene = (t: number) => {
    let acc = 0;
    for (const [a, b, r] of segs) {
      if (t <= b) return acc + Math.max(0, t - a) / r;
      acc += (b - a) / r;
    }
    return acc;
  };
  return {st, evs, length, src, scene};
};

const cursorAt = (evs: CapEvent[], t: number) => {
  const pts = evs.filter((e) => e.type === 'cursor' || e.type === 'click');
  if (!pts.length || t < pts[0].t) return null;
  let i = pts.findIndex((p) => p.t > t);
  if (i === -1) return {x: pts.at(-1)!.x!, y: pts.at(-1)!.y!};
  const a = pts[i - 1];
  const b = pts[i];
  const k = (t - a.t) / Math.max(1e-3, b.t - a.t);
  return {x: a.x! + (b.x! - a.x!) * k, y: a.y! + (b.y! - a.y!) * k};
};

// A camera target: the region of the app (CSS px) to show, as centre + zoom.
type View = {cx: number; cy: number; z: number};

export const Footage: React.FC<{
  cap: Capture; step: string; width: number; height: number; fit?: 'contain' | 'follow'; baseZoom?: number; ringColor: string; radius?: number;
  lead?: number;
}> = ({cap, step, width, height, fit = 'contain', baseZoom = 1, ringColor, radius = 18, lead = 0}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const clock = React.useMemo(() => stepClock(cap, step), [cap, step]);
  const s = Math.max(0, (f - lead) / fps);
  const t = clock.src(s);
  const {css} = cap;
  const k = Math.min(width / css.width, height / css.height); // CSS px -> window px at zoom 1
  const full: View = {cx: css.width / 2, cy: css.height / 2, z: fit === 'contain' ? 1 : baseZoom};
  const zoomFor = (b: Box, want: number) =>
    Math.max(1, Math.min(want, width / (k * b.width * 1.08), height / (k * b.height * 1.08)));
  const clampView = (v: View): View => {
    const halfW = width / (2 * k * v.z);
    const halfH = height / (2 * k * v.z);
    const cx = halfW * 2 >= css.width ? css.width / 2 : Math.min(css.width - halfW, Math.max(halfW, v.cx));
    const cy = halfH * 2 >= css.height ? css.height / 2 : Math.min(css.height - halfH, Math.max(halfH, v.cy));
    return {cx, cy, z: v.z};
  };
  // focus events in this step, as springs in scene time
  const focuses = clock.evs.filter((e) => e.type === 'focus');
  let view: View = full;
  if (fit === 'follow') {
    const c = cursorAt(cap.events, t);
    if (c) view = {cx: c.x, cy: c.y, z: baseZoom};
  }
  let ring: {box: Box; o: number} | null = null;
  for (const e of focuses) {
    const at = (clock.scene(e.t) * fps) + lead;
    const p = spring({frame: f - at, fps, config: CAM});
    const target: View = e.box ? {cx: e.box.x + e.box.width / 2, cy: e.box.y + e.box.height / 2, z: zoomFor(e.box, (e.zoom ?? 1.6) * (fit === 'follow' ? 1 : 1))} : full;
    view = {cx: view.cx + (target.cx - view.cx) * p, cy: view.cy + (target.cy - view.cy) * p, z: view.z + (target.z - view.z) * p};
    if (f >= at) ring = e.box && e.ring !== false ? {box: e.box, o: interpolate(f - at, [6, 14], [0, 1], CL)} : null;
  }
  view = clampView(view);
  const z = view.z;
  const tx = width / 2 - view.cx * k * z;
  const ty = height / 2 - view.cy * k * z;
  const cur = cursorAt(clock.evs.length ? cap.events : [], t);
  const clicks = clock.evs.filter((e) => e.type === 'click');
  const lastClick = clicks.filter((c) => c.t <= t).at(-1);
  const since = lastClick ? (clock.scene(t) - clock.scene(lastClick.t)) * fps : 999;
  const px = 1 / (k * z); // one screen pixel in CSS px
  return (
    <div style={{position: 'relative', width, height, overflow: 'hidden', borderRadius: radius}}>
      <div style={{position: 'absolute', left: 0, top: 0, width: css.width, height: css.height, transformOrigin: '0 0',
        transform: `translate(${tx}px, ${ty}px) scale(${k * z})`}}>
        <Freeze frame={Math.min(Math.round(t * cap.fps), Math.floor(cap.duration * cap.fps) - 1)}>
          <OffthreadVideo src={staticFile(`capture/${cap.name}.mp4`)} muted style={{width: css.width, height: css.height, display: 'block'}} />
        </Freeze>
        {ring && (
          <div style={{position: 'absolute', left: ring.box.x, top: ring.box.y, width: ring.box.width, height: ring.box.height, borderRadius: 10 * px * 2,
            border: `${3 * px}px solid ${ringColor}`, boxShadow: `0 0 0 ${6 * px}px ${ringColor}33`, opacity: ring.o}} />
        )}
        {cur && (
          <div style={{position: 'absolute', left: cur.x, top: cur.y}}>
            {since < 16 && (
              <div style={{position: 'absolute', left: -since * 2.4 * px * 3, top: -since * 2.4 * px * 3, width: since * 4.8 * px * 3, height: since * 4.8 * px * 3,
                borderRadius: '50%', border: `${3 * px}px solid ${ringColor}`, opacity: interpolate(since, [0, 16], [0.6, 0], CL)}} />
            )}
            <svg width={30 * px * 1.4} height={30 * px * 1.4} viewBox="0 0 24 24" style={{position: 'absolute', left: -3 * px, top: -2 * px,
              filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.3))', transform: `scale(${interpolate(since, [0, 3, 8], [0.82, 0.82, 1], CL)})`,
              transformOrigin: '12% 8%'}}>
              <path d="M3 2 L3 19.5 L7.6 15.2 L10.6 21.6 L13.6 20.3 L10.6 14 L17 14 Z" fill="#111" stroke="#fff" strokeWidth={1.5} strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
};
