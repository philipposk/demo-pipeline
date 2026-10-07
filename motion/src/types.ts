import {SceneData} from './lib';
import {Theme} from './theme';
import {TIMELINES} from './timelines';

// One narration timeline, as written by scripts/voice.mjs (src/timelines/<tag>.json).
export type Timeline = {tag: string; script?: string; fps: number; xf: number; total: number; scenes: (SceneData & {caption?: string})[]};

// Props every product's Demo component receives. `captions: false` leaves the phone cut's word captions out (clean poster stills).
export type DemoProps = {tag: string; theme: Theme; music: string | null; voiceover?: boolean; format?: 'landscape' | 'vertical'; captions?: boolean};

export const timelineOf = (tag: string) => (TIMELINES as unknown as Record<string, Timeline>)[tag];
