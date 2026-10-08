// TodoMVC demo — a short click-through of the public TodoMVC React example.
// Records against the LIVE site (no local server, no login). Used as the
// before/after test for the render modes:
//   node pipeline.mjs todomvc --mode=zoom --subs=burn     # ffmpeg cinematic
//   node pipeline.mjs todomvc --mode=studio               # Remotion studio

const url = 'https://todomvc.com/examples/react/dist/';

async function addTodo(page, text) {
  await page.keyboard.type(text, { delay: 55 });
  await page.waitForTimeout(250);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(450);
}

export default {
  name: 'TodoMVC',
  url,
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 2,

  mode: 'zoom',
  subtitles: 'sidecar',
  logo: 'assets/logo-6x7.png',
  logoOpacity: 0.85,

  tts: { backend: 'edge', voice: 'en-US-AvaMultilingualNeural' },
  video: { crf: 17, preset: 'slow', fps: 30, zoom: 0.16 },

  intro: { dur: 2.6, bg: '0x0A0A14', title: 'TodoMVC', subtitle: 'A tiny to-do app, start to finish' },
  outro: { dur: 3.0, bg: '0x0A0A14', title: 'TodoMVC', subtitle: 'todomvc.com' },

  scenes: [
    {
      id: 'open',
      cue: 'Click', // studio mode: the click lands on this spoken word
      narration: 'This is TodoMVC, a tiny to-do app. Click the box at the top to start a list.',
      action: async (page) => {
        await page.waitForTimeout(600);
        await page.locator('.new-todo').click();
      },
    },
    {
      id: 'add',
      narration: 'Type a task and press Enter, and it lands on your list.',
      action: async (page) => {
        await addTodo(page, 'Buy oat milk');
        await addTodo(page, 'Book the dentist');
        await addTodo(page, 'Ship the demo video');
      },
    },
    {
      id: 'done',
      cue: 'Tick',
      narration: 'Finished one? Tick the circle and it gets crossed off.',
      action: async (page) => {
        await page.waitForTimeout(700);
        await page.locator('.todo-list li').nth(1).locator('.toggle').click();
      },
    },
    {
      id: 'active',
      narration: 'The Active filter shows only what is still left to do.',
      action: async (page) => {
        await page.waitForTimeout(500);
        await page.getByRole('link', { name: 'Active' }).click();
      },
    },
    {
      id: 'completed',
      narration: 'And Completed shows everything you have already finished.',
      action: async (page) => {
        await page.waitForTimeout(500);
        await page.getByRole('link', { name: 'Completed' }).click();
      },
    },
    {
      id: 'clear',
      narration: 'Clear completed tidies up, so only the open tasks remain.',
      action: async (page) => {
        await page.getByRole('link', { name: 'All' }).click();
        await page.waitForTimeout(900);
        await page.getByRole('button', { name: /Clear completed/i }).click();
      },
    },
  ],
};
