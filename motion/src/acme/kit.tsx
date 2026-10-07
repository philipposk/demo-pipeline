import React from 'react';
import {C} from '../theme';

// Acme Tasks is a made-up product. This file holds its mark and the small UI parts its scenes share.

// The mark: an inverse rounded square with a check. `draw` (0..1) draws the tick.
export const Mark: React.FC<{size: number; draw?: number}> = ({size, draw = 1}) => (
  <svg width={size} height={size} viewBox="0 0 32 32" style={{display: 'block'}}>
    <rect width="32" height="32" rx="8" fill={C.ink} />
    <path d="M9 16.5l4.8 4.8L23 11.5" fill="none" stroke={C.onInk} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"
      pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
  </svg>
);

export const ROW_H = 88;

// A to-do row: round checkbox + title + tag. `done` (0..1) fills the box, draws the tick and strikes the title through.
export const TaskRow: React.FC<{title: string; tag?: string; done?: number; fresh?: number}> = ({title, tag, done = 0, fresh = 0}) => {
  const checked = done > 0.5;
  return (
    <div style={{position: 'relative', height: ROW_H, display: 'flex', alignItems: 'center', gap: 24, padding: '0 8px', boxSizing: 'border-box',
      borderBottom: `1px solid ${C.line}`}}>
      <div style={{position: 'absolute', inset: '6px -8px', borderRadius: 14, background: C.blueSoft, opacity: fresh}} />
      <span style={{position: 'relative', width: 40, height: 40, borderRadius: '50%', boxSizing: 'border-box', flexShrink: 0, display: 'grid', placeItems: 'center',
        border: `3px solid ${checked ? C.green : C.line2}`, background: checked ? C.green : 'transparent'}}>
        <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={C.onInk} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round"
          style={{opacity: checked ? 1 : 0}}>
          <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - Math.min(1, Math.max(0, (done - 0.5) * 2))} />
        </svg>
      </span>
      <span style={{position: 'relative', flex: 1, fontSize: 34, fontWeight: 500, color: checked ? C.muted : C.text,
        textDecoration: checked ? 'line-through' : 'none', textDecorationColor: C.muted}}>
        {title}
      </span>
      {tag && (
        <span style={{position: 'relative', padding: '6px 16px', borderRadius: 999, background: C.subtle, color: C.text2, fontSize: 24, fontWeight: 500}}>{tag}</span>
      )}
    </div>
  );
};

// The app window both scenes draw: a fixed-size card (so it never jumps as rows arrive) with a title, a counter and an input.
// Geometry, in the card's padding box, used for cursor targets: input top 136, height 80; first row top 240, rows 88 high.
export const CARD = {w: 1000, h: 640, pad: 44, inputTop: 136, inputH: 80, listTop: 240};

export const Counter: React.FC<{n: number}> = ({n}) => (
  <span style={{padding: '8px 20px', borderRadius: 999, background: C.subtle, color: C.text2, fontSize: 28, fontWeight: 600}}>{n} left</span>
);
