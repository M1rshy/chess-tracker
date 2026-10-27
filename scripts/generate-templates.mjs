import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('model-data',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:512,height:512},deviceScaleFactor:1});
for(let theme=0;theme<3;theme++){
  await page.goto(`http://127.0.0.1:5173/scripts/templates.html?theme=${theme}`);
  await page.locator('[data-square="a8"]').waitFor();
  await page.screenshot({path:`model-data/theme-${theme}.png`});
}
await browser.close();
console.log('Generated 3 × 26 labeled templates from the actual piece renderer.');
