// llm-free-rotator demo config — landing-page + live-playground walkthrough, ~90s.
// Run target site first:
//   cd "../llm-rotator-site" && npm run dev   (needs a provider key in .env.local for the playground scene)
// Then:
//   node pipeline.mjs llm-rotator               (default backend: kokoro, free/local)

const url = 'http://localhost:3000';

/** Smooth-scroll an element into view by selector/text. */
async function scrollToText(page, text, durationMs = 1000) {
  await page.evaluate(
    ({ text, durationMs }) => {
      const el = [...document.querySelectorAll('h1,h2,section')].find((n) =>
        n.textContent && n.textContent.includes(text),
      );
      if (!el) return;
      const targetY = el.getBoundingClientRect().top + window.scrollY - 80;
      return new Promise((resolve) => {
        const startY = window.scrollY;
        const delta = targetY - startY;
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
    { text, durationMs },
  );
}

export default {
  name: 'llm-free-rotator',
  url,
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  // Default TTS — override via CLI: --tts=openai|kokoro|say
  tts: { backend: 'kokoro', voice: 'af_bella', rate: 175 },
  video: { crf: 17, preset: 'slow' },
  scenes: [
    {
      narration:
        "Free AI services cap how often you can use each model. A long job can hit that limit and just stop. llm-free-rotator fixes that.",
      action: async (page) => {
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(800);
      },
    },
    {
      narration:
        "It's a small Python package. One pip install, and you're ready to go. It works with three free services: OpenRouter, Groq, and NVIDIA.",
      action: async (page) => {
        await page.waitForTimeout(1200);
      },
    },
    {
      narration:
        "Here's the idea, live. You type a prompt, pick a free provider, and hit run. No key needed here.",
      action: async (page) => {
        await scrollToText(page, 'Try it live', 1000);
        await page.waitForTimeout(700);
        const box = page.locator('textarea').first();
        await box.click();
        await box.fill('');
        await box.type('In one short sentence, explain rate limiting to a five-year-old.', { delay: 30 });
        await page.waitForTimeout(500);
      },
    },
    {
      narration:
        "If the first free model is out of usage, it automatically rotates to the next one, and the next, until one of them answers. You never lift a finger.",
      action: async (page) => {
        await page.getByRole('button', { name: /^Run$/ }).click();
        // Wait for the answer, but cap under this scene's audio budget so the
        // narration track stays in sync (recorder extends to action length).
        await page
          .waitForFunction(() => document.body.innerText.includes('answered by'), {
            timeout: 9000,
          })
          .catch(() => {});
      },
    },
    {
      narration:
        "And it tells you exactly which model replied, and how many it skipped past on the way. No more guessing why a long job stalled.",
      action: async (page) => {
        // ensure the answer is on screen even if it landed late
        await page
          .waitForFunction(() => document.body.innerText.includes('answered by'), {
            timeout: 8000,
          })
          .catch(() => {});
        await page.waitForTimeout(1200);
      },
    },
    {
      narration:
        "In your own code it's three lines. Bring your own free key — it never spends paid credit. There's a command-line tool too.",
      action: async (page) => {
        await scrollToText(page, 'Use it in your code', 1000);
        await page.waitForTimeout(2200);
      },
    },
    {
      narration:
        "That's llm-free-rotator. Install it from PyPI, star it on GitHub, and keep your free AI models working.",
      action: async (page) => {
        await scrollToText(page, 'Works with three free services', 1000);
        await page.waitForTimeout(1500);
      },
    },
  ],
};
