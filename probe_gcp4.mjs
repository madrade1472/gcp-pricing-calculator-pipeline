// Sonda 4: round-trip. Abrir a URL ?dl=... em contexto NOVO (sem cookies) e conferir se o estimate volta.
import { chromium } from 'playwright';

const URL='https://cloud.google.com/products/calculator?dl=CjhDaVJqTTJNMk4yVmlNaTFqTjJGbUxUUm1PVE10WVRGbE5pMHhPV1psWW1Ka09UWTBZVEFRQVE9PRAIGiQ0MkExRUFEMC1FM0RELTQ4RTAtQjRERC02NDQ0NzE0MUMzMUE';
const browser = await chromium.launch({ headless:true });
const ctx = await browser.newContext({ viewport:{width:1440,height:1400} }); // contexto limpo, sem storage
const page = await ctx.newPage();
const log=(...a)=>console.log(...a);

try{
  await page.goto(URL,{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForTimeout(9000);
  await page.screenshot({path:'probe-06-roundtrip.png'});
  const b=await page.locator('body').innerText();
  log('--- trecho ---');
  log(b.slice(0,700));
  log('\nTEM Compute Engine?', /Compute Engine/.test(b));
  log('TEM $67.01?', /67\.01/.test(b));
  const m=b.match(/ESTIMATED COST\s*\n?\s*([^\n]+)/i);
  log('ESTIMATED COST =', m?m[1]:'?');
}catch(e){ log('ERRO:',String(e).split('\n')[0]); }
finally{ await browser.close(); }
