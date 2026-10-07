import React from 'react';
import {Html5Audio, Sequence, interpolate, staticFile} from 'remotion';
import {Timeline} from './types';
import {CL} from './lib';

// Sound for a timeline: the voice lines, a soft whoosh on each scene change, and music ducked under the voice
// (back up in the gaps, faded at both ends; a steady level when there is no voice). Shared by every format.
export const DemoAudio: React.FC<{tl: Timeline; music: string | null; voiceover: boolean; musicLevel?: number}> = ({tl, music, voiceover, musicLevel = 1}) => {
  const {scenes} = tl;
  const musicVolume = (f: number) => {
    let gap = Infinity;
    for (const s of scenes) {
      const a = s.voFrom;
      const b = s.voFrom + Math.ceil(s.dur * tl.fps);
      gap = Math.min(gap, f < a ? a - f : f > b ? f - b : 0);
    }
    const level = voiceover ? interpolate(gap, [0, 8], [0.2, 0.42], CL) : 0.55;
    return musicLevel * level * interpolate(f, [0, 12], [0, 1], CL) * interpolate(f, [tl.total - 50, tl.total], [1, 0], CL);
  };
  return (
    <>
      {voiceover && scenes.map((sc) => (
        <Sequence key={`vo-${sc.id}`} from={sc.voFrom} name={`voice ${sc.id}`} layout="none">
          <Html5Audio src={staticFile(sc.file)} />
        </Sequence>
      ))}
      {scenes.slice(1).map((sc) => (
        <Sequence key={`whoosh-${sc.id}`} from={sc.from - 3} durationInFrames={20} layout="none">
          <Html5Audio src={staticFile('sfx/whoosh.wav')} volume={0.1} />
        </Sequence>
      ))}
      {music && <Html5Audio src={staticFile(music)} loop volume={musicVolume} />}
    </>
  );
};
