import React from 'react';
import {useCurrentFrame} from 'remotion';
import {C, Theme, applyTheme} from '../theme';

// Everything Catchy-specific that the shared engine does not carry: its logo, its meeting speakers and its theme call.
// Catchy's palette and type (Inter, Newsreader, Geist Mono) are the engine's default tokens in src/theme.ts, so nothing is
// overridden here; a product with different brand values would Object.assign(C, ...) inside applyCatchyTheme.

// The speakers in the demo meetings. Deepened slightly on light so names read on white.
const SPK_LIGHT = {Maya: '#3f86f0', Jonas: '#9a6cf0', Priya: '#22a565', Sam: '#e0912a'};
const SPK_DARK = {Maya: '#6ea8fe', Jonas: '#b794f6', Priya: '#54d18c', Sam: '#f5b651'};
export const SPK: Record<string, string> = {...SPK_LIGHT};

export const applyCatchyTheme = (theme: Theme) => {
  applyTheme(theme);
  Object.assign(SPK, theme === 'dark' ? SPK_DARK : SPK_LIGHT);
};

// The logo: inverse rounded square with four bars. `live` makes the bars dance.
const BARS = [{x: 6, y: 13, h: 6}, {x: 11.5, y: 9, h: 14}, {x: 17, y: 4.5, h: 23}, {x: 22.5, y: 11, h: 10}];
export const Logo: React.FC<{size: number; live?: boolean}> = ({size, live}) => {
  const f = useCurrentFrame();
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{display: 'block'}}>
      <rect width="32" height="32" rx="8" fill={C.ink} />
      {BARS.map((b, i) => {
        const h = b.h * (live ? 0.6 + 0.4 * Math.abs(Math.sin(f * 0.16 + i * 1.7)) : 1);
        return <rect key={i} x={b.x} y={b.y + b.h / 2 - h / 2} width={3} height={h} rx={1.5} fill={C.onInk} />;
      })}
    </svg>
  );
};
