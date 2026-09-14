// Deal Agent (https://dealagent.valuer.ai) — product ad / demo for Danish funds.
//
// Story: find companies → inspect one → shortlist it with a label → move it
// through the pipeline → ask Egon to do the work → bring the team → trial.
//
// 1) Log in ONCE — a browser opens, you log in yourself with the DEMO fund
//    account (this tool never sees your password). Session → .auth/dealagent.json
//      node pipeline.mjs login dealagent
// 2) Render:
//      node pipeline.mjs dealagent --mode=zoom                              # 60–90 s landscape ad
//      node pipeline.mjs dealagent --mode=short --preset=highlights         # 20–30 s vertical reel
//      node pipeline.mjs dealagent --mode=zoom --format=square --preset=highlights
//      node pipeline.mjs dealagent --mode=zoom --lang=da                    # Danish narration
//      node pipeline.mjs dealagent --preset=public --mode=zoom              # public pages only, no login
//    Check timing first: add --dry-run to any of the above.
//
// Optional env:
//   DEALAGENT_URL          base URL (default https://dealagent.valuer.ai)
//   DEALAGENT_COMPANY      search this company first instead of opening the top row
//   DEALAGENT_LABEL        label used for the shortlist (default "Shortlist")
//   DEALAGENT_EGON_PROMPT  what to type to Egon (default: filter + label request below)
//   DEALAGENT_READONLY=1   skip every write (add label, drag deal, apply Egon's label)
//
// Data hygiene: record from a dedicated demo fund, never a customer's. Company
// data on screen is public registry data (CVR, annual reports). Emails,
// identity-provider user ids and CPR-style numbers are blurred in the page
// before recording (see `mask`). Logo: this repo is public, so the Valuer mark is
// not committed — drop it at assets/brand/dealagent-logo.png to use it (README).

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = (process.env.DEALAGENT_URL || 'https://dealagent.valuer.ai').replace(/\/$/, '');
const LABEL = process.env.DEALAGENT_LABEL || 'Shortlist';
const COMPANY = process.env.DEALAGENT_COMPANY || '';
const WRITE = process.env.DEALAGENT_READONLY !== '1';
const EGON_PROMPT = process.env.DEALAGENT_EGON_PROMPT
  ? { en: process.env.DEALAGENT_EGON_PROMPT, da: process.env.DEALAGENT_EGON_PROMPT }
  : {
    en: `Find Copenhagen companies founded after 2015 with more than 10 million DKK in gross profit, and label them "${LABEL}".`,
    da: `Find selskaber i København stiftet efter 2015 med over 10 mio. kr. i bruttofortjeneste, og giv dem labelen "${LABEL}".`,
  };
const LOGO = 'assets/brand/dealagent-logo.png';
const hasLogo = existsSync(fileURLToPath(new URL(`../${LOGO}`, import.meta.url)));

// The app marks places its own assistant may point at with data-pa-anchor —
// the most stable selectors it has.
const A = (name) => `[data-pa-anchor="${name}"]`;
const tr = (v, lang) => (typeof v === 'string' ? v : v[lang] ?? v.en);

// ─── helpers ──────────────────────────────────────────────────────────────────
async function visible(loc, ms = 3000) {
  return loc.first().waitFor({ state: 'visible', timeout: ms }).then(() => true).catch(() => false);
}

/** Glide the (fake) cursor to an element so the viewer can follow it. */
async function glideTo(page, loc, steps = 22) {
  const el = loc.first();
  await el.waitFor({ state: 'visible', timeout: 10000 });
  await el.scrollIntoViewIfNeeded().catch(() => {});
  const b = await el.boundingBox();
  if (b) await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps });
}

async function glideClick(page, loc, pause = 180) {
  await glideTo(page, loc);
  await page.waitForTimeout(pause);
  await loc.first().click();
}

/** Run an optional beat; log and carry on if the UI is not in the expected state. */
async function soft(what, fn) {
  try { await fn(); } catch (e) { console.warn(`    [${what}] skipped: ${e.message.split('\n')[0]}`); }
}

/** First real (unlocked) row of the companies table. */
function firstRow(page) {
  return page.locator(`${A('companies.table')} div.cursor-pointer`)
    .filter({ has: page.locator('button[aria-label$="ike company"]') })
    .first();
}

async function openSidebar(page, name, fallbackPath) {
  const nav = page.getByRole('button', { name }).first();
  if (await visible(nav, 1500)) await glideClick(page, nav);
  else await page.goto(`${BASE}${fallbackPath}`, { waitUntil: 'domcontentloaded' });
}

/** Runs in the page before app scripts: dark theme, no daily trial banner. */
function prepApp({ origin }) {
  if (location.origin !== origin) return;
  try {
    localStorage.setItem('theme', 'dark');
    localStorage.setItem('trial-banner.dismissed', new Date().toISOString().slice(0, 10));
  } catch {}
}

export default {
  name: 'Deal Agent',
  url: `${BASE}/dashboard/companies`,
  mode: 'zoom',
  subtitles: 'sidecar',
  viewport: { width: 1600, height: 900 },
  // Vertical / square cuts shrink the recording to fit; record smaller so the UI reads larger.
  viewports: {
    portrait: { width: 1280, height: 720 },
    square: { width: 1280, height: 720 },
    '4:5': { width: 1280, height: 720 },
  },
  deviceScaleFactor: 2,
  contextOptions: { colorScheme: 'dark', locale: 'en-GB', timezoneId: 'Europe/Copenhagen' },
  initScripts: [{ fn: prepApp, arg: { origin: new URL(BASE).origin } }],

  // Login session (see lib/auth.mjs). Auth0 SPA with tokens in localStorage.
  auth: {
    loginUrl: `${BASE}/`,
    successUrl: /\/dashboard\//,
    loggedOutUrl: /auth0\.com\//,
    readySelector: A('companies.table'),
    tokenKey: /^@@auth0spajs@@/,
  },

  // Blur personal data in the page before it is recorded.
  mask: {
    emails: true,
    patterns: ['\\b\\d{6}-\\d{4}\\b'], // CPR-style personal numbers (CVR numbers stay visible)
    selectors: ['[data-demo-private]'],
    blurPx: 8,
  },

  // Free, no key. Ava ≈ 2.6 words/s; Christel is the matching Danish voice.
  tts: { backend: 'edge', voice: 'en-US-AvaMultilingualNeural' },
  ttsByLang: {
    en: { backend: 'edge', voice: 'en-US-AvaMultilingualNeural' },
    da: { backend: 'edge', voice: 'da-DK-ChristelNeural' },
  },

  video: { crf: 17, preset: 'slow', fps: 30, zoom: 0.14 },
  frame: { colors: ['0x312e81', '0x0b1020'] }, // indigo → navy, matches the app
  logo: hasLogo ? LOGO : null,
  logoOpacity: 0.85,
  intro: {
    dur: 2.8,
    bg: '0x0b1020',
    title: 'Deal Agent',
    subtitle: { en: 'AI deal sourcing for Danish private companies', da: 'AI-dealsourcing i danske private selskaber' },
  },
  outro: {
    dur: 3.2,
    bg: '0x0b1020',
    title: { en: 'Start your 14-day trial', da: 'Start en 14-dages prøveperiode' },
    subtitle: 'dealagent.valuer.ai',
  },

  // full = the whole story (priority ≥ 20), public = pages that need no login.
  // highlights (priority ≥ 70) and basic (tag core or priority ≥ 90) use the defaults.
  presets: {
    full: { minPriority: 20 },
    public: { tags: ['public'] },
  },

  scenes: [
    {
      id: 'public-login',
      title: 'Login page (public)',
      tags: ['public'],
      priority: 10,
      startUrl: `${BASE}/`,
      narration: {
        en: 'This is Deal Agent, by Valuer — deal sourcing for Danish private companies.',
        da: 'Det her er Deal Agent fra Valuer — dealsourcing i danske private selskaber.',
      },
      action: async (page) => {
        await page.getByRole('button', { name: 'Log in' }).waitFor({ timeout: 15000 });
        await page.waitForTimeout(800);
        await glideTo(page, page.getByRole('button', { name: 'Log in' }));
        await page.waitForTimeout(900);
        await glideClick(page, page.getByRole('link', { name: 'Create an account' }));
      },
    },
    {
      id: 'list',
      title: 'Every Danish company, screened',
      tags: ['core'],
      priority: 95,
      narration: {
        en: "Deal Agent puts every Danish private company in one list — screened against your fund's own criteria.",
        da: 'Deal Agent samler alle danske private selskaber i én liste — screenet efter jeres fonds egne kriterier.',
      },
      shortNarration: {
        en: 'Every Danish company, screened for your fund.',
        da: 'Alle danske selskaber, screenet for jeres fond.',
      },
      action: async (page) => {
        await page.locator(A('companies.table')).waitFor({ timeout: 20000 });
        await page.waitForTimeout(700);
        await glideTo(page, firstRow(page), 30);
        await page.waitForTimeout(400);
        await page.mouse.wheel(0, 260);
        await page.waitForTimeout(900);
        await page.mouse.wheel(0, -260);
      },
    },
    {
      id: 'filters',
      title: 'Filter in plain kroner',
      priority: 65,
      narration: {
        en: 'Narrow it down in seconds: profit, growth, region, industry — in plain Danish kroner.',
        da: 'Indsnævr feltet på sekunder: indtjening, vækst, region og branche — i almindelige danske kroner.',
      },
      shortNarration: {
        en: 'Filter by profit and growth, in plain kroner.',
        da: 'Filtrér på indtjening og vækst — i kroner.',
      },
      action: async (page) => {
        await glideClick(page, page.getByRole('button', { name: 'Open filters' }));
        const sheet = page.getByRole('dialog').filter({ hasText: 'Financial Metrics' });
        await sheet.waitFor({ timeout: 8000 });
        await page.waitForTimeout(500);
        await sheet.getByRole('heading', { name: 'Financial Metrics' })
          .evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        await page.waitForTimeout(900);
        await soft('gross-profit min', async () => {
          // Innermost block holding the "Gross Profit (DKK)" label and its Min field.
          const block = sheet.locator('div')
            .filter({ has: page.locator('label', { hasText: /^Gross Profit \(DKK\)$/ }) })
            .filter({ has: page.getByPlaceholder('Min') })
            .last();
          const min = block.getByPlaceholder('Min');
          await glideClick(page, min);
          await min.fill('');
          await min.pressSequentially('10M', { delay: 140 }); // = 10,000,000 DKK
          await min.press('Enter');
        });
        await page.waitForTimeout(1200);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(600);
      },
    },
    {
      id: 'company',
      title: 'Open a company',
      priority: 90,
      narration: {
        en: 'Open any company for the full picture: years of financials, owners and management.',
        da: 'Åbn et selskab og få hele billedet: regnskaber over flere år, ejere og ledelse.',
      },
      shortNarration: {
        en: 'Open any company: financials, owners, management.',
        da: 'Åbn et selskab: regnskaber, ejere, ledelse.',
      },
      action: async (page) => {
        if (COMPANY) {
          await soft('search', async () => {
            const search = page.locator(A('companies.search'));
            await glideClick(page, search);
            await search.fill('');
            await search.pressSequentially(COMPANY, { delay: 70 });
            await page.waitForTimeout(1500);
          });
        }
        await glideClick(page, firstRow(page).locator('.font-semibold').first());
        await page.locator(A('company.dialog')).waitFor({ timeout: 10000 });
        await page.waitForTimeout(900);
        await soft('financials', () => page.locator(A('company.financials'))
          .evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' })));
        await page.waitForTimeout(900);
      },
    },
    {
      id: 'news',
      title: 'News, notes and alerts',
      priority: 40,
      narration: {
        en: 'News, notes and alerts sit on the same card — so you catch the moment a company starts to move.',
        da: 'Nyheder, noter og alarmer ligger på samme kort — så I fanger øjeblikket, hvor et selskab begynder at rykke.',
      },
      action: async (page) => {
        await glideClick(page, page.getByRole('tab', { name: /^News/ }));
        await page.waitForTimeout(1500);
      },
    },
    {
      id: 'label',
      title: 'Label it — your shortlist',
      priority: 85,
      narration: {
        en: "Like it? Label it. Labels are your fund's shortlists, shared with the whole team.",
        da: 'Kan du lide det? Giv det en label. Labels er jeres shortlister, delt med hele teamet.',
      },
      shortNarration: {
        en: 'Label it — your shared shortlist.',
        da: 'Giv det en label — jeres delte shortliste.',
      },
      action: async (page) => {
        const labels = page.locator(A('company.disqualify'));
        await labels.scrollIntoViewIfNeeded().catch(() => {});
        const existing = labels.locator('span', { hasText: new RegExp(`^${LABEL}$`) });
        if (await visible(existing, 800)) { // already shortlisted (re-take): just point at it
          await glideTo(page, existing, 25);
          await page.waitForTimeout(800);
          return;
        }
        await glideClick(page, labels.getByRole('button', { name: 'Add label' }));
        const input = page.getByPlaceholder('Type label name...');
        await input.waitFor({ timeout: 6000 });
        await page.waitForTimeout(300);
        await input.pressSequentially(LABEL, { delay: 90 });
        await page.waitForTimeout(400);
        if (WRITE) await input.press('Enter');
        await page.waitForTimeout(1200);
        if (await visible(input, 300)) await page.keyboard.press('Escape'); // close the label dialog only
        await page.waitForTimeout(500);
      },
    },
    {
      id: 'shortlist',
      title: 'Open the shortlist',
      priority: 50,
      narration: {
        en: 'One click on the label brings the list back — for everyone on the team.',
        da: 'Ét klik på labelen henter listen frem igen — for alle på teamet.',
      },
      action: async (page) => {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        const side = page.locator(`[title^="${LABEL} — drag"]`); // sidebar label entry
        if (await visible(side, 1500)) await glideClick(page, side);
        else await page.goto(`${BASE}/dashboard/companies?label=${encodeURIComponent(LABEL)}`);
        await page.locator(A('companies.table')).waitFor({ timeout: 15000 });
        await page.waitForTimeout(900);
      },
    },
    {
      id: 'pipeline',
      title: 'Deal pipeline',
      priority: 85,
      narration: {
        en: 'Ready for a closer look? Move it through your own deal pipeline, stage by stage.',
        da: 'Klar til et nærmere kig? Ryk det gennem jeres egen deal-pipeline, fase for fase.',
      },
      shortNarration: {
        en: 'Then move it through your pipeline.',
        da: 'Ryk det videre i jeres pipeline.',
      },
      action: async (page) => {
        await page.keyboard.press('Escape');
        await openSidebar(page, /^Pipeline/, '/dashboard/pipeline');
        const board = page.locator(A('pipeline.stages'));
        await board.waitFor({ timeout: 15000 });
        await page.waitForTimeout(900);
        if (!WRITE) { await glideTo(page, board.locator('[draggable="true"]').first(), 25); return; }
        await soft('drag deal', async () => {
          const cols = board.locator('section');
          const n = await cols.count();
          for (let i = 0; i < n - 1; i++) {
            const card = cols.nth(i).locator('[draggable="true"]').first();
            const target = cols.nth(i + 1);
            const won = await target.locator('header svg.lucide-trophy, header svg.lucide-circle-x, header svg.lucide-x-circle').count();
            if (!(await card.count()) || won) continue; // never drop into Won/Lost
            const b = await target.boundingBox();
            if (!b) continue;
            await glideTo(page, card, 25); // mouse now rests on the card
            await page.mouse.down();
            await page.mouse.move(b.x + b.width / 2, b.y + Math.min(140, b.height / 3), { steps: 30 });
            await page.waitForTimeout(150);
            await page.mouse.up();
            return;
          }
          throw new Error('no movable deal found');
        });
        await page.waitForTimeout(900);
      },
    },
    {
      id: 'egon-ask',
      title: 'Ask Egon',
      tags: ['core'],
      priority: 90,
      narration: {
        en: 'Or just ask Egon, your AI deal agent. He knows your labels and your stages.',
        da: 'Eller spørg bare Egon, jeres AI-dealagent. Han kender jeres labels og jeres faser.',
      },
      shortNarration: {
        en: 'Or just ask Egon.',
        da: 'Eller spørg bare Egon.',
      },
      action: async (page, ctx) => {
        // Live UI still labels the dock "Deal Agent"; the Egon rename is in flight.
        await glideClick(page, page.getByRole('button', { name: /^Open (Deal Agent|Egon)$/ }));
        const box = page.getByPlaceholder(/^Message/);
        await box.waitFor({ timeout: 8000 });
        await page.waitForTimeout(400);
        await glideClick(page, box);
        const prompt = tr(EGON_PROMPT, ctx.lang);
        if (ctx.mode === 'short') await box.fill(prompt);
        else await box.pressSequentially(prompt, { delay: 18 });
        await page.waitForTimeout(300);
        await box.press('Enter');
      },
    },
    {
      id: 'egon-do',
      title: 'Egon does the work',
      tags: ['core'],
      priority: 90,
      narration: {
        en: "He doesn't just answer. He finds the matches, shows you why, and applies the label when you confirm.",
        da: 'Han svarer ikke bare. Han finder selskaberne, viser hvorfor, og sætter labelen på, når du bekræfter.',
      },
      shortNarration: {
        en: 'He does the work. You confirm.',
        da: 'Han gør arbejdet. Du bekræfter.',
      },
      action: async (page, ctx) => {
        const apply = page.getByRole('button', { name: 'Apply label' });
        const thinking = page.locator('[data-test-id="typing-indicator"]');
        const maxWait = ctx.mode === 'short' ? 9000 : 30000;
        const t0 = Date.now();
        await page.waitForTimeout(800);
        while (Date.now() - t0 < maxWait) {
          if (await apply.isVisible().catch(() => false)) break;
          if (Date.now() - t0 > 2500 && !(await thinking.isVisible().catch(() => false))) break;
          await page.waitForTimeout(250);
        }
        if (WRITE && (await apply.isVisible().catch(() => false))) {
          await page.waitForTimeout(ctx.mode === 'short' ? 300 : 1200);
          await glideClick(page, apply);
          await page.waitForTimeout(1500);
        }
      },
    },
    {
      id: 'voice',
      title: 'Talk to Egon',
      priority: 35,
      narration: {
        en: 'Busy? Hold the mic and just say it.',
        da: 'Travlt? Hold mikrofonen nede, og sig det bare.',
      },
      action: async (page) => {
        // Hover only — clicking would ask for microphone permission.
        await glideTo(page, page.getByRole('button', { name: 'Start voice input' }), 25);
        await page.waitForTimeout(700);
      },
    },
    {
      id: 'team',
      title: 'Bring your team',
      priority: 60,
      narration: {
        en: 'Invite your team: one set of labels, one pipeline, the same numbers for everyone.',
        da: 'Invitér teamet: de samme labels, én pipeline og de samme tal for alle.',
      },
      shortNarration: {
        en: 'Bring your whole team.',
        da: 'Tag hele teamet med.',
      },
      action: async (page) => {
        await page.keyboard.press('Escape'); // close Egon
        await page.waitForTimeout(400);
        await openSidebar(page, /^Settings$/, '/dashboard/settings');
        const team = page.getByRole('button', { name: /^Team$/ }); // admin-only tab
        if (await visible(team, 5000)) await glideClick(page, team);
        else await soft('organization tab', () => glideClick(page, page.getByRole('button', { name: /^Organization$/ })));
        await page.waitForTimeout(1200);
      },
    },
    {
      id: 'trial',
      title: 'Start a 14-day trial',
      tags: ['core', 'public'],
      priority: 90,
      narration: {
        en: 'Built for Danish funds. Start your 14-day trial at dealagent.valuer.ai.',
        da: 'Bygget til danske fonde. Start en 14-dages prøveperiode på dealagent.valuer.ai.',
      },
      shortNarration: {
        en: 'Start your 14-day trial today.',
        da: 'Start en 14-dages prøveperiode i dag.',
      },
      action: async (page) => {
        await page.keyboard.press('Escape');
        if (!/\/signup/.test(page.url())) await page.goto(`${BASE}/signup`, { waitUntil: 'domcontentloaded' });
        const cta = page.getByRole('button', { name: /Create account/ });
        await cta.waitFor({ timeout: 15000 });
        await page.waitForTimeout(500);
        await glideTo(page, cta, 28);
        await page.waitForTimeout(500);
      },
    },
  ],
};
