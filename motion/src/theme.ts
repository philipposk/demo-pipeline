import {loadFont as loadInter} from '@remotion/google-fonts/Inter';
import {loadFont as loadNewsreader} from '@remotion/google-fonts/Newsreader';
import {loadFont as loadMono} from '@remotion/google-fonts/GeistMono';

// Default type system: Inter for UI, Newsreader for headlines, Geist Mono for times/code. A product can load its own faces
// (see 'Adding your product' in the README) and pass them where the kit takes a font.
export const INTER = loadInter('normal', {weights: ['400', '500', '600', '700'], subsets: ['latin']}).fontFamily;
export const SERIF = loadNewsreader('normal', {weights: ['400'], subsets: ['latin']}).fontFamily;
loadNewsreader('italic', {weights: ['400'], subsets: ['latin']});
export const MONO = loadMono('normal', {weights: ['400', '500'], subsets: ['latin']}).fontFamily;

export type Theme = 'light' | 'dark';

// Default light tokens: neutral greys plus a blue accent, nudged for video legibility. A product replaces them with its own
// real design values by calling Object.assign(C, ...) from its own apply<Product>Theme().
const LIGHT = {
  bg: '#fdfdfd',
  surface: '#ffffff',
  subtle: '#f3f3f2',
  text: '#191919',
  text2: '#4d4d4d',
  muted: '#7b7b7b',
  line: '#e6e6e6',
  line2: '#d7d7d7',
  ink: '#0a0a0a',
  onInk: '#ffffff',
  onInkSoft: 'rgba(255,255,255,0.22)',
  onInkMuted: 'rgba(255,255,255,0.6)',
  blue: '#0a6fd8',
  blueSoft: 'rgba(10,111,216,0.10)',
  blueMid: 'rgba(10,111,216,0.18)',
  green: '#12863f',
  greenSoft: 'rgba(18,134,63,0.10)',
  red: '#e5484d',
  redSoft: 'rgba(229,72,77,0.12)',
  amber: '#a86200',
  amberSoft: 'rgba(255,176,32,0.18)',
  toastIcon: '#46fea5',
  glowA: 'rgba(110,168,254,0.40)',
  glowB: 'rgba(186,167,255,0.34)',
  glowC: 'rgba(110,168,254,0.15)',
  shadow: '0 1px 2px rgba(16,24,40,0.04), 0 10px 30px rgba(16,24,40,0.07), 0 40px 90px rgba(30,60,120,0.10)',
};

// Default dark tokens: black page, hairline borders, inverted primary buttons.
const DARK: typeof LIGHT = {
  bg: '#030304',
  surface: '#101113',
  subtle: '#1a1c1f',
  text: '#f0f0f0',
  text2: '#a1a4a5',
  muted: '#828a8d',
  line: '#24272b',
  line2: '#3a3e43',
  ink: '#f2f2f2',
  onInk: '#0a0a0a',
  onInkSoft: 'rgba(0,0,0,0.18)',
  onInkMuted: 'rgba(0,0,0,0.55)',
  blue: '#70b8ff',
  blueSoft: 'rgba(0,119,255,0.18)',
  blueMid: 'rgba(0,119,255,0.30)',
  green: '#46fea5',
  greenSoft: 'rgba(70,254,165,0.12)',
  red: '#ff9592',
  redSoft: 'rgba(255,149,146,0.14)',
  amber: '#ffca16',
  amberSoft: 'rgba(255,202,22,0.14)',
  toastIcon: '#12863f',
  glowA: 'rgba(80,140,255,0.26)',
  glowB: 'rgba(150,120,255,0.22)',
  glowC: 'rgba(110,168,254,0.10)',
  shadow: '0 0 0 1px rgba(255,255,255,0.03), 0 1px 14px rgba(255,255,255,0.05), 0 30px 80px rgba(0,0,0,0.55)',
};

// Mutable on purpose: every component imports these objects, and applyTheme() swaps their values in place
// before the scene tree renders, so one composition renders either theme.
export const C = {...LIGHT};

export const applyTheme = (theme: Theme) => {
  Object.assign(C, theme === 'dark' ? DARK : LIGHT);
};
