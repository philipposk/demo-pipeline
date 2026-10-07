import React from 'react';
import {AbsoluteFill, Sequence} from 'remotion';
import {DemoAudio} from '../audio';
import {Caption} from '../caption';
import {Bg, Drift, SceneData, Shell} from '../lib';
import {C, INTER} from '../theme';
import {DemoProps, timelineOf} from '../types';
import {applyCatchyTheme} from './kit';
import {Capture, Hook, Reveal} from './scenes1';
import {Memory, Notes, Templates, Transcript} from './scenes2';
import {Agents, End, Live, Share} from './scenes3';

// Catchy, a meeting-notes app: its landing video (landscape only). The fuller reference next to the small Acme example.
// Assembly: background, scenes with dissolves, voice, whooshes, ducked music (DemoAudio), silent-cut captions.
const SCENES: Record<string, React.FC<{sc: SceneData}>> = {
  hook: Hook, reveal: Reveal, capture: Capture, transcript: Transcript, notes: Notes, templates: Templates,
  memory: Memory, live: Live, agents: Agents, share: Share, end: End,
};

// Every scene gets a slow push-in plus a small float, so the held moments between animations never sit frozen (README: "No dead air").
const DRIFT_ZOOM = 0.06;
const DRIFT_FLOAT = 22;

export const CatchyDemo: React.FC<DemoProps> = ({tag, theme, music, voiceover = true}) => {
  applyCatchyTheme(theme);
  const tl = timelineOf(tag);
  return (
    <AbsoluteFill style={{fontFamily: INTER, color: C.text, WebkitFontSmoothing: 'antialiased'}}>
      <Bg />
      {tl.scenes.map((sc, i) => {
        const Scene = SCENES[sc.id];
        return (
          <Sequence key={sc.id} from={sc.from} durationInFrames={sc.length} name={sc.id}>
            <Shell length={sc.length} xf={tl.xf} last={i === tl.scenes.length - 1}>
              <Drift length={sc.length} zoom={DRIFT_ZOOM} float={DRIFT_FLOAT}><Scene sc={sc} /></Drift>
              {!voiceover && sc.caption && (
                <Caption text={sc.caption} start={sc.voFrom - sc.from} span={Math.ceil(sc.dur * tl.fps)} length={sc.length} xf={tl.xf} />
              )}
            </Shell>
          </Sequence>
        );
      })}
      <DemoAudio tl={tl} music={music} voiceover={voiceover} />
    </AbsoluteFill>
  );
};
