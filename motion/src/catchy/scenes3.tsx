import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {C, INTER, MONO} from '../theme';
import {
  CL, Card, Chip, Cursor, Dot, Headline, IconCheck, IconCode, IconCopy, IconMic, IconSpark, Pop, Refrain, SNAP, SPRING, SceneProps, Sfx, Toggle, fmt, lerp, useSpring, useTiming,
} from '../lib';
import {Logo, SPK} from './kit';

// 8. "Every answer. Someone asks mid-call, and the answer pops up, from your own meetings and files."
export const Live: React.FC<SceneProps> = ({sc}) => {
  const sp = useSpring();
  const {at} = useTiming(sc);
  const tEvery = at('every', 0, 6);
  const tAns1 = at('answer', 0, 18);
  const tSome = at('someone', 0, 40);
  const tAsks = at('asks', 0, 49);
  const tPops = at('pops', 0, 97);
  const enter = sp(tSome - 8, SNAP);
  const ans = sp(tPops - 6, SPRING);
  return (
    <AbsoluteFill>
      <Refrain words={['Every', 'answer.']} at={[tEvery, tAns1]} out={tSome - 10} />
      <div style={{position: 'absolute', left: 90, top: 330, opacity: Math.min(1, enter * 1.4), transform: `translateY(${(1 - enter) * 100}px)`}}>
        <Captions t={tSome - 4} tq={tAsks - 2} />
      </div>
      <div style={{position: 'absolute', left: 1150, top: 270, opacity: Math.min(1, ans * 1.5), transform: `translateX(${(1 - ans) * 120}px) scale(${0.9 + 0.1 * ans})`}}>
        <AnswerCard tMeet={at('meetings', 0, 136)} tFiles={at('files', 0, 150)} />
      </div>
    </AbsoluteFill>
  );
};

const LINES = [
  {who: 'Priya', text: 'Expiring links are next on the list.'},
  {who: 'Sam', text: 'Can we change pricing this sprint?', q: true},
];

export const Captions: React.FC<{t: number; tq: number}> = ({t, tq}) => {
  const f = useCurrentFrame();
  const starts = [t, tq];
  const qDone = tq + LINES[1].text.split(' ').length * 2 + 2;
  const hl = lerp(f, qDone, qDone + 8, 0, 1);
  return (
    <Card style={{width: 1030}} pad="30px 34px">
      <div style={{display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16}}>
        <span style={{width: 16, height: 16, borderRadius: '50%', background: C.red, opacity: 0.5 + 0.5 * Math.abs(Math.sin(f * 0.14))}} />
        <span style={{fontSize: 24, fontWeight: 700, color: C.red, letterSpacing: '0.08em'}}>LIVE</span>
        <span style={{fontFamily: MONO, fontSize: 24, color: C.muted, fontVariantNumeric: 'tabular-nums'}}>{fmt(761 + f / 30)}</span>
        <span style={{marginLeft: 'auto'}}><Chip>Mic + call</Chip></span>
      </div>
      {LINES.map((l, i) => {
        const words = l.text.split(' ');
        const n = Math.max(0, Math.min(words.length, Math.floor((f - starts[i]) / 2) + 1));
        return (
          <div key={i} style={{display: 'flex', gap: 22, padding: '16px 18px', borderRadius: 16, marginTop: 4, visibility: f < starts[i] ? 'hidden' : 'visible',
            background: l.q ? `rgba(255,176,32,${0.18 * hl})` : 'transparent'}}>
            <div style={{width: 150, flexShrink: 0, paddingTop: 6}}>
              <div style={{fontSize: 28, fontWeight: 600, color: SPK[l.who]}}>{l.who}</div>
              {l.q && (
                <div style={{marginTop: 10, opacity: hl, transform: `scale(${0.8 + 0.2 * hl})`, transformOrigin: 'left center'}}>
                  <Chip style={{background: C.amberSoft, color: C.amber, fontSize: 20, padding: '5px 14px'}}>Question</Chip>
                </div>
              )}
            </div>
            <span style={{fontSize: 36, lineHeight: 1.45}}>{words.slice(0, n).join(' ')}</span>
          </div>
        );
      })}
    </Card>
  );
};

export const AnswerCard: React.FC<{tMeet: number; tFiles: number}> = ({tMeet, tFiles}) => (
  <Card style={{width: 690}} pad="32px 36px">
    <div style={{display: 'flex', alignItems: 'center', gap: 12, color: C.blue, fontSize: 26, fontWeight: 600, marginBottom: 16}}>
      <IconSpark size={28} /> Answer
    </div>
    <div style={{fontSize: 38, lineHeight: 1.38, fontWeight: 500}}>Not this sprint. Billing is frozen until the audit is finished.</div>
    <div style={{display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 26}}>
      <Pop at={tMeet} dy={14} scaleFrom={0.7}>
        <Chip><span style={{color: C.blue}}><IconMic size={22} /></span> Weekly sync · 26 Sep</Chip>
      </Pop>
      <Pop at={tFiles} dy={14} scaleFrom={0.7}>
        <Chip><span style={{color: C.red, fontWeight: 700, fontSize: 18}}>PDF</span> Pricing audit.pdf</Chip>
      </Pop>
    </div>
  </Card>
);

// 9. "Plug in Claude, Cursor or Codex. They follow along and answer from your code."
const AGENTS = ['Claude Code', 'Cursor', 'Codex'];
const Y = [330, 540, 750];
const bez = (t: number, p0: number, p1: number, p2: number, p3: number) =>
  (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3;

export const Agents: React.FC<SceneProps> = ({sc}) => {
  const f = useCurrentFrame();
  const sp = useSpring();
  const {at} = useTiming(sc);
  const tC = [at('claude', 0, 25), at('cursor', 0, 47), at('codex', 0, 68)];
  const tThey = at('they', 0, 90);
  const tAns = at('answer', 0, 124);
  const tCode = at('code', 0, 145, true);
  const panel = sp(at('plug', 0, 6), SNAP);
  const connected = tC.filter((t) => f >= t + 14).length;
  return (
    <AbsoluteFill>
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0}}>
        {Y.map((y, i) => {
          const draw = lerp(f, tC[i] + 4, tC[i] + 16, 0, 1);
          const k = ((f - tThey) / 36 + i * 0.33) % 1;
          return (
            <g key={i}>
              <path d={`M 640 ${y} C 800 ${y}, 800 540, 960 540`} fill="none" stroke={C.line2} strokeWidth={3} pathLength={1} strokeDasharray="1" strokeDashoffset={1 - draw} />
              {f >= tThey && <circle cx={bez(k, 640, 800, 800, 960)} cy={bez(k, y, y, 540, 540)} r={7} fill={C.blue} />}
            </g>
          );
        })}
      </svg>
      {AGENTS.map((name, i) => (
        <div key={name} style={{position: 'absolute', left: 230, top: Y[i] - 50}}>
          <Pop at={tC[i]} dx={-40} dy={0} scaleFrom={0.8}>
            <div style={{display: 'flex', alignItems: 'center', gap: 18, width: 410, height: 100, padding: '0 26px', boxSizing: 'border-box', background: C.surface,
              border: `1px solid ${C.line}`, borderRadius: 22, boxShadow: C.shadow}}>
              <span style={{width: 56, height: 56, borderRadius: 14, background: C.ink, color: C.onInk, display: 'grid', placeItems: 'center'}}><IconCode size={30} /></span>
              <span style={{fontSize: 34, fontWeight: 600}}>{name}</span>
              <span style={{marginLeft: 'auto', opacity: f >= tC[i] + 14 ? 1 : 0}}><Dot color={C.green} /></span>
            </div>
          </Pop>
        </div>
      ))}
      <div style={{position: 'absolute', left: 960, top: 220, opacity: Math.min(1, panel * 1.4), transform: `translateX(${(1 - panel) * 80}px)`}}>
        <Card style={{width: 820, height: 640}} pad="30px 34px">
          <div style={{display: 'flex', alignItems: 'center', gap: 14, paddingBottom: 22, borderBottom: `1px solid ${C.line}`}}>
            <Logo size={44} />
            <span style={{fontSize: 30, fontWeight: 600}}>Meeting assistant</span>
            <span style={{marginLeft: 'auto'}}>
              <Chip><Dot color={connected ? C.green : C.line2} size={12} /> {connected} connected</Chip>
            </span>
          </div>
          <div style={{display: 'flex', justifyContent: 'flex-end', marginTop: 28}}>
            <Pop at={tThey} dy={20} scaleFrom={0.85}>
              <div style={{maxWidth: 560, padding: '18px 24px', borderRadius: '22px 22px 6px 22px', background: C.subtle, fontSize: 30, lineHeight: 1.35}}>
                <div style={{fontSize: 20, color: C.muted, marginBottom: 6}}>Asked in the meeting</div>
                Why do long exports time out?
              </div>
            </Pop>
          </div>
          <div style={{marginTop: 26}}>
            <Pop at={tAns - 4} dy={24} scaleFrom={0.9}>
              <div style={{padding: '22px 26px', borderRadius: 20, border: `1px solid ${C.line}`, background: C.surface, boxShadow: '0 6px 20px rgba(16,24,40,0.06)'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: 10, fontSize: 24, fontWeight: 600, marginBottom: 10}}>
                  <span style={{width: 34, height: 34, borderRadius: 9, background: C.ink, color: C.onInk, display: 'grid', placeItems: 'center'}}><IconCode size={20} /></span>
                  Claude Code
                </div>
                <div style={{fontSize: 31, lineHeight: 1.4}}>The export worker gives up after 30 s. Raising it to 120 s covers two-hour recordings.</div>
                <div style={{marginTop: 16}}>
                  <Pop at={tCode} dy={10} scaleFrom={0.7}>
                    <Chip style={{fontFamily: MONO, fontSize: 22}}>export/worker.ts:42</Chip>
                  </Pop>
                </div>
              </div>
            </Pop>
          </div>
        </Card>
      </div>
    </AbsoluteFill>
  );
};

// 10. "Share just the notes, or export to PDF, Word or Markdown."
export const Share: React.FC<SceneProps> = ({sc}) => {
  const sp = useSpring();
  const {at} = useTiming(sc);
  const t0 = at('share', 0, 6);
  const tN = at('notes', 0, 32);
  const tE = at('export', 0, 52);
  const tF = [at('pdf', 0, 68), at('word', 0, 90), at('markdown', 0, 107)];
  const click = tN + 12;
  const move = sp(tE - 6, SNAP);
  const files: [string, string, string][] = [['PDF', 'PDF', C.red], ['DOC', 'Word', C.blue], ['MD', 'Markdown', C.text]];
  return (
    <AbsoluteFill style={{transform: 'scale(1.15)'}}>
      <div style={{position: 'absolute', left: interpolate(move, [0, 1], [560, 230]), top: 250}}>
        <Pop at={t0 - 2} dy={60}>
          <ShareCard tN={tN} click={click} />
        </Pop>
      </div>
      <div style={{position: 'absolute', left: 1110, top: 320, display: 'flex', gap: 28}}>
        {files.map(([ext, label, color], i) => (
          <Pop key={ext} at={tF[i] - 2} dy={80} scaleFrom={0.7}>
            <div style={{transform: `rotate(${(i - 1) * 4}deg)`}}>
              <div style={{width: 190, height: 240, borderRadius: 24, background: C.surface, border: `1px solid ${C.line}`, boxShadow: C.shadow, display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 60, fontWeight: 800, letterSpacing: '-0.02em', color}}>
                {ext}
              </div>
              <div style={{textAlign: 'center', marginTop: 18, fontSize: 28, fontWeight: 500, color: C.text2}}>{label}</div>
            </div>
          </Pop>
        ))}
      </div>
      <Sfx at={click} src="sfx/click.wav" />
    </AbsoluteFill>
  );
};

const ShareCard: React.FC<{tN: number; click: number}> = ({tN, click}) => {
  const f = useCurrentFrame();
  const sp = useSpring();
  const rows = [
    {label: 'Transcript', on: 0},
    {label: 'Notes & decisions', on: sp(tN, SNAP)},
    {label: 'Action items', on: sp(tN + 5, SNAP)},
    {label: 'Audio', on: 0},
  ];
  const pressed = f >= click && f < click + 5;
  const toast = sp(click + 3, SPRING);
  return (
    <Card style={{width: 800}} pad="34px 40px">
      <div style={{fontSize: 34, fontWeight: 600}}>Share “Weekly sync”</div>
      <div style={{fontSize: 24, color: C.muted, margin: '6px 0 16px'}}>Choose what the link shows</div>
      {rows.map((r) => (
        <div key={r.label} style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 0', borderTop: `1px solid ${C.line}`, fontSize: 30}}>
          <span>{r.label}</span>
          <Toggle on={r.on} />
        </div>
      ))}
      <div style={{display: 'flex', gap: 14, marginTop: 20}}>
        <div style={{flex: 1, height: 78, borderRadius: 16, border: `1px solid ${C.line2}`, display: 'flex', alignItems: 'center', padding: '0 22px',
          fontFamily: MONO, fontSize: 24, color: C.muted}}>
          …/s/k3J9xQ
        </div>
        <div style={{position: 'relative', height: 78, padding: '0 30px', borderRadius: 16, background: C.ink, color: C.onInk, fontSize: 28, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 12, transform: `scale(${pressed ? 0.94 : 1})`}}>
          <IconCopy size={26} /> Copy link
          <Cursor path={[{f: tN - 8, x: 230, y: 160}, {f: click - 2, x: 120, y: 42}]} clicks={[click]} />
        </div>
      </div>
      <div style={{position: 'absolute', left: '50%', top: -40, opacity: Math.min(1, toast * 1.5), transform: `translate(-50%, ${(1 - toast) * 30}px)`}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 12, padding: '14px 26px', borderRadius: 999, background: C.ink, color: C.onInk, fontSize: 26,
          fontWeight: 600, boxShadow: C.shadow, whiteSpace: 'nowrap'}}>
          <span style={{color: C.toastIcon}}><IconCheck size={24} sw={3} /></span> Link copied
        </div>
      </div>
    </Card>
  );
};

// 11. "Catchy. Catch everything. Start free."
export const End: React.FC<SceneProps> = ({sc}) => {
  const sp = useSpring();
  const {at} = useTiming(sc);
  const t0 = at('catchy', 0, 8);
  const t1 = at('catch', 1, 32);
  const t2 = at('start', 0, 68);
  const lg = sp(t0 - 6, {damping: 12, stiffness: 150, mass: 0.8});
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
      <div style={{position: 'absolute', top: 290, display: 'flex', alignItems: 'center', gap: 38, opacity: Math.min(1, lg * 1.5),
        transform: `scale(${0.85 + 0.15 * lg})`}}>
        <Logo size={156} live />
        <div style={{fontFamily: INTER, fontWeight: 700, fontSize: 156, letterSpacing: '-0.045em', lineHeight: 1}}>Catchy</div>
      </div>
      <div style={{position: 'absolute', top: 530}}>
        <Pop at={t1} dy={30}>
          <Headline size={80} italic color={C.text2}>Catch everything.</Headline>
        </Pop>
      </div>
      <div style={{position: 'absolute', top: 700, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22}}>
        <Pop at={t2} dy={30} scaleFrom={0.8}>
          <div style={{padding: '24px 60px', borderRadius: 999, background: C.ink, color: C.onInk, fontSize: 40, fontWeight: 600}}>Start free</div>
        </Pop>
        <Pop at={t2 + 6} dy={20}>
          <div style={{fontSize: 28, color: C.muted}}>120 minutes a month · no card</div>
        </Pop>
      </div>
    </AbsoluteFill>
  );
};
