import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {C, MONO} from '../theme';
import {
  BOUNCE, Card, Chip, Cursor, Dot, Eq, Headline, IconCheck, IconChevron, IconDoc, IconFolder, IconMic, IconSpark, Pop, Refrain, SNAP, SceneProps, Sfx, fmt, lerp, typed, useSpring, useTiming,
} from '../lib';
import {SPK} from './kit';

// 4. "Every word, every speaker. Tap any word to hear that exact moment."
export const Transcript: React.FC<SceneProps> = ({sc}) => {
  const sp = useSpring();
  const {at} = useTiming(sc);
  const tEvery = at('every', 0, 6);
  const tWord = at('word', 0, 28);
  const tSpk = at('every', 1, 54);
  const tTap = at('tap', 0, 92);
  const click = tTap + 8;
  const enter = sp(tSpk - 6, SNAP);
  const zoom = sp(click + 4, {damping: 26, stiffness: 120, mass: 1});
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
      <Refrain words={['Every', 'word.']} at={[tEvery, tWord]} out={tSpk - 8} />
      <div style={{position: 'absolute', opacity: Math.min(1, enter * 1.4), transformOrigin: '50% 50%',
        transform: `translateY(${(1 - enter) * 120 - zoom * 30}px) scale(${(0.94 + 0.06 * enter) * (1 + 0.2 * zoom)})`}}>
        <TranscriptCard t={tSpk} click={click} />
      </div>
      <Player at={click + 4} />
      <Sfx at={click} src="sfx/click.wav" />
    </AbsoluteFill>
  );
};

const TURNS = [
  {who: 'Maya', ts: '0:00', text: "Okay, let's start with the export bug. Jonas, is it only happening on long recordings?"},
  {who: 'Jonas', ts: '0:06', text: 'Yes, anything over an hour. I think the timeout is too low. I’ll raise it and add a retry by', hit: 'Thursday'},
  {who: 'Maya', ts: '0:14', text: "Great. Then we ship the fix on Friday. That's decided."},
];

const TranscriptCard: React.FC<{t: number; click: number}> = ({t, click}) => {
  const f = useCurrentFrame();
  const playing = f >= click + 2;
  return (
    <Card style={{width: 1580}} pad="32px 30px">
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 22px', borderBottom: `1px solid ${C.line}`, marginBottom: 12}}>
        <div style={{display: 'flex', alignItems: 'baseline', gap: 16}}>
          <span style={{fontSize: 32, fontWeight: 600}}>Weekly sync</span>
          <span style={{fontSize: 24, color: C.muted}}>1:05 · 3 speakers</span>
        </div>
        <div style={{display: 'flex', gap: 6, padding: 5, background: C.subtle, borderRadius: 12}}>
          <span style={{padding: '6px 18px', borderRadius: 9, background: C.surface, fontSize: 22, fontWeight: 600, boxShadow: '0 1px 2px rgba(0,0,0,0.08)'}}>Clean</span>
          <span style={{padding: '6px 18px', fontSize: 22, color: C.muted}}>Verbatim</span>
        </div>
      </div>
      {TURNS.map((u, i) => {
        const active = i === 1 && playing;
        return (
          <Pop key={i} at={t + i * 5} dy={30} blur={6}>
            <div style={{display: 'flex', gap: 26, padding: '18px 16px', borderRadius: 16, background: active ? C.blueSoft : 'transparent'}}>
              <div style={{width: 190, flexShrink: 0, paddingTop: 6}}>
                <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                  <Dot color={SPK[u.who]} />
                  <span style={{fontSize: 30, fontWeight: 600, color: SPK[u.who]}}>{u.who}</span>
                  {active && <Eq h={24} />}
                </div>
                <div style={{fontFamily: MONO, fontSize: 22, color: C.muted, marginTop: 8}}>{u.ts}</div>
              </div>
              <div style={{fontSize: 36, lineHeight: 1.5, color: C.text}}>
                {u.text}
                {u.hit && (
                  <>
                    {' '}
                    <HitWord word={u.hit} click={click} />.
                  </>
                )}
              </div>
            </div>
          </Pop>
        );
      })}
    </Card>
  );
};

const HitWord: React.FC<{word: string; click: number}> = ({word, click}) => {
  const on = useCurrentFrame() >= click;
  return (
    <span style={{position: 'relative', display: 'inline-block', borderRadius: 8, background: on ? C.blueMid : 'transparent',
      color: on ? C.blue : C.text, boxShadow: on ? `0 0 0 6px ${C.blueMid}` : 'none'}}>
      {word}
      <Cursor path={[{f: click - 26, x: 440, y: 250}, {f: click - 2, x: 72, y: 36}]} clicks={[click]} />
    </span>
  );
};

const Player: React.FC<{at: number}> = ({at}) => {
  const f = useCurrentFrame();
  const sp = useSpring();
  const p = sp(at, SNAP);
  const sec = 11 + Math.max(0, (f - at) / 30);
  const pct = (sec / 65) * 100;
  return (
    <div style={{position: 'absolute', bottom: 100, left: '50%', opacity: Math.min(1, p * 1.5), transform: `translate(-50%, ${(1 - p) * 170}px)`}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 24, width: 980, padding: '20px 32px', boxSizing: 'border-box', borderRadius: 999,
        background: C.ink, color: C.onInk, boxShadow: C.shadow}}>
        <span style={{display: 'flex', gap: 7}}>
          <span style={{width: 8, height: 30, background: C.onInk, borderRadius: 2}} />
          <span style={{width: 8, height: 30, background: C.onInk, borderRadius: 2}} />
        </span>
        <span style={{fontFamily: MONO, fontSize: 26, fontVariantNumeric: 'tabular-nums'}}>{fmt(sec)}</span>
        <div style={{flex: 1, height: 8, borderRadius: 8, background: C.onInkSoft, position: 'relative'}}>
          <div style={{width: `${pct}%`, height: '100%', borderRadius: 8, background: C.onInk}} />
          <div style={{position: 'absolute', left: `${pct}%`, top: '50%', width: 22, height: 22, borderRadius: '50%', background: C.onInk, transform: 'translate(-50%, -50%)'}} />
        </div>
        <span style={{fontFamily: MONO, fontSize: 26, color: C.onInkMuted}}>1:05</span>
      </div>
    </div>
  );
};

// 5. "Every to-do. The notes write themselves: decisions, owners, deadlines."
export const Notes: React.FC<SceneProps> = ({sc}) => {
  const sp = useSpring();
  const {at} = useTiming(sc);
  const tEvery = at('every', 0, 6);
  const tTodo = at('to', 0, 18);
  const tNotes = at('notes', 0, 44);
  const tOwn = at('owners', 0, 104);
  const enter = sp(tNotes - 8, SNAP);
  // camera pushes in on the action items once owners are spoken
  const push = sp(tOwn - 4, {damping: 26, stiffness: 110, mass: 1});
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
      <Refrain words={['Every', 'to-do.']} at={[tEvery, tTodo]} out={tNotes - 10} />
      <div style={{position: 'absolute', opacity: Math.min(1, enter * 1.4), transformOrigin: '50% 82%',
        transform: `translateY(${(1 - enter) * 120 - push * 40}px) scale(${(0.94 + 0.06 * enter) * (1 + 0.18 * push)})`}}>
        <NotesCard t={tNotes} tDec={at('decisions', 0, 83)} tOwn={tOwn} tDead={at('deadlines', 0, 121)} />
      </div>
    </AbsoluteFill>
  );
};

const SUMMARY = 'Long recordings fail on export. Jonas raises the timeout and adds a retry; the fix ships Friday.';
const ACTIONS = [
  {task: 'Raise the timeout and add a retry', who: 'Jonas', due: 'Thu'},
  {task: 'Update the docs and announce the fix', who: 'Priya', due: 'Mon'},
  {task: 'Estimate expiring share links', who: 'Jonas', due: 'Wed'},
];

const Label: React.FC<{children: React.ReactNode}> = ({children}) => (
  <div style={{fontSize: 20, fontWeight: 600, letterSpacing: '0.08em', color: C.muted, textTransform: 'uppercase', marginBottom: 12}}>{children}</div>
);

const NotesCard: React.FC<{t: number; tDec: number; tOwn: number; tDead: number}> = ({t, tDec, tOwn, tDead}) => {
  const f = useCurrentFrame();
  const sp = useSpring();
  return (
    <Card style={{width: 1320}} pad="36px 46px">
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
          <span style={{fontSize: 36, fontWeight: 700}}>Notes</span>
          <Chip>General meeting</Chip>
        </div>
        <span style={{fontSize: 24, color: C.muted}}>Weekly sync</span>
      </div>
      <Label>Summary</Label>
      <div style={{fontSize: 32, lineHeight: 1.45, minHeight: 92, marginBottom: 24}}>{typed(SUMMARY, f, t, 80)}</div>
      <Pop at={tDec - 3} dy={24} blur={6}>
        <Label>Decisions</Label>
        <div style={{display: 'flex', alignItems: 'center', gap: 16, fontSize: 30, fontWeight: 500, marginBottom: 26}}>
          <span style={{width: 40, height: 40, borderRadius: '50%', background: C.greenSoft, color: C.green, display: 'grid', placeItems: 'center'}}>
            <IconCheck size={26} sw={3} />
          </span>
          Ship the export fix on Friday
        </div>
      </Pop>
      <Pop at={tOwn - 8} dy={24} blur={6}>
        <Label>Action items</Label>
      </Pop>
      {ACTIONS.map((a, i) => {
        const dp = sp(tDead + i * 3, BOUNCE);
        return (
          <Pop key={i} at={tOwn - 4 + i * 4} dx={-40} dy={0} blur={6}>
            <div style={{display: 'flex', alignItems: 'center', gap: 18, padding: '13px 0', borderTop: i ? `1px solid ${C.line}` : 'none'}}>
              <span style={{width: 30, height: 30, borderRadius: 8, border: `2px solid ${C.line2}`, flexShrink: 0}} />
              <span style={{flex: 1, fontSize: 30}}>{a.task}</span>
              <Chip><Dot color={SPK[a.who]} size={12} />{a.who}</Chip>
              <span style={{display: 'inline-flex', justifyContent: 'center', width: 96, padding: '8px 0', borderRadius: 999, fontSize: 24, fontWeight: 600,
                background: C.blueSoft, color: C.blue, opacity: Math.min(1, dp * 2), transform: `scale(${0.5 + 0.5 * dp})`}}>
                {a.due}
              </span>
            </div>
          </Pop>
        );
      })}
    </Card>
  );
};

// 6. "Standup, sales call, lecture: notes shaped to fit."
const TEMPLATES = ['Coding sync', 'General', 'Sales call', '1:1', 'Standup', 'Lecture', 'Interview', 'Therapy (SOAP)'];

export const Templates: React.FC<SceneProps> = ({sc}) => {
  const f = useCurrentFrame();
  const sp = useSpring();
  const {at} = useTiming(sc);
  const tNotes = at('notes', 0, 78);
  const steps = [
    {word: 'Standup', t: at('stand', 0, 6)},
    {word: 'Sales call', t: at('sales', 0, 35)},
    {word: 'Lecture', t: at('lecture', 0, 59)},
    {word: '1:1', t: tNotes + 4},
    {word: 'Interview', t: at('fit', 0, 102) + 2},
  ];
  const cur = steps.filter((s) => f >= s.t).length - 1;
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
      <div style={{position: 'absolute', top: 230, left: 0, right: 0, display: 'flex', justifyContent: 'center'}}>
        <Pop at={tNotes - 2} dy={20}>
          <Headline size={68} italic color={C.text2}>Notes shaped to fit</Headline>
        </Pop>
      </div>
      <div style={{position: 'relative', width: 1700, height: 220}}>
        {steps.map((s, i) => {
          if (f < s.t - 1) return null;
          const pin = Math.min(1.05, sp(s.t, SNAP));
          const pout = i < steps.length - 1 ? sp(steps[i + 1].t, SNAP) : 0;
          const b = (1 - Math.min(pin, 1)) * 8 + pout * 8;
          return (
            <div key={i} style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: Math.min(1, pin * 1.4) * (1 - pout), transform: `translateY(${(1 - pin) * 100 - pout * 100}px)`, filter: b > 0.2 ? `blur(${b}px)` : undefined}}>
              <Headline size={200}>{s.word}</Headline>
            </div>
          );
        })}
      </div>
      <div style={{position: 'absolute', bottom: 200, left: 0, right: 0, display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap'}}>
        {TEMPLATES.map((name, i) => (
          <Pop key={name} at={steps[0].t + 4 + i * 2} dy={20} blur={4}>
            <Chip dark={cur >= 0 && steps[cur].word === name} style={{fontSize: 28, padding: '12px 24px'}}>{name}</Chip>
          </Pop>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// 7. "Folders remember your context: briefs, docs, past meetings."
export const Memory: React.FC<SceneProps> = ({sc}) => {
  const f = useCurrentFrame();
  const sp = useSpring();
  const {at} = useTiming(sc);
  const tF = at('folders', 0, 6);
  const tCtx = at('context', 0, 42);
  const tB = at('briefs', 0, 64);
  const tD = at('docs', 0, 83);
  const tP = at('past', 0, 100);
  const tM = at('meetings', 0, 109);
  const items = [
    {t: tB, kind: 'doc', label: 'Team brief', meta: 'Q4 goals'},
    {t: tD, kind: 'pdf', label: 'Roadmap Q4.pdf'},
    {t: tD + 4, kind: 'pdf', label: 'Pricing audit.pdf'},
    {t: tP, kind: 'mic', label: 'Weekly sync', meta: '19 Sep'},
    {t: tP + 4, kind: 'mic', label: 'Weekly sync', meta: '26 Sep'},
    {t: tM + 2, kind: 'mic', label: 'Customer interviews', meta: '29 Sep'},
  ];
  const open = sp(tCtx - 6, SNAP);
  const rows = items.reduce((n, it) => n + Math.min(1, sp(it.t - 2, SNAP)), 0);
  const chipAt = Math.min(tM + 8, sc.length - 22);
  const glow = lerp(f, chipAt, chipAt + 12, 0, 1);
  return (
    <AbsoluteFill>
      <div style={{position: 'absolute', left: 150, top: 360}}>
        <Pop at={tF} dy={40}><Headline size={128}>Folders that</Headline></Pop>
        <Pop at={tF + 7} dy={40}><Headline size={128} italic>remember.</Headline></Pop>
      </div>
      <div style={{position: 'absolute', left: 940, top: 200}}>
        <Pop at={tF + 3} dy={60}>
          <Card style={{width: 840, boxShadow: `${C.shadow}, 0 0 0 ${glow * 8}px rgba(10,111,216,${0.14 * glow})`}} pad="30px 34px">
            <div style={{display: 'flex', alignItems: 'center', gap: 16, fontSize: 34, fontWeight: 600, height: 56}}>
              <span style={{transform: `rotate(${open * 90}deg)`, color: C.muted}}><IconChevron size={28} /></span>
              <span style={{color: C.text2}}><IconFolder size={36} /></span>
              Product team
              <span style={{marginLeft: 'auto'}}>
                <Pop at={chipAt} dy={0} scaleFrom={0.6}>
                  <Chip style={{background: C.blueSoft, color: C.blue}}><IconSpark size={22} /> Remembers 6 sources</Chip>
                </Pop>
              </span>
            </div>
            <div style={{height: rows * 76, overflow: 'hidden', paddingLeft: 58, marginTop: 10}}>
              {items.map((it, i) => (
                <Pop key={i} at={it.t} dx={-36} dy={0} blur={6}>
                  <div style={{display: 'flex', alignItems: 'center', gap: 18, height: 76, fontSize: 30, borderTop: `1px solid ${C.line}`}}>
                    <ItemIcon kind={it.kind} />
                    <span style={{fontWeight: 500}}>{it.label}</span>
                    {it.meta && <span style={{color: C.muted, fontSize: 26}}>· {it.meta}</span>}
                  </div>
                </Pop>
              ))}
            </div>
          </Card>
        </Pop>
      </div>
    </AbsoluteFill>
  );
};

export const ItemIcon: React.FC<{kind: string}> = ({kind}) =>
  kind === 'pdf' ? (
    <span style={{width: 54, height: 36, borderRadius: 8, background: C.redSoft, color: C.red, fontSize: 16, fontWeight: 700, display: 'grid', placeItems: 'center'}}>PDF</span>
  ) : (
    <span style={{width: 54, display: 'grid', placeItems: 'center', color: kind === 'mic' ? C.blue : C.text2}}>
      {kind === 'mic' ? <IconMic size={30} /> : <IconDoc size={30} />}
    </span>
  );
