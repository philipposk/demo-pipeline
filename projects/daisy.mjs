// Daisy demo — narrated scroll tour of the daisy.6x7.gr landing page.
// Records against the LIVE site (no local server needed).
//   node pipeline.mjs daisy --mode=zoom --tts=edge

const url = 'https://daisy.6x7.gr';

/** Smooth-scroll so a given element sits ~1/4 from the top. */
async function scrollToText(page, text, durationMs = 1300) {
  const loc = page.getByText(text, { exact: false }).first();
  let targetY = 0;
  try {
    const box = await loc.boundingBox();
    if (box) targetY = Math.max(0, (await page.evaluate(() => window.scrollY)) + box.y - 180);
  } catch {}
  await page.evaluate(
    ({ targetY, durationMs }) =>
      new Promise((resolve) => {
        const startY = window.scrollY;
        const delta = targetY - startY;
        const t0 = performance.now();
        const tick = (now) => {
          const t = Math.min(1, (now - t0) / durationMs);
          const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          window.scrollTo(0, startY + delta * e);
          if (t < 1) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      }),
    { targetY, durationMs }
  );
}

export default {
  name: 'Daisy',
  url,
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 2,

  mode: 'zoom',
  subtitles: 'sidecar',
  logo: 'assets/logo-6x7.png',
  logoOpacity: 0.85,

  tts: { backend: 'edge', voice: 'en-US-AvaMultilingualNeural', rate: 175 },
  video: { crf: 17, preset: 'slow', fps: 30, zoom: 0.14 },

  intro: {
    dur: 2.8,
    bg: '0x0A0A0F',
    title: 'Daisy',
    subtitle: 'A polite voice assistant for your Mac',
  },
  outro: {
    dur: 3.2,
    bg: '0x0A0A0F',
    title: 'Daisy',
    subtitle: 'daisy.6x7.gr  -  Built with 6x7',
  },

  scenes: [
    {
      narration:
        "Meet Daisy — a polite voice assistant that lives on your Mac. You talk, she listens, and she gets things done, without nagging.",
      action: async (page) => {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(700);
      },
    },
    {
      narration:
        "Say her name and she wakes up, listens, and replies out loud. Say stop any time to cut her off.",
      action: async (page) => {
        await scrollToText(page, "Six things she's good at");
      },
    },
    {
      narration:
        "Daisy reads and updates your Apple Calendar, and drafts emails in Mail — all by voice.",
      action: async (page) => {
        await scrollToText(page, 'Calendar & Mail');
      },
    },
    {
      narration:
        "She takes notes, sets spoken reminders, and remembers your preferences between conversations.",
      action: async (page) => {
        await scrollToText(page, 'Notes & reminders');
      },
    },
    {
      narration:
        "Changed your mind? Just say undo. And because she's powered by MCP, she can drive other apps on your Mac.",
      action: async (page) => {
        await scrollToText(page, 'MCP-powered');
      },
    },
    {
      narration:
        "Two ways to get her: download for macOS, or grab the source on GitHub. Daisy — your hands-free Mac helper.",
      action: async (page) => {
        await scrollToText(page, 'Two ways to get her');
      },
    },
  ],
};
