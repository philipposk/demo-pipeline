import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {CL} from './lib';
import {C} from './theme';

// Silent cut: the narration becomes a caption pill at the bottom, revealed word by word over the line's slot.
// `start` is the scene-local frame where the line starts, `span` its length in frames, `length`/`xf` the scene's.
export const Caption: React.FC<{text: string; start: number; span: number; length: number; xf: number}> = ({text, start, span, length, xf}) => {
  const f = useCurrentFrame();
  const words = text.split(' ');
  const shown = Math.floor(((f - start) / Math.max(1, span * 0.85)) * words.length) + 1;
  const o = interpolate(f, [start - 6, start, length - xf - 4, length - xf], [0, 1, 1, 0], CL);
  return (
    <div style={{position: 'absolute', left: 0, right: 0, bottom: 34, display: 'flex', justifyContent: 'center', opacity: o,
      transform: `translateY(${(1 - Math.min(1, (f - start + 6) / 8)) * 20}px)`}}>
      <div style={{maxWidth: 1640, padding: '14px 32px', borderRadius: 999, background: C.surface, border: `1px solid ${C.line}`, boxShadow: C.shadow,
        fontSize: 36, fontWeight: 500, lineHeight: 1.3, color: C.text, textAlign: 'center'}}>
        {words.map((w, i) => (
          <span key={i} style={{opacity: i < shown ? 1 : 0.2}}>{w}{i < words.length - 1 ? ' ' : ''}</span>
        ))}
      </div>
    </div>
  );
};
