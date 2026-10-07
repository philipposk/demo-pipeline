import React from 'react';
import {AbsoluteFill, Sequence, interpolate, useCurrentFrame} from 'remotion';
import {DemoAudio} from '../audio';
import {Caption} from '../caption';
import {Bg, CL, SceneData, Shell} from '../lib';
import {C, INTER, applyTheme} from '../theme';
import {DemoProps, Timeline, timelineOf} from '../types';
import {EdgeFades, Reframe, WordCaptions} from '../vertical';
import {Mark} from './kit';
import {Add, Done, Hook} from './scenes';
import {NO_CAPTIONS, NO_HEADER, VFOCUS} from './vertical';

// Acme Tasks, an invented to-do app, as the example product. Assembly: background, scenes with dissolves, voice, whooshes,
// ducked music (DemoAudio), and either the silent-cut captions (landscape) or the reframed phone cut (format "vertical").
// A new product copies this file and changes SCENES, the theme call and the header.
const SCENES: Record<string, React.FC<{sc: SceneData}>> = {hook: Hook, add: Add, done: Done};

export const AcmeDemo: React.FC<DemoProps> = ({tag, theme, music, voiceover = true, format = 'landscape', captions = true}) => {
  applyTheme(theme); // a product with its own look calls its own apply<Product>Theme(theme) here instead
  const tl = timelineOf(tag);
  if (format === 'vertical') return <Vertical tl={tl} music={music} voiceover={voiceover} captions={captions} />;
  return (
    <AbsoluteFill style={{fontFamily: INTER, color: C.text, WebkitFontSmoothing: 'antialiased'}}>
      <Bg />
      {tl.scenes.map((sc, i) => {
        const Scene = SCENES[sc.id];
        return (
          <Sequence key={sc.id} from={sc.from} durationInFrames={sc.length} name={sc.id}>
            <Shell length={sc.length} xf={tl.xf} last={i === tl.scenes.length - 1}>
              <Scene sc={sc} />
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

// Phone cut (1080x1920): small mark + name header, each scene reframed by the camera keys in vertical.ts, word captions below.
const V = {header: 150, stageY: 840, captions: 1500};

const Header: React.FC<{tl: Timeline}> = ({tl}) => {
  const f = useCurrentFrame();
  let o = 1;
  for (const sc of tl.scenes) {
    if (!NO_HEADER.includes(sc.id)) continue;
    o = Math.min(o, 1 - interpolate(f, [sc.from - 2, sc.from + 10, sc.from + sc.length - tl.xf - 6, sc.from + sc.length], [0, 1, 1, 0], CL));
  }
  return (
    <div style={{position: 'absolute', top: V.header - 50, left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 22, opacity: o}}>
      <Mark size={84} />
      <div style={{fontFamily: INTER, fontWeight: 700, fontSize: 66, letterSpacing: '-0.03em'}}>Acme Tasks</div>
    </div>
  );
};

const Vertical: React.FC<{tl: Timeline; music: string | null; voiceover: boolean; captions: boolean}> = ({tl, music, voiceover, captions}) => (
  <AbsoluteFill style={{fontFamily: INTER, color: C.text, WebkitFontSmoothing: 'antialiased'}}>
    <Bg />
    {tl.scenes.map((sc, i) => {
      const Scene = SCENES[sc.id];
      return (
        <Sequence key={sc.id} from={sc.from} durationInFrames={sc.length} name={sc.id}>
          <Shell length={sc.length} xf={tl.xf} last={i === tl.scenes.length - 1}>
            <Reframe sc={sc} keys={VFOCUS[sc.id]} cy={V.stageY}><Scene sc={sc} /></Reframe>
          </Shell>
        </Sequence>
      );
    })}
    <EdgeFades bg={C.bg} top={300} bottom={560} />
    <Header tl={tl} />
    {captions && tl.scenes.map((sc) => !NO_CAPTIONS.includes(sc.id) && (
      <Sequence key={`cap-${sc.id}`} from={sc.from} durationInFrames={sc.length} name={`captions ${sc.id}`}>
        <WordCaptions sc={sc} font={INTER} color={C.text} accent={C.blue} top={V.captions} />
      </Sequence>
    ))}
    <DemoAudio tl={tl} music={music} voiceover={voiceover} />
  </AbsoluteFill>
);
