import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const routes = ['/', '/strains', '/breed', '/simulator', '/discover', '/learn', '/identify', '/spots', '/community'];
for (const r of routes) {
  try {
    await page.goto('http://localhost:3000' + r, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1800);
    const title = await page.title();
    const headings = await page.locator('h1,h2').allInnerTexts();
    const buttons = await page.getByRole('button').allInnerTexts();
    const links = await page.getByRole('link').allInnerTexts();
    console.log(`\n=== ${r} ===`);
    console.log(`TITLE: ${title}`);
    console.log(`H: ${headings.slice(0,10).join(' | ')}`);
    console.log(`BTN: ${buttons.slice(0,20).join(' | ')}`);
    console.log(`LINK: ${links.slice(0,20).join(' | ')}`);
    await page.screenshot({ path: `tmp/gp-${(r.replace(/\//g,'_') || 'home')}.png`, fullPage: false });
  } catch (e) {
    console.log(`\n=== ${r} === ERROR: ${e.message}`);
  }
}
await browser.close();
