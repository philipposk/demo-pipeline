import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame} from 'remotion';
import {C, INTER} from '../theme';
import {
  CL, Card, Cursor, Headline, IconAudio, IconLink, IconUpload, Pop, SNAP, SceneProps, Sfx, lerp, typed, useSpring, useTiming,
} from '../lib';
import {Logo} from './kit';

// 1. "Meetings. Lectures. Calls. You remember maybe half."
export const Hook: React.FC<SceneProps> = ({sc}) => {
  const f = useCurrentFrame();
  const {at} = useTiming(sc);
  const list = [at('meetings', 0, 6), at('lectures', 0, 30), at('calls', 0, 59)];
  const tYou = at('you', 0, 80);
  const tHalf = at('half', 0, 107);
  const sentence = [tYou, at('remember', 0, 85), at('maybe', 0, 95)];
  const exitA = lerp(f, tYou - 6, tYou + 4, 0, 1);
  const wipeAt = Math.max(tHalf + 4, Math.min(tHalf + 12, sc.length - 24)); // still visible on the fast cut
  const wipe = lerp(f, wipeAt, wipeAt + 16, 100, 50);
  const mask = `linear-gradient(90deg, #000 ${wipe}%, rgba(0,0,0,0.1) ${wipe + 7}%)`;
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
      <div style={{position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: 1 - exitA,
        transform: `translateY(${-exitA * 90}px) scale(${1 - exitA * 0.06})`, filter: exitA > 0.01 ? `blur(${exitA * 10}px)` : undefined}}>
        {['Meetings.', 'Lectures.', 'Calls.'].map((w, i) => (
          <Pop key={w} at={list[i]} dy={70}>
            <Headline size={176}>{w}</Headline>
          </Pop>
        ))}
      </div>
      <div style={{position: 'absolute', display: 'flex', gap: 36, alignItems: 'baseline', WebkitMaskImage: mask, maskImage: mask}}>
        {['You', 'remember', 'maybe'].map((w, i) => (
          <Pop key={w} at={sentence[i]} dy={40}>
            <Headline size={136}>{w}</Headline>
          </Pop>
        ))}
        <Pop at={tHalf} dy={40}>
          <Headline size={136} italic>half.</Headline>
        </Pop>
      </div>
    </AbsoluteFill>
  );
};

// 2. "Meet Catchy. It catches the rest."
export const Reveal: React.FC<SceneProps> = ({sc}) => {
  const f = useCurrentFrame();
  const sp = useSpring();
  const {wi} = useTiming(sc);
  const tMeet = wi(0, 6);
  const tName = wi(1, 18);
  const tIt = wi(2, 44);
  const logoIn = sp(tMeet - 4, {damping: 11, stiffness: 160, mass: 0.8});
  const slide = sp(tName - 3, SNAP);
  const reveal = lerp(f, tName - 2, tName + 12, 0, 1);
  const LOGO = 190;
  const GAP = 40;
  const WORD = 560;
  const left = 960 - (LOGO + GAP + WORD) / 2;
  const logoX = interpolate(slide, [0, 1], [960 - LOGO / 2, left]);
  return (
    <AbsoluteFill>
      <div style={{position: 'absolute', left: logoX, top: 460 - LOGO / 2, opacity: Math.min(1, logoIn * 2),
        transform: `scale(${0.3 + 0.7 * logoIn}) rotate(${(1 - logoIn) * -14}deg)`}}>
        <Logo size={LOGO} live />
      </div>
      <div style={{position: 'absolute', left: left + LOGO + GAP, top: 460 - 110, height: 220, display: 'flex', alignItems: 'center',
        clipPath: `inset(-20px ${(1 - reveal) * 100}% -20px 0)`}}>
        <div style={{fontFamily: INTER, fontWeight: 700, fontSize: 184, letterSpacing: '-0.045em', color: C.text, transform: `translateX(${(1 - reveal) * -70}px)`}}>
          Catchy
        </div>
      </div>
      <div style={{position: 'absolute', top: 680, left: 0, right: 0, display: 'flex', justifyContent: 'center'}}>
        <Pop at={tIt} dy={30}>
          <Headline size={74} italic color={C.text2}>It catches the rest.</Headline>
        </Pop>
      </div>
    </AbsoluteFill>
  );
};

// 3. "Drop in a recording, paste a YouTube link, or just hit live." — one fragment at a time, carousel on the beat.
export const Capture: React.FC<SceneProps> = ({sc}) => {
  const sp = useSpring();
  const {at} = useTiming(sc);
  const t0 = at('drop', 0, 6);
  const t1 = at('paste', 0, 47);
  const t2 = at('hit', 0, 100);
  const a = sp(t1 - 7, SNAP) + sp(t2 - 7, SNAP);
  const slot = (i: number): React.CSSProperties => {
    const d = i - a;
    const ad = Math.abs(d);
    return {
      position: 'absolute',
      transform: `translateX(${d * 1520}px) scale(${1.3 * interpolate(ad, [0, 1], [1, 0.84], CL)})`,
      opacity: interpolate(ad, [0, 0.9, 1.4], [1, 0.3, 0], CL),
      filter: ad > 0.05 ? `blur(${Math.min(ad, 1) * 6}px)` : undefined,
    };
  };
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
      <div style={slot(0)}><UploadFrag t={t0} /></div>
      <div style={slot(1)}><LinkFrag t={t1} /></div>
      <div style={slot(2)}><LiveFrag t={t2} /></div>
      <Sfx at={t1 + 26} src="sfx/click.wav" />
      <Sfx at={t2 + 12} src="sfx/click.wav" />
    </AbsoluteFill>
  );
};

const Segmented: React.FC<{items: string[]; active: number; size?: number}> = ({items, active, size = 24}) => (
  <div style={{display: 'flex', gap: 6, padding: 6, background: C.subtle, borderRadius: 16, width: 'fit-content'}}>
    {items.map((s, i) => (
      <span key={s} style={{padding: '9px 24px', borderRadius: 11, fontSize: size, fontWeight: i === active ? 600 : 500,
        background: i === active ? C.surface : 'transparent', color: i === active ? C.text : C.muted,
        boxShadow: i === active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none'}}>
        {s}
      </span>
    ))}
  </div>
);

const UploadFrag: React.FC<{t: number}> = ({t}) => {
  const f = useCurrentFrame();
  const sp = useSpring();
  const drop = sp(t + 2, {damping: 13, stiffness: 150, mass: 0.8});
  const landed = f >= t + 13;
  const prog = lerp(f, t + 15, t + 36, 0, 1, Easing.inOut(Easing.cubic));
  const done = prog >= 1;
  return (
    <Card style={{width: 960}} pad={38}>
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28}}>
        <div style={{fontSize: 36, fontWeight: 600}}>New meeting</div>
        <Segmented items={['Upload', 'Live']} active={0} />
      </div>
      <div style={{position: 'relative', height: 380, borderRadius: 22, border: `3px ${landed ? 'solid' : 'dashed'} ${landed ? C.blue : C.line2}`,
        background: landed ? C.blueSoft : C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <div style={{opacity: landed ? 0 : 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14}}>
          <div style={{width: 86, height: 86, borderRadius: 999, background: C.surface, border: `1px solid ${C.line}`, display: 'grid', placeItems: 'center', color: C.text2}}>
            <IconUpload size={40} />
          </div>
          <div style={{fontSize: 34, fontWeight: 600}}>Drop audio or video</div>
          <div style={{fontSize: 24, color: C.muted}}>MP3 · M4A · WAV · MP4 · up to 2 h 15 min</div>
        </div>
        <div style={{position: 'absolute', left: '50%', top: '50%', opacity: interpolate(f, [t, t + 4], [0, 1], CL),
          transform: `translate(-50%, -50%) translateY(${(1 - drop) * -430}px) rotate(${(1 - drop) * -8}deg)`}}>
          <div style={{display: 'flex', alignItems: 'center', gap: 20, padding: '24px 30px', width: 600, boxSizing: 'border-box', background: C.surface,
            borderRadius: 20, boxShadow: C.shadow, border: `1px solid ${C.line}`}}>
            <div style={{width: 62, height: 62, borderRadius: 15, background: C.blueSoft, color: C.blue, display: 'grid', placeItems: 'center'}}>
              <IconAudio size={34} />
            </div>
            <div style={{flex: 1}}>
              <div style={{fontSize: 30, fontWeight: 600}}>weekly-sync.m4a</div>
              <div style={{marginTop: 12, height: 8, borderRadius: 8, background: C.subtle, overflow: 'hidden'}}>
                <div style={{width: `${prog * 100}%`, height: '100%', background: done ? C.green : C.blue}} />
              </div>
            </div>
            <div style={{fontSize: 24, fontWeight: 600, color: done ? C.green : C.muted, width: 120, textAlign: 'right', fontVariantNumeric: 'tabular-nums'}}>
              {done ? 'Uploaded' : `${Math.round(prog * 100)}%`}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

const LinkFrag: React.FC<{t: number}> = ({t}) => {
  const f = useCurrentFrame();
  const shown = typed('youtube.com/watch?v=Wq3kX9pLm2A', f, t + 2, 72);
  const click = t + 26;
  const pressed = f >= click && f < click + 5;
  const importing = f >= click + 3;
  return (
    <Card style={{width: 1080}} pad={42}>
      <div style={{display: 'flex', alignItems: 'center', gap: 16, fontSize: 36, fontWeight: 600, marginBottom: 26}}>
        <IconLink size={36} /> Import a YouTube link
      </div>
      <div style={{display: 'flex', gap: 16}}>
        <div style={{flex: 1, height: 100, borderRadius: 18, border: `2px solid ${C.blue}`, boxShadow: `0 0 0 6px ${C.blueSoft}`,
          display: 'flex', alignItems: 'center', padding: '0 28px', fontSize: 32, color: C.text, overflow: 'hidden', whiteSpace: 'nowrap'}}>
          {shown}
          {!importing && <span style={{width: 3, height: 42, marginLeft: 3, background: C.text, opacity: Math.floor(f / 8) % 2 ? 0 : 1}} />}
        </div>
        <div style={{position: 'relative', height: 100, width: 220, borderRadius: 18, background: C.ink, color: C.onInk, fontSize: 30, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${pressed ? 0.94 : 1})`}}>
          {importing ? 'Importing…' : 'Import'}
          <Cursor path={[{f: t + 6, x: 300, y: 190}, {f: click - 2, x: 120, y: 56}]} clicks={[click]} />
        </div>
      </div>
      <div style={{marginTop: 24, fontSize: 26, color: C.muted, opacity: lerp(f, click + 4, click + 12, 0, 1)}}>
        Reads the video straight from the link. Nothing to download.
      </div>
    </Card>
  );
};

const LiveFrag: React.FC<{t: number}> = ({t}) => {
  const f = useCurrentFrame();
  const click = t + 12;
  const on = f >= click + 2;
  const pressed = f >= click && f < click + 5;
  const secs = Math.max(0, Math.floor((f - click) / 30));
  return (
    <Card style={{width: 1000}} pad={42}>
      <div style={{marginBottom: 36}}>
        <Segmented items={['Mic', 'Mic + call', 'Call audio']} active={1} size={26} />
      </div>
      <div style={{display: 'flex', alignItems: 'center', gap: 40}}>
        <div style={{position: 'relative', display: 'flex', alignItems: 'center', gap: 18, height: 116, padding: '0 50px', borderRadius: 999,
          background: on ? C.surface : C.ink, border: `3px solid ${on ? C.red : C.ink}`, color: on ? C.red : C.onInk, fontSize: 42, fontWeight: 600,
          transform: `scale(${pressed ? 0.94 : 1})`, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap'}}>
          <span style={{width: 24, height: 24, borderRadius: '50%', background: C.red, opacity: on ? 0.5 + 0.5 * Math.abs(Math.sin(f * 0.15)) : 1}} />
          {on ? `Live 0:${String(secs).padStart(2, '0')}` : 'Go live'}
          <Cursor path={[{f: t - 4, x: 360, y: 200}, {f: click - 2, x: 160, y: 62}]} clicks={[click]} />
        </div>
        <Wave on={on} />
      </div>
    </Card>
  );
};

const Wave: React.FC<{on: boolean}> = ({on}) => {
  const f = useCurrentFrame();
  return (
    <div style={{display: 'flex', alignItems: 'center', gap: 7, height: 116}}>
      {Array.from({length: 24}, (_, i) => {
        const n = Math.abs(Math.sin(f * 0.21 + i * 0.9) * Math.cos(f * 0.13 + i * 0.37));
        return <span key={i} style={{width: 8, borderRadius: 4, background: on ? C.text : C.line2, height: on ? 14 + n * 92 : 14}} />;
      })}
    </div>
  );
};
