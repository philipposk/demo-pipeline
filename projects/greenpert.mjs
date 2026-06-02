// Greenpert demo config — 10-scene click-through, ~95–105s.
// Run target app first:  cd "$(realpath ../Greenpert)" && npm run dev
// Then:  node pipeline.mjs greenpert

const url = 'http://localhost:3000';

/** Click through the persistent age-gate modal if present. */
async function dismissAgeGate(page) {
  try {
    const btn = page.getByRole('button', { name: /I am 21 or older/i });
    if (await btn.isVisible({ timeout: 1500 })) {
      await btn.click();
      await page.waitForTimeout(400);
    }
  } catch {}
}

/** Smooth-scroll a page to a target Y (pixels). */
async function smoothScroll(page, toY, durationMs = 1200) {
  await page.evaluate(
    ({ toY, durationMs }) => {
      return new Promise((resolve) => {
        const startY = window.scrollY;
        const delta = toY - startY;
        const startT = performance.now();
        function tick(now) {
          const t = Math.min(1, (now - startT) / durationMs);
          const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          window.scrollTo(0, startY + delta * ease);
          if (t < 1) requestAnimationFrame(tick);
          else resolve();
        }
        requestAnimationFrame(tick);
      });
    },
    { toY, durationMs }
  );
}

export default {
  name: 'Greenpert',
  url,
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 2,

  // Render mode: 'simple' (plain) | 'zoom' (cinematic: push-in, cursor, cards, logo)
  mode: 'zoom',
  subtitles: 'sidecar',           // 'off' | 'sidecar' | 'burn'
  logo: 'assets/logo-6x7.png',    // watermark + card logo (path relative to repo root)
  logoOpacity: 0.85,

  // Default TTS — override via CLI: --tts=edge|openai|elevenlabs|kokoro
  // edge = Microsoft neural voices, free, no key. Ava = clear female narrator.
  tts: { backend: 'edge', voice: 'en-US-AvaMultilingualNeural', rate: 175 },

  video: { crf: 17, preset: 'slow', fps: 30, zoom: 0.16 },

  intro: {
    dur: 2.8,
    bg: '0x0A0F0A',
    title: 'Greenpert',
    subtitle: 'Design the perfect strain before you plant a seed',
  },
  outro: {
    dur: 3.2,
    bg: '0x0A0F0A',
    title: 'Greenpert',
    subtitle: 'Built with 6x7  -  demo.6x7.gr',
  },

  scenes: [
    {
      narration:
        "This is Greenpert — a strain breeding simulator for cannabis growers. It predicts what you would get if you crossed two strains, before you plant a single seed.",
      action: async (page) => {
        await dismissAgeGate(page);
        await page.waitForTimeout(600);
      },
    },
    {
      narration:
        "It starts with a library of strains, each scored on potency, terpenes, effects, flowering time, and lineage.",
      action: async (page) => {
        await page.getByRole('link', { name: /^Browse 40 strains/i }).click();
        await page.waitForLoadState('domcontentloaded');
        await dismissAgeGate(page);
        await page.waitForTimeout(600);
      },
    },
    {
      narration:
        "Every strain has its own profile: THC and CBD numbers, dominant terpenes, and a short description of what to expect.",
      action: async (page) => {
        await smoothScroll(page, 500, 1500);
      },
    },
    {
      narration:
        "The core feature is the breeding simulator. You pick two parents and the app runs hundreds of virtual grows to estimate the offspring.",
      action: async (page) => {
        await page.getByRole('link', { name: /^Simulator$/i }).first().click();
        await page.waitForLoadState('domcontentloaded');
        await dismissAgeGate(page);
        await page.waitForTimeout(800);
      },
    },
    {
      narration:
        "You see predicted potency ranges, dominant traits, flowering time, and a confidence band across the simulated grows.",
      action: async (page) => {
        await smoothScroll(page, 400, 1500);
        await page.waitForTimeout(400);
        await smoothScroll(page, 800, 1500);
      },
    },
    {
      narration:
        "Save any cross you like. Without an account it stays in your browser; once you sign in, it syncs to the cloud.",
      action: async (page) => {
        await smoothScroll(page, 0, 800);
        try {
          await page.getByRole('button', { name: /Save this cross/i }).click({ timeout: 2500 });
        } catch {}
        await page.waitForTimeout(500);
      },
    },
    {
      narration:
        "Not sure which parents to pick? Set a goal — max potency, CBD-rich, fast flower — and Greenpert ranks the best pairings for you.",
      action: async (page) => {
        await page.getByRole('link', { name: /^Find best$/i }).first().click();
        await page.waitForLoadState('domcontentloaded');
        await dismissAgeGate(page);
        await page.waitForTimeout(800);
      },
    },
    {
      narration:
        "Open a goal and you get a ranked list of crosses to try, with the reasoning behind each pick.",
      action: async (page) => {
        try {
          await page.getByRole('button', { name: /^Open$/ }).first().click({ timeout: 2500 });
        } catch {}
        await page.waitForTimeout(1200);
        await smoothScroll(page, 400, 1200);
      },
    },
    {
      narration:
        "There is also a Discover page — pick a mood like relaxed or creative, and it suggests matching strains.",
      action: async (page) => {
        await page.getByRole('link', { name: /^Discover$/i }).first().click();
        await page.waitForLoadState('domcontentloaded');
        await dismissAgeGate(page);
        await page.waitForTimeout(500);
        try {
          await page.getByRole('button', { name: /^Relaxed$/i }).click({ timeout: 2000 });
        } catch {}
        await page.waitForTimeout(800);
      },
    },
    {
      narration:
        "And a Learn section with short how-to guides and articles — terpenes, indica versus sativa, rolling, and more.",
      action: async (page) => {
        await page.getByRole('link', { name: /^Learn$/i }).first().click();
        await page.waitForLoadState('domcontentloaded');
        await dismissAgeGate(page);
        await smoothScroll(page, 300, 1200);
      },
    },
    {
      narration:
        "That's Greenpert. Browse strains, breed virtually, chase a goal — all in your browser, no account needed to start.",
      action: async (page) => {
        await smoothScroll(page, 0, 1000);
        await page.waitForTimeout(600);
      },
    },
  ],
};
