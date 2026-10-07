import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {C, INTER} from '../theme';
import {CL, Card, Cursor, Drift, Headline, Pop, SNAP, SceneProps, Sfx, lerp, typed, useSpring, useTiming} from '../lib';
import {CARD, Counter, Mark, ROW_H, TaskRow} from './kit';

// Invented data: a short to-do list and one new task.
const TASKS = [
  {title: 'Reply to Sam', tag: 'Work'},
  {title: 'Pick up groceries', tag: 'Home'},
  {title: 'Water the plants', tag: 'Home'},
];
const NEW_TASK = {title: 'Book dentist', tag: 'Health'};

// 1. "Meet Acme Tasks. A to-do list that stays out of your way." Mark pops in, slides left, the name wipes in, tagline rises.
export const Hook: React.FC<SceneProps> = ({sc}) => {
  const f = useCurrentFrame();
  const sp = useSpring();
  const {wi} = useTiming(sc);
  const tName = wi(1, 14);
  const tTag = wi(3, 44);
  const markIn = sp(2, {damping: 11, stiffness: 160, mass: 0.8});
  const slide = sp(tName - 3, SNAP);
  const reveal = lerp(f, tName - 2, tName + 12, 0, 1);
  const MARK = 190;
  const GAP = 40;
  const WORD = 930;
  const left = 960 - (MARK + GAP + WORD) / 2;
  const markX = interpolate(slide, [0, 1], [960 - MARK / 2, left]);
  return (
    <Drift length={sc.length} zoom={0.08}>
      <div style={{position: 'absolute', left: markX, top: 460 - MARK / 2, opacity: Math.min(1, markIn * 2),
        transform: `scale(${0.3 + 0.7 * markIn}) rotate(${(1 - markIn) * -14}deg)`}}>
        <Mark size={MARK} draw={lerp(f, 8, 24, 0, 1)} />
      </div>
      <div style={{position: 'absolute', left: left + MARK + GAP, top: 460 - 110, height: 220, display: 'flex', alignItems: 'center',
        clipPath: `inset(-20px ${(1 - reveal) * 100}% -20px 0)`}}>
        <div style={{fontFamily: INTER, fontWeight: 700, fontSize: 164, letterSpacing: '-0.045em', color: C.text, whiteSpace: 'nowrap',
          transform: `translateX(${(1 - reveal) * -70}px)`}}>
          Acme Tasks
        </div>
      </div>
      <div style={{position: 'absolute', top: 680, left: 0, right: 0, display: 'flex', justifyContent: 'center'}}>
        <Pop at={tTag} dy={30}>
          <Headline size={68} italic color={C.text2}>A to-do list that stays out of your way.</Headline>
        </Pop>
      </div>
    </Drift>
  );
};

// The shared app window: header, input, and the list. `typedText`/`focus` drive the input, `rows` is the list below it.
const AppCard: React.FC<{left: number; typedText?: string; focus?: number; enter?: number; children: React.ReactNode}> = ({left, typedText = '', focus = 0, enter = 0, children}) => (
  <Card style={{width: CARD.w, height: CARD.h, overflow: 'hidden'}} pad={CARD.pad}>
    <div style={{height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28}}>
      <div style={{fontSize: 46, fontWeight: 700, letterSpacing: '-0.02em'}}>Today</div>
      <Counter n={left} />
    </div>
    <div style={{height: CARD.inputH, boxSizing: 'border-box', borderRadius: 18, padding: '0 24px', display: 'flex', alignItems: 'center', gap: 16,
      background: C.bg, border: `2px solid ${focus > 0.5 ? C.blue : C.line2}`, boxShadow: focus > 0.5 ? `0 0 0 6px ${C.blueSoft}` : 'none'}}>
      <span style={{flex: 1, fontSize: 32, color: typedText ? C.text : C.muted}}>
        {typedText || 'Add a task'}
        {focus > 0.5 && !enter && <span style={{display: 'inline-block', width: 3, height: 34, background: C.blue, marginLeft: 3, verticalAlign: 'middle'}} />}
      </span>
      <span style={{width: 56, height: 44, borderRadius: 10, display: 'grid', placeItems: 'center', fontSize: 26, fontWeight: 600,
        background: enter ? C.ink : C.subtle, color: enter ? C.onInk : C.muted, transform: `scale(${1 - enter * 0.1})`}}>
        ↵
      </span>
    </div>
    <div style={{height: 24}} />
    {children}
  </Card>
);

// 2. "Type a task, press enter, and it lands on your list."
export const Add: React.FC<SceneProps> = ({sc}) => {
  const f = useCurrentFrame();
  const {at} = useTiming(sc);
  const tClick = at('a', 0, 16, true);
  const tType = at('task', 0, 22);
  const tEnter = at('enter', 0, 56);
  const tLands = at('lands', 0, 78);
  const text = typed(NEW_TASK.title, f, tType, 12);
  const sent = f >= tEnter + 2;
  const grow = lerp(f, tEnter + 4, tEnter + 20, 0, 1);
  const focus = f >= tClick ? 1 : 0;
  const enterPress = f >= tEnter && f < tEnter + 8 ? 1 : 0;
  const fresh = interpolate(f, [tEnter + 8, tEnter + 24, tLands + 30, tLands + 46], [0, 1, 1, 0], CL);
  return (
    <Drift length={sc.length} zoom={0.05}>
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
        <Pop at={0} dy={50} scaleFrom={0.94}>
          <div style={{position: 'relative', transform: 'scale(1.18)'}}>
            <AppCard left={sent ? 4 : 3} typedText={sent ? '' : text} focus={sent ? 0 : focus} enter={enterPress}>
              <div style={{height: ROW_H * 4, overflow: 'hidden'}}>
                <div style={{height: ROW_H * grow, overflow: 'hidden', opacity: grow}}>
                  <div style={{transform: `translateY(${(1 - grow) * -20}px)`}}><TaskRow {...NEW_TASK} fresh={fresh} /></div>
                </div>
                {TASKS.map((t) => <TaskRow key={t.title} {...t} />)}
              </div>
            </AppCard>
            <Cursor path={[{f: 0, x: 860, y: 520}, {f: tClick - 3, x: 360, y: CARD.inputTop + CARD.inputH / 2}, {f: tEnter - 6, x: 380, y: CARD.inputTop + CARD.inputH / 2 + 6},
              {f: tLands + 18, x: 600, y: 430}]} clicks={[tClick]} />
          </div>
        </Pop>
        <Sfx at={tClick} src="sfx/click.wav" />
        <Sfx at={tEnter} src="sfx/click.wav" />
      </AbsoluteFill>
    </Drift>
  );
};

// 3. "Tick it off when it's done. Acme Tasks. Less clutter, more done." Tick the new task, then the card leaves for the end card.
export const Done: React.FC<SceneProps> = ({sc}) => {
  const f = useCurrentFrame();
  const sp = useSpring();
  const {at} = useTiming(sc);
  const tTick = at('off', 0, 14);
  const tOut = at('acme', 0, 64, true) - 4;
  const tName = at('acme', 0, 64, true);
  const tLine = at('less', 0, 96);
  const done = lerp(f, tTick, tTick + 10, 0, 1);
  const out = Math.min(tOut, sc.length - 50);
  const logoIn = sp(tName - 2, {damping: 11, stiffness: 160, mass: 0.8});
  const reveal = lerp(f, tName, tName + 12, 0, 1);
  const MARK = 150;
  const GAP = 32;
  const WORD = 730;
  const left = 960 - (MARK + GAP + WORD) / 2;
  const rows = [NEW_TASK, ...TASKS];
  return (
    <Drift length={sc.length} zoom={0.1}>
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
        <Pop at={0} dy={0} scaleFrom={0.97} out={out}>
          <div style={{position: 'relative', transform: 'scale(1.18)'}}>
            <AppCard left={done > 0.5 ? 3 : 4}>
              <div style={{height: ROW_H * 4, overflow: 'hidden'}}>
                {rows.map((t, i) => <TaskRow key={t.title} {...t} done={i === 0 ? done : 0} />)}
              </div>
            </AppCard>
            <Cursor path={[{f: 0, x: 700, y: 540}, {f: tTick - 3, x: 76, y: CARD.listTop + ROW_H / 2}, {f: tTick + 24, x: 330, y: CARD.listTop + ROW_H * 2}]} clicks={[tTick]} />
          </div>
        </Pop>
        <div style={{position: 'absolute', left: left, top: 470 - MARK / 2, opacity: Math.min(1, logoIn * 2),
          transform: `scale(${0.3 + 0.7 * logoIn}) rotate(${(1 - logoIn) * -14}deg)`}}>
          <Mark size={MARK} draw={lerp(f, tName + 4, tName + 18, 0, 1)} />
        </div>
        <div style={{position: 'absolute', left: left + MARK + GAP, top: 470 - 90, height: 180, display: 'flex', alignItems: 'center',
          clipPath: `inset(-20px ${(1 - reveal) * 100}% -20px 0)`}}>
          <div style={{fontFamily: INTER, fontWeight: 700, fontSize: 128, letterSpacing: '-0.045em', color: C.text, whiteSpace: 'nowrap',
            transform: `translateX(${(1 - reveal) * -60}px)`}}>
            Acme Tasks
          </div>
        </div>
        <div style={{position: 'absolute', top: 640, left: 0, right: 0, display: 'flex', justifyContent: 'center'}}>
          <Pop at={tLine} dy={30}>
            <Headline size={80} italic color={C.text2}>Less clutter, more done.</Headline>
          </Pop>
        </div>
        <Sfx at={tTick} src="sfx/click.wav" />
      </AbsoluteFill>
    </Drift>
  );
};
