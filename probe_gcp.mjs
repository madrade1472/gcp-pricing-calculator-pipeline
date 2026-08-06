// Sonda inicial: mapear a UI do Google Cloud Pricing Calculator e checar se o Share é anônimo.
import { chromium } from 'playwright';
import fs from 'fs';

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{width:1440,height:1600} });
const log=(...a)=>console.log(...a);

async function dc(){
  for(const re of [/^Accept all$/i,/Accept all/i,/^Aceitar tudo$/i,/I agree/i]){
    const b=page.getByRole('button',{name:re}).first();
    if(await b.count()&&await b.isVisible().catch(()=>0)){ await b.click().catch(()=>{}); await page.waitForTimeout(600); }
  }
}

try{
  await page.goto('https://cloud.google.com/products/calculator',{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForTimeout(6000);
  await dc();
  await page.screenshot({path:'probe-01-home.png',fullPage:false});
  log('URL:',page.url());
  log('TITLE:',await page.title());

  const body=await page.locator('body').innerText().catch(()=>'');
  fs.writeFileSync('probe-01-body.txt', body);
  log('--- primeiros 1500 chars ---');
  log(body.slice(0,1500));

  const btns=await page.getByRole('button').evaluateAll(els=>els.map(e=>(e.innerText||e.getAttribute('aria-label')||'').trim()).filter(Boolean).slice(0,80));
  log('--- BOTOES ---'); log(JSON.stringify(btns,null,1));

  const links=await page.locator('a').evaluateAll(els=>els.map(e=>(e.innerText||'').trim()).filter(Boolean).slice(0,60));
  log('--- LINKS ---'); log(JSON.stringify(links.slice(0,40)));
}catch(e){ log('ERRO:',String(e).split('\n')[0]); }
finally{ await browser.close(); }
