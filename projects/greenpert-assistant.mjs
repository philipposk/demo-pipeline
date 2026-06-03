// Product-demo (two-voice) config for the Greenpert page assistant.
//
// A male "user" voice asks; a female "assistant" voice answers — while the REAL
// on-page assistant widget performs each action live (it types the user's request
// into the widget and the grounded assistant runs Greenpert's actual simulator).
// Nothing is faked: the numbers on screen come from the real breeding engine.
//
// Render:
//   DEMO_URL=https://greenpert.6x7.gr node pipeline.mjs greenpert-assistant --mode=zoom
//   (the target must have ANTHROPIC_API_KEY configured so the live assistant can answer)

const URL = process.env.DEMO_URL || 'http://localhost:3000';

// Open the panel only if it's currently closed (clicking the launcher toggles it).
async function ensureOpen(page) {
  const open = await page
    .evaluate(() => !!document.querySelector('#page-assistant-root')?.shadowRoot?.querySelector('.panel.open'))
    .catch(() => false);
  if (!open) await page.locator('.launcher').click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(400);
}

// Send a message into the REAL widget, then wait for it to finish its grounded tool
// round and render the answer.
async function ask(page, text, waitMs = 9000) {
  await ensureOpen(page);
  const input = page.getByPlaceholder(/Ask or tell me/i);
  await input.click();
  await input.fill(text);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(waitMs); // LLM + capability execution + render
}

async function dismissAgeGate(page) {
  await page.getByRole('button', { name: /21 or older/i }).click({ timeout: 3000 }).catch(() => {});
}

export default {
  name: 'Greenpert Page Assistant — live product demo',
  url: URL,
  viewport: { width: 1440, height: 900 },
  mode: 'zoom',
  tts: { backend: 'edge' },
  // Two voices: male user, female assistant.
  voices: {
    user: { backend: 'edge', voice: 'en-US-AndrewMultilingualNeural' },
    assistant: { backend: 'edge', voice: 'en-US-AvaMultilingualNeural' },
  },
  scenes: [
    {
      id: 'intro',
      title: 'Meet your page assistant',
      dialogue: [
        { role: 'assistant', text: "Hi! I live on your Greenpert site. I can read the page and actually run things for you — just ask." },
      ],
      action: async (page) => {
        await dismissAgeGate(page);
        await ensureOpen(page);
        await page.waitForTimeout(2500);
      },
    },
    {
      id: 'simulate',
      title: 'Simulate a high-yield cross',
      dialogue: [
        { role: 'user', text: "Simulate a high-yield cross of Sour Diesel and Amnesia Haze, and tell me the predicted plant height." },
        { role: 'assistant', text: "Running it through Greenpert's simulator now… here's the predicted yield and the height range." },
      ],
      action: async (page) => {
        await ask(page, 'Simulate a high-yield cross of Sour Diesel and Amnesia Haze, and tell me the predicted plant height.');
      },
    },
    {
      id: 'best',
      title: 'Propose the best pairing',
      dialogue: [
        { role: 'user', text: "And what's the best high-yield pairing among Sour Diesel, Amnesia Haze, Hindu Kush and Northern Lights?" },
        { role: 'assistant', text: "I compared every pairing for yield. Here are the top picks, ranked." },
      ],
      action: async (page) => {
        await ask(page, "What's the best high-yield pairing among Sour Diesel, Amnesia Haze, Hindu Kush and Northern Lights?");
      },
    },
    {
      id: 'height-rule',
      title: 'Too tall — rerun with a rule',
      dialogue: [
        { role: 'user', text: "That's too tall for my indoor tent. Keep Sour Diesel, but pick a shorter, more indica second parent and run it again." },
        { role: 'assistant', text: "Good call. Swapping in a compact indica and re-running — this one stays well under two metres." },
      ],
      action: async (page) => {
        await ask(page, "That's too tall for my indoor tent. Keep Sour Diesel but pick a shorter, more indica second parent (like Hindu Kush) and simulate it again, with the predicted height.", 11000);
      },
    },
    {
      id: 'outro',
      title: 'Always there, bottom-right',
      dialogue: [
        { role: 'assistant', text: "That's it — real answers from your own app, by voice. I'll be right here whenever you need me." },
      ],
      action: async (page) => {
        await page.waitForTimeout(2500);
      },
    },
  ],
};
