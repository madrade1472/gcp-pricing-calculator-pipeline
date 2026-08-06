// Sonda 2: fluxo "Add to estimate" -> escolher produto -> ver formulário -> testar Share anônimo.
import { chromium } from 'playwright';
import fs from 'fs';

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{width:1440,height:1600} });
const log=(...a)=>console.log(...a);
const dump=(n,o)=>{ fs.writeFileSync(n, typeof o==='string'?o:JSON.stringify(o,null,1)); };

async function dc(){
  for(const re of [/^Accept all$/i,/^Dismiss$/i]){
    const b=page.getByRole('button',{name:re}).first();
    if(await b.count()&&await b.isVisible().catch(()=>0)){ await b.click().catch(()=>{}); await page.waitForTimeout(500); }
  }
}

try{
  await page.goto('https://cloud.google.com/products/calculator',{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForTimeout(6000); await dc();

  // 1) abrir o catálogo de produtos
  const add=page.getByRole('button',{name:/Add to estimate/i}).first();
  await add.click(); await page.waitForTimeout(3500);
  await page.screenshot({path:'probe-02-catalog.png'});
  const cat=await page.locator('body').innerText();
  dump('probe-02-catalog.txt',cat);
  log('=== catálogo (trecho) ==='); log(cat.slice(0,900));

  // que campos de busca existem?
  const inputs=await page.locator('input:visible').evaluateAll(els=>els.map(e=>({
    ph:e.placeholder||'', al:e.getAttribute('aria-label')||'', type:e.type, id:e.id })));
  log('=== INPUTS visíveis ==='); log(JSON.stringify(inputs,null,1));

  // 2) buscar Compute Engine
  const search=page.locator('input:visible').first();
  await search.fill('Compute Engine'); await page.waitForTimeout(2500);
  await page.screenshot({path:'probe-03-search.png'});
  const opts=await page.locator('[role="option"], [role="listitem"], button:visible').evaluateAll(
    els=>els.map(e=>(e.innerText||'').trim().replace(/\n+/g,' | ')).filter(Boolean).slice(0,40));
  log('=== OPÇÕES pós busca ==='); log(JSON.stringify(opts,null,1));
}catch(e){ log('ERRO:',String(e)); }
finally{ await browser.close(); }
