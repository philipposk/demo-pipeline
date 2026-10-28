import React from 'react';
import {OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {CL} from './lib';

// Editing one long screen recording of a real run (README 4.8): cut it into pieces, speed some up, and frame each
// window of the screen in its own pane. Times are seconds; `o` is output (video) time, `s` is recording time.

export type Rect = {x: number; y: number; w: number; h: number};
// One piece plays recording [s0, s1] over output [o0, o1]; a piece shorter in output than in the recording is sped up.
export type Piece = {id: string; o0: number; o1: number; s0: number; s1: number};

export const makeEdit = (pieces: Piece[]) => {
  if (!pieces.length) throw new Error('makeEdit: no pieces');
  const speedOf = (p: Piece) => (p.s1 - p.s0) / (p.o1 - p.o0);
  const pieceAt = (o: number) => pieces.find((p) => o >= p.o0 && o < p.o1) ?? pieces[pieces.length - 1];
  const byId = (id: string) => {
    const p = pieces.find((q) => q.id === id);
    if (!p) throw new Error(`makeEdit: no piece "${id}"`);
    return p;
  };
  // recording second shown at output second o
  const srcAt = (o: number) => {
    const p = pieceAt(o);
    return p.s0 + Math.min(Math.max(0, o - p.o0), p.o1 - p.o0) * speedOf(p);
  };
  // output second of recording second s inside piece id (to place sounds, captions and narration)
  const outOf = (id: string, s: number) => {
    const p = byId(id);
    return p.o0 + (s - p.s0) / speedOf(p);
  };
  return {pieces, speedOf, pieceAt, byId, srcAt, outOf, end: pieces[pieces.length - 1].o1};
};
export type Edit = ReturnType<typeof makeEdit>;

// A camera shot for a pane, from output second `at`: show `view` (recording CSS px), optionally ring `ring`.
export type PaneShot = {at: number; view: Rect; ring?: Rect};
const lerpR = (a: Rect, b: Rect, k: number): Rect => ({x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k});
const CAM = {damping: 24, stiffness: 110, mass: 1};

export type PaneLook = {line: string; shadow: string; labelBg: string; labelFg: string; font: string; radius?: number};

/**
 * One window of the recording shown in a slot of the video. `view` is fitted into `box` (video px) and the pane takes
 * the view's shape, centred in the slot. `src` is the recording in CSS px (`w`, `h` at `scale` device px per CSS px).
 * `dy(s)`: extra downward shift of the content at recording second s (a browser bar that comes and goes).
 */
export const Pane: React.FC<{
  video: string; src: {w: number; h: number; fps: number; duration: number}; edit: Edit; box: Rect; shots: PaneShot[];
  ringColor: string; look: PaneLook; label?: string; dy?: (s: number) => number; o?: number;
}> = ({video, src, edit, box, shots, ringColor, look, label, dy, o: oProp}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const o = oProp ?? f / fps;
  const s = edit.srcAt(o);
  const shift = dy ? dy(s) : 0;
  let view = shots[0].view;
  let ring: {r: Rect; k: number} | null = null;
  for (const sh of shots) {
    const k = spring({frame: f - Math.round(sh.at * fps), fps, config: CAM});
    if (sh !== shots[0]) view = lerpR(view, sh.view, k);
    if (o >= sh.at) ring = sh.ring ? {r: sh.ring, k: interpolate(o - sh.at, [0.15, 0.4], [0, 1], CL)} : null;
  }
  const z = Math.min(box.w / view.w, box.h / view.h);
  const pw = view.w * z;
  const ph = view.h * z;
  // A held frame through a shifted Sequence, not <Freeze> (which clamps to the composition's length).
  const frameNo = Math.min(Math.round(s * src.fps), Math.floor(src.duration * src.fps) - 1);
  return (
    <div style={{position: 'absolute', left: box.x + (box.w - pw) / 2, top: box.y + (box.h - ph) / 2, width: pw, height: ph,
      borderRadius: look.radius ?? 18, overflow: 'hidden', background: '#000', border: `1px solid ${look.line}`, boxShadow: `0 30px 80px ${look.shadow}`}}>
      <div style={{position: 'absolute', left: 0, top: 0, width: src.w, height: src.h, transformOrigin: '0 0',
        transform: `translate(${-view.x * z}px, ${-(view.y + shift) * z}px) scale(${z})`}}>
        <Sequence from={f - frameNo} layout="none">
          <OffthreadVideo src={staticFile(video)} muted style={{width: src.w, height: src.h, display: 'block'}} />
        </Sequence>
        {ring && (
          <div style={{position: 'absolute', left: ring.r.x, top: ring.r.y + shift, width: ring.r.w, height: ring.r.h, borderRadius: 8,
            border: `${3 / z}px solid ${ringColor}`, boxShadow: `0 0 0 ${6 / z}px ${ringColor}40`, opacity: ring.k}} />
        )}
      </div>
      {label && (
        <div style={{position: 'absolute', left: 14, top: 12, padding: '5px 11px', borderRadius: 8, background: look.labelBg,
          color: look.labelFg, fontFamily: look.font, fontSize: 15, letterSpacing: '0.02em'}}>{label}</div>
      )}
    </div>
  );
};

/** "▶▶ ×N" while the current piece plays faster than real time, so a sped-up real run says so. */
export const SpeedBadge: React.FC<{edit: Edit; look: PaneLook; at?: {x: number; y: number}; min?: number}> = ({edit, look, at = {x: 40, y: 40}, min = 1.15}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const o = f / fps;
  const p = edit.pieceAt(o);
  const v = edit.speedOf(p);
  if (v < min) return null;
  const k = interpolate(o - p.o0, [0, 0.25], [0, 1], CL) * interpolate(p.o1 - o, [0, 0.2], [0, 1], CL);
  return (
    <div style={{position: 'absolute', left: at.x, top: at.y, padding: '6px 14px', borderRadius: 999, background: look.labelBg,
      color: look.labelFg, fontFamily: look.font, fontSize: 22, opacity: k}}>▶▶ ×{v >= 10 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')}</div>
  );
};
