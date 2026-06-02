// Auto-scene generator: given any live URL, discover the site's nav + content
// and build a click-through scene list — no hand-authored config needed. This
// is what lets the hosted platform make a video for an arbitrary user URL.
//
// Narration is templated by default; if OPENROUTER_API_KEY is set it is rewritten
// into a smoother script by a cheap LLM (graceful fallback to templates).

import { chromium } from 'playwright';

const BANNER_RE = /^(accept|accept all|agree|i agree|got it|ok(ay)?|continue|i am (21|18)|enter site|enter|yes,? i am)/i;

/** Click a common cookie/age/consent banner button if present. */
async function dismissBanner(page) {
  try {
    const btn = page.getByRole('button', { name: BANNER_RE }).first();
    if (await btn.isVisible({ timeout: 1200 })) {
      await btn.click();
      await page.waitForTimeout(400);
    }
  } catch {}
}

/** Smooth-scroll to a pixel offset (animated, so the frame isn't frozen). */
async function smoothScrollTo(page, toY, durationMs = 1200) {
  await page.evaluate(({ toY, durationMs }) =>
    new Promise((resolve) => {
      const startY = window.scrollY, delta = toY - startY, t0 = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - t0) / durationMs);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        window.scrollTo(0, startY + delta * e);
        if (t < 1) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    }), { toY, durationMs });
}

/** Crawl the landing page: title, description, hero, and same-origin nav links. */
export async function scrapeSite(url, { maxPages = 4 } = {}) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);
    await dismissBanner(page);

    const origin = new URL(url).origin;
    const title = (await page.title()).trim();
    const description = await page
      .$eval('meta[name="description"]', (e) => e.getAttribute('content') || '')
      .catch(() => '');
    const h1 = await page.$eval('h1', (e) => e.innerText.trim()).catch(() => '');

    const nav = await page.$$eval(
      'header a, nav a',
      (as, origin) => {
        const seen = new Set();
        const out = [];
        for (const a of as) {
          const text = (a.innerText || '').trim().replace(/\s+/g, ' ');
          let href = a.href;
          if (!text || text.length > 24) continue;
          try {
            const u = new URL(href);
            if (u.origin !== origin) continue;
            const path = u.pathname.replace(/\/+$/, '');
            if (!path || seen.has(path)) continue;
            seen.add(path);
            out.push({ text, href, path });
          } catch {}
        }
        return out;
      },
      origin,
    );

    return { url, origin, title, description, h1, nav: nav.slice(0, maxPages) };
  } finally {
    await browser.close();
  }
}

/** Optional LLM polish of the narration via OpenRouter. Falls back to input. */
async function llmScript(site, draft) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return draft;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You write short, warm voiceover lines for a product demo video. One sentence per scene, plain language, no hype, no emojis. Return STRICT JSON: {"intro":string,"scenes":string[],"outro":string} with scenes length matching the input.' },
          { role: 'user', content: JSON.stringify({ title: site.title, description: site.description, h1: site.h1, sceneLabels: draft.scenes.map((s) => s.label) }) },
        ],
        temperature: 0.5,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) return draft;
    const j = await res.json();
    const parsed = JSON.parse(j.choices[0].message.content);
    if (parsed?.scenes?.length === draft.scenes.length) {
      return {
        intro: parsed.intro || draft.intro,
        outro: parsed.outro || draft.outro,
        scenes: draft.scenes.map((s, i) => ({ ...s, narration: parsed.scenes[i] || s.narration })),
      };
    }
  } catch {}
  return draft;
}

/** Build a full pipeline config (scenes + cards) for an arbitrary URL. */
export async function buildAutoConfig(url, opts = {}) {
  const site = await scrapeSite(url, { maxPages: opts.maxPages ?? 4 });
  const name = site.title?.split(/[—|·\-]/)[0].trim() || new URL(url).hostname;

  // Draft narration from scraped content.
  const draft = {
    intro: `This is ${name}.`,
    outro: `That's ${name}. Take a look for yourself.`,
    scenes: [
      {
        label: 'overview',
        narration: `This is ${name}. ${site.description || site.h1 || 'Here is a quick look at what it does.'}`,
        kind: 'hero',
      },
      ...site.nav.map((n) => ({
        label: n.text,
        narration: `Here is ${n.text}.`,
        kind: 'nav',
        nav: n,
      })),
    ],
  };

  const script = await llmScript(site, draft);

  // Turn the script into pipeline scenes (narration + Playwright action).
  const scenes = script.scenes.map((s, i) => ({
    id: s.kind === 'hero' ? 'overview' : `nav-${i}`,
    title: s.label,
    priority: s.kind === 'hero' ? 95 : 60,
    narration: s.narration,
    action: async (page) => {
      await dismissBanner(page);
      if (s.kind === 'nav' && s.nav) {
        try {
          await page.goto(s.nav.href, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await dismissBanner(page);
          await page.waitForTimeout(700);
        } catch {}
      }
      await smoothScrollTo(page, 350, 1100);
      await page.waitForTimeout(300);
      await smoothScrollTo(page, 750, 1100);
    },
  }));

  return {
    name,
    url,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    mode: opts.mode || 'zoom',
    subtitles: opts.subtitles || 'sidecar',
    logo: 'assets/logo-6x7.png',
    logoOpacity: 0.85,
    tts: { backend: opts.tts || 'edge', voice: opts.voice || 'en-US-AvaMultilingualNeural' },
    video: { crf: 17, preset: 'slow', fps: 30, zoom: 0.14 },
    intro: { dur: 2.6, bg: '0x0A0A14', title: name, subtitle: site.description?.slice(0, 60) || '' },
    outro: { dur: 3.0, bg: '0x0A0A14', title: name, subtitle: 'Built with 6x7  -  demo.6x7.gr' },
    scenes,
    _site: site,
  };
}
