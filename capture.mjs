import { chromium } from 'playwright';
const OUT = 'demo-shots';
import fs from 'fs';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
async function shot(name, url, action) {
  console.log('SHOT', name, url);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);
  if (action) await action(page).catch(e => console.log('action warn', name, e.message));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('saved', name);
}
await shot('01-hero', 'http://localhost:3000/');
await shot('02-builder', 'http://localhost:3000/builder', async (p) => {
  const btn = p.getByRole('button', { name: /Run$/ }).first();
  if (await btn.count()) await btn.click().catch(()=>{});
  await p.waitForTimeout(6000);
});
await shot('03-backtest', 'http://localhost:3000/backtest', async (p) => {
  const btn = p.getByRole('button', { name: /Run replay/ }).first();
  if (await btn.count()) await btn.click().catch(()=>{});
  await p.waitForTimeout(12000);
});
await shot('04-terminal', 'http://localhost:3000/terminal');
await shot('05-marketplace', 'http://localhost:3000/marketplace');
await browser.close();
console.log('DONE');
