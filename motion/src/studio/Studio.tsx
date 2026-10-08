import React from 'react';
import {AbsoluteFill, CalculateMetadataFunction, Easing, Freeze, Html5Audio, Img, OffthreadVideo, Sequence, interpolate, spring, staticFile,
  useCurrentFrame, useVideoConfig} from 'remotion';
import {CL} from '../lib';
import {INTER} from '../theme';

// Studio mode (pipeline.mjs --mode=studio): a real screen capture, composed like a motion video. lib/studio.mjs in the
// pipeline decides all timing (which capture frame plays when, camera keys, cursor clicks, caption words) and passes it
// here as props; this file only draws: gradient stage, browser window, camera zoom/pan, drawn cursor + click ripples,
// word-lit captions, intro/outro cards, voice, click sounds, whooshes and optional ducked music.

type Box = {x: number; y: number; width: number; height: number};
type Key = {f: number; x: number; y: number; z: number};
export type StudioProps = {
  fps: number; total: number; width: number; height: number; xf: number;
  intro: {from: number; len: number}; body: {from: number; len: number}; outro: {from: number; len: number};
  capture: {src: string; css: {width: number; height: number}; fps: number; duration: number};
  segments: {id: string; from: number; len: number; capStart: number; capEnd: number; shift: number}[];
  camera: Key[];
  clicks: {f: number; x: number; y: number}[];
  captions: {from: number; end: number; words: {w: string; f: number}[]}[];
  voices: {src: string; from: number; len: number}[];
  sfx: {src: string; from: number; volume: number}[];
  music: {src: string; gain: number} | null;
  title: string; subtitle: string; outroTitle: string; outroSubtitle: string;
  colors: string[]; accent: string; address: string; logo: string | null; watermark: boolean;
};

export const studioDefaults: StudioProps = {
  fps: 30, total: 90, width: 1920, height: 1080, xf: 15,
  intro: {from: 0, len: 45}, body: {from: 30, len: 30}, outro: {from: 45, len: 45},
  capture: {src: '', css: {width: 1600, height: 900}, fps: 30, duration: 1},
  segments: [], camera: [], clicks: [], captions: [], voices: [], sfx: [], music: null,
  title: 'Studio mode', subtitle: 'Render with: node pipeline.mjs <project> --mode=studio', outroTitle: 'Studio mode', outroSubtitle: '',
  colors: ['#1f7a5a', '#14233f'], accent: '#34d399', address: 'example.com', logo: null, watermark: false,
};

export const studioMetadata: CalculateMetadataFunction<StudioProps> = ({props}) => ({
  durationInFrames: props.total, fps: props.fps, width: props.width, height: props.height,
});

const CAM = {damping: 24, stiffness: 120, mass: 1};
const POP = {damping: 14, stiffness: 160, mass: 0.7};
const BAR = 44; // browser top bar height (canvas px)

// Window geometry on the canvas: the capture's aspect, as large as the padding allows, plus the top bar.
const layout = (W: number, H: number, css: {width: number; height: number}) => {
  const pad = 0.055;
  const maxW = W * (1 - 2 * pad);
  const maxH = H * (1 - 2 * pad) - BAR;
  let cw = maxW;
  let ch = (cw * css.height) / css.width;
  if (ch > maxH) {
    ch = maxH;
    cw = (ch * css.width) / css.height;
  }
  const x = (W - cw) / 2;
  const y = (H - ch - BAR) / 2;
  return {x, y, w: cw, h: ch + BAR, cw, ch, k: cw / css.width};
};

// Camera: springs from key to key (in canvas space), then keeps the view inside the window once zoomed in.
const useCamera = (keys: Key[], W: number, H: number, win: ReturnType<typeof layout>) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const toCanvas = (k: Key) => (k.z <= 1.0001 ? {x: W / 2, y: H / 2, z: 1} : {x: win.x + k.x * win.k, y: win.y + BAR + k.y * win.k, z: k.z});
  let cur = keys.length ? toCanvas(keys[0]) : {x: W / 2, y: H / 2, z: 1};
  for (const k of keys.slice(1)) {
    const p = spring({frame: f - k.f, fps, config: CAM});
    const t = toCanvas(k);
    cur = {x: cur.x + (t.x - cur.x) * p, y: cur.y + (t.y - cur.y) * p, z: cur.z + (t.z - cur.z) * p};
  }
  const fit = (c: number, half: number, lo: number, hi: number) => (2 * half >= hi - lo ? (lo + hi) / 2 : Math.min(hi - half, Math.max(lo + half, c)));
  const s = Math.max(1, cur.z);
  return {
    s,
    cx: fit(cur.x, W / (2 * s), win.x, win.x + win.w),
    cy: fit(cur.y, H / (2 * s), win.y, win.y + win.h),
  };
};

// Which capture frame to show: each scene plays its own stretch, shifted so clicks land on their word, held at the ends.
const sourceFrame = (p: StudioProps, f: number) => {
  const segs = p.segments;
  if (!segs.length) return 0;
  let s = segs[0];
  for (const x of segs) if (f >= x.from) s = x;
  const t = Math.min(s.capEnd, Math.max(s.capStart, s.capStart + (f - s.from) / p.fps - s.shift));
  return Math.min(Math.round(t * p.capture.fps), Math.floor(p.capture.duration * p.capture.fps) - 1);
};

const Background: React.FC<{colors: string[]}> = ({colors}) => {
  const f = useCurrentFrame();
  const t = f / 30;
  const glow = (x: number, y: number, r: number, a: number) => (
    <div style={{position: 'absolute', left: x - r, top: y - r, width: 2 * r, height: 2 * r, borderRadius: '50%',
      background: `radial-gradient(circle, rgba(255,255,255,${a}) 0%, transparent 65%)`}} />
  );
  return (
    <AbsoluteFill style={{background: `linear-gradient(135deg, ${colors[0]} 0%, ${colors[1] ?? colors[0]} 100%)`, overflow: 'hidden'}}>
      {glow(300 + Math.sin(t * 0.3) * 80, 160 + Math.cos(t * 0.25) * 40, 620, 0.10)}
      {glow(1640 + Math.cos(t * 0.27) * 90, 960 + Math.sin(t * 0.2) * 50, 700, 0.07)}
    </AbsoluteFill>
  );
};

const Cursor: React.FC<{clicks: StudioProps['clicks']; css: {width: number; height: number}; accent: string; scale: number}> = ({clicks, css, accent, scale}) => {
  const f = useCurrentFrame();
  if (!clicks.length) return null;
  const rest = {x: css.width * 0.62, y: css.height * 0.74};
  const glide = (i: number) => Math.min(16, Math.max(6, clicks[i].f - (i ? clicks[i - 1].f : -999) - 4));
  const first = clicks[0].f - glide(0);
  if (f < first - 10) return null;
  let x = rest.x;
  let y = rest.y;
  for (let i = 0; i < clicks.length; i++) {
    const a = i ? clicks[i - 1] : {f: first, ...rest};
    const b = clicks[i];
    const g0 = b.f - glide(i);
    if (f >= g0) {
      const k = interpolate(f, [g0, b.f], [0, 1], {...CL, easing: Easing.bezier(0.5, 0, 0.15, 1)});
      x = a.x + (b.x - a.x) * k;
      y = a.y + (b.y - a.y) * k;
    }
  }
  const last = clicks.filter((c) => f >= c.f).at(-1);
  const since = last ? f - last.f : 999;
  const dip = interpolate(since, [0, 3, 9], [1, 0.82, 1], CL);
  const size = 30 * scale;
  const rr = interpolate(since, [0, 18], [6, 46], {...CL, easing: Easing.out(Easing.cubic)}) * scale;
  return (
    <div style={{position: 'absolute', left: x, top: y, opacity: interpolate(f, [first - 10, first], [0, 1], CL)}}>
      {since < 18 && (
        <div style={{position: 'absolute', left: -rr, top: -rr, width: rr * 2, height: rr * 2, borderRadius: '50%',
          border: `${3 * scale}px solid ${accent}`, background: `${accent}22`, opacity: interpolate(since, [0, 18], [0.9, 0], CL)}} />
      )}
      <svg width={size} height={size} viewBox="0 0 24 24" style={{position: 'absolute', left: -size * 0.125, top: -size * 0.083,
        transform: `scale(${dip})`, transformOrigin: '12.5% 8.3%', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.35))'}}>
        <path d="M3 2 L3 19.5 L7.6 15.2 L10.6 21.6 L13.6 20.3 L10.6 14 L17 14 Z" fill="#111" stroke="#fff" strokeWidth={1.5} strokeLinejoin="round" />
      </svg>
    </div>
  );
};

const Window: React.FC<{p: StudioProps; win: ReturnType<typeof layout>}> = ({p, win}) => {
  const f = useCurrentFrame(); // body-local
  const src = sourceFrame(p, f + p.body.from);
  return (
    <div style={{position: 'absolute', left: win.x, top: win.y, width: win.w, height: win.h, borderRadius: 16, overflow: 'hidden', background: '#fff',
      boxShadow: '0 2px 6px rgba(0,0,0,0.12), 0 30px 90px rgba(0,0,0,0.45)'}}>
      <div style={{height: BAR, display: 'flex', alignItems: 'center', gap: 9, padding: '0 18px', background: '#f3f3f4', borderBottom: '1px solid #e2e2e4',
        position: 'relative'}}>
        {['#ff5f57', '#febc2e', '#28c840'].map((c) => <span key={c} style={{width: 13, height: 13, borderRadius: '50%', background: c}} />)}
        {p.address && (
          <div style={{position: 'absolute', left: '50%', top: 8, transform: 'translateX(-50%)', height: BAR - 16, padding: '0 22px', borderRadius: 8,
            background: '#e6e6e9', color: '#55565b', fontSize: 16, fontWeight: 500, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap'}}>
            {p.address}
          </div>
        )}
      </div>
      <div style={{position: 'relative', width: win.cw, height: win.ch, overflow: 'hidden'}}>
        {p.capture.src && (
          <div style={{position: 'absolute', left: 0, top: 0, width: p.capture.css.width, height: p.capture.css.height, transformOrigin: '0 0',
            transform: `scale(${win.k})`}}>
            <Freeze frame={src}>
              <OffthreadVideo src={staticFile(p.capture.src)} muted style={{width: p.capture.css.width, height: p.capture.css.height, display: 'block'}} />
            </Freeze>
            <Cursor clicks={p.clicks.map((c) => ({...c, f: c.f - p.body.from}))} css={p.capture.css} accent={p.accent} scale={1 / win.k} />
          </div>
        )}
      </div>
    </div>
  );
};

// The body: window on the stage, camera applied to the whole stage, dissolving in from the intro and out to the outro.
const Body: React.FC<{p: StudioProps}> = ({p}) => {
  const f = useCurrentFrame(); // body-local
  const {width: W, height: H} = useVideoConfig();
  const win = layout(W, H, p.capture.css);
  const cam = useCamera(p.camera.map((k) => ({...k, f: k.f - p.body.from})), W, H, win);
  const inP = interpolate(f, [0, p.xf], [0, 1], {...CL, easing: Easing.bezier(0.22, 1, 0.36, 1)});
  const outP = interpolate(f, [p.body.len - p.xf, p.body.len], [0, 1], {...CL, easing: Easing.in(Easing.cubic)});
  const drift = interpolate(f, [0, p.body.len], [1, 1.035], CL); // slow push-in so idle stretches never look frozen
  const enter = (0.94 + 0.06 * inP) * (1 + 0.04 * outP) * drift;
  const blur = (1 - inP) * 12 + outP * 12;
  return (
    <AbsoluteFill style={{opacity: Math.min(inP, 1 - outP), filter: blur > 0.1 ? `blur(${blur}px)` : undefined}}>
      <AbsoluteFill style={{transform: `scale(${enter})`}}>
        <div style={{position: 'absolute', left: 0, top: 0, width: W, height: H, transformOrigin: '0 0',
          transform: `translate(${W / 2 - cam.cx * cam.s}px, ${H / 2 - cam.cy * cam.s}px) scale(${cam.s})`}}>
          <Window p={p} win={win} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Pop: React.FC<{at: number; children: React.ReactNode; dy?: number}> = ({at, children, dy = 34}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: f - at, fps, config: POP});
  const o = interpolate(f - at, [0, 6], [0, 1], CL);
  const b = (1 - Math.min(1, s)) * 10;
  return <div style={{opacity: o, transform: `translateY(${(1 - s) * dy}px) scale(${0.92 + 0.08 * s})`, filter: b > 0.2 ? `blur(${b}px)` : undefined}}>{children}</div>;
};

// Intro / outro card: logo, title, subtitle; blurs away at the end (intro) or holds (outro).
const Card: React.FC<{title: string; subtitle: string; logo: string | null; len: number; xf: number; out: boolean; pill?: boolean}> = ({title, subtitle, logo, len, xf, out, pill}) => {
  const f = useCurrentFrame();
  const inP = interpolate(f, [0, 8], [0, 1], CL);
  const outP = out ? interpolate(f, [len - xf, len], [0, 1], {...CL, easing: Easing.in(Easing.cubic)}) : 0;
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', opacity: inP * (1 - outP), filter: outP > 0.01 ? `blur(${outP * 14}px)` : undefined,
      transform: `scale(${1 + 0.05 * outP})`, color: '#fff', textAlign: 'center'}}>
      {logo && <Pop at={2}><Img src={staticFile(logo)} style={{height: 92, marginBottom: 34, display: 'block', marginLeft: 'auto', marginRight: 'auto'}} /></Pop>}
      <Pop at={logo ? 7 : 3}>
        <div style={{fontSize: 118, fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.02, textShadow: '0 6px 30px rgba(0,0,0,0.25)'}}>{title}</div>
      </Pop>
      {subtitle && (
        <Pop at={logo ? 13 : 9}>
          {pill ? (
            <div style={{marginTop: 34, display: 'inline-block', padding: '14px 34px', borderRadius: 999, background: 'rgba(255,255,255,0.14)',
              border: '1px solid rgba(255,255,255,0.28)', fontSize: 38, fontWeight: 500}}>{subtitle}</div>
          ) : (
            <div style={{marginTop: 22, fontSize: 46, fontWeight: 500, opacity: 0.82, letterSpacing: '-0.01em'}}>{subtitle}</div>
          )}
        </Pop>
      )}
    </AbsoluteFill>
  );
};

// Captions: one short phrase at a time in a dark pill; each word lights up as it is spoken.
const Captions: React.FC<{caps: StudioProps['captions']}> = ({caps}) => {
  const f = useCurrentFrame();
  const c = caps.find((x) => f >= x.from && f < x.end);
  if (!c) return null;
  const o = interpolate(f, [c.from, c.from + 4, c.end - 4, c.end], [0, 1, 1, 0], CL);
  const pop = interpolate(f, [c.from, c.from + 6], [0, 1], {...CL, easing: Easing.out(Easing.cubic)});
  return (
    <div style={{position: 'absolute', left: 0, right: 0, bottom: 54, display: 'flex', justifyContent: 'center', opacity: o,
      transform: `translateY(${(1 - pop) * 10}px)`}}>
      <div style={{padding: '14px 30px', borderRadius: 20, background: 'rgba(12,14,20,0.80)', boxShadow: '0 10px 40px rgba(0,0,0,0.35)',
        fontSize: 40, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.25, color: '#fff', whiteSpace: 'nowrap'}}>
        {c.words.map((w, i) => (
          <span key={i} style={{opacity: f >= w.f - 1 ? 1 : 0.42}}>{w.w}{i < c.words.length - 1 ? ' ' : ''}</span>
        ))}
      </div>
    </div>
  );
};

const Audio: React.FC<{p: StudioProps}> = ({p}) => {
  const musicVolume = (f: number) => {
    let gap = Infinity;
    for (const v of p.voices) gap = Math.min(gap, f < v.from ? v.from - f : f > v.from + v.len ? f - v.from - v.len : 0);
    const level = interpolate(gap, [0, 8], [0.18, 0.4], CL);
    return (p.music?.gain ?? 1) * level * interpolate(f, [0, 12], [0, 1], CL) * interpolate(f, [p.total - 45, p.total], [1, 0], CL);
  };
  return (
    <>
      {p.voices.map((v, i) => (
        <Sequence key={`v${i}`} from={v.from} name={`voice ${i}`} layout="none">
          <Html5Audio src={staticFile(v.src)} />
        </Sequence>
      ))}
      {p.sfx.map((s, i) => (
        <Sequence key={`s${i}`} from={s.from} durationInFrames={30} layout="none">
          <Html5Audio src={staticFile(s.src)} volume={s.volume} />
        </Sequence>
      ))}
      {p.music && <Html5Audio src={staticFile(p.music.src)} loop volume={musicVolume} />}
    </>
  );
};

export const Studio: React.FC<StudioProps> = (p) => (
  <AbsoluteFill style={{fontFamily: INTER, WebkitFontSmoothing: 'antialiased'}}>
    <Background colors={p.colors} />
    <Sequence from={p.intro.from} durationInFrames={p.intro.len} name="intro">
      <Card title={p.title} subtitle={p.subtitle} logo={p.logo} len={p.intro.len} xf={p.xf} out />
    </Sequence>
    <Sequence from={p.body.from} durationInFrames={p.body.len} name="body">
      <Body p={p} />
    </Sequence>
    <Captions caps={p.captions} />
    {p.watermark && p.logo && (
      <Sequence from={p.body.from + p.xf} durationInFrames={Math.max(1, p.body.len - 2 * p.xf)} name="watermark" layout="none">
        <Img src={staticFile(p.logo)} style={{position: 'absolute', right: 30, bottom: 24, height: 34, opacity: 0.85}} />
      </Sequence>
    )}
    <Sequence from={p.outro.from} durationInFrames={p.outro.len} name="outro">
      <Card title={p.outroTitle} subtitle={p.outroSubtitle} logo={p.logo} len={p.outro.len} xf={p.xf} out={false} pill />
    </Sequence>
    <Audio p={p} />
  </AbsoluteFill>
);
