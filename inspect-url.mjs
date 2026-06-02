import { chromium } from 'playwright';
const base = process.argv[2];
const routes = (process.argv[3]||'/').split(',');
const b = await chromium.launch({headless:true});
const ctx = await b.newContext({viewport:{width:1440,height:900}});
const p = await ctx.newPage();
for (const r of routes){
  try{
    await p.goto(base+r,{waitUntil:'domcontentloaded',timeout:20000});
    await p.waitForTimeout(2000);
    console.log(`\n=== ${r} ===`);
    console.log('TITLE:', await p.title());
    console.log('H:', (await p.locator('h1,h2,h3').allInnerTexts()).slice(0,10).join(' | '));
    console.log('BTN:', (await p.getByRole('button').allInnerTexts()).slice(0,20).join(' | '));
    console.log('LINK:', (await p.getByRole('link').allInnerTexts()).slice(0,20).join(' | '));
    await p.screenshot({path:`tmp/daisy-${(r.replace(/\//g,'_')||'home')}.png`});
  }catch(e){console.log(`\n=== ${r} === ERR: ${e.message}`);}
}
await b.close();
