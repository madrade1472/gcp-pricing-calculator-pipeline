// Sonda 8: abre um link ?dl= e inspeciona os valores REAIS de cada serviço da estimativa.
// Uso: node probe_gcp8.mjs "<url>"
import { chromium } from 'playwright';

const URL = process.argv[2];
if(!URL){ console.error('uso: node probe_gcp8.mjs "<url>"'); process.exit(1); }
const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{width:1440,height:1600} });
const log=(...a)=>console.log(...a);

try{
  await page.goto(URL,{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForTimeout(10000);
  for(const re of [/^Dismiss$/i,/^Accept all$/i]){
    const b=page.getByRole('button',{name:re}).locator('visible=true').first();
    if(await b.count()) await b.click().catch(()=>{});
  }
  await page.waitForTimeout(1500);

  // abre cada item do painel e lê os campos
  const itens = page.locator('[role="listitem"], .cost-item, [class*="estimate-item"]');
  log('itens no painel:', await itens.count());

  const cards = await page.getByRole('button',{name:/Edit/i}).locator('visible=true').count();
  log('botões Edit visíveis:', cards);

  for(let i=0;i<cards;i++){
    const b = page.getByRole('button',{name:/Edit/i}).locator('visible=true').nth(i);
    await b.click().catch(()=>{});
    await page.waitForTimeout(4000);
    const estado = await page.evaluate(()=>{
      const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};
      const nome=e=>{ const al=e.getAttribute('aria-label'); if(al) return al.replace(/\n/g,' ');
        const ids=e.getAttribute('aria-labelledby');
        return ids?ids.split(' ').map(x=>document.getElementById(x)?.innerText||'').join(' ').replace(/\s+/g,' ').trim():''; };
      const campos=[...document.querySelectorAll('input:not([type=range]),textarea')].filter(vis)
        .map(e=>`${nome(e)} = ${e.value}`);
      const drops=[...document.querySelectorAll('[role="combobox"]')].filter(vis)
        .map(e=>{const l=nome(e).split(' ')[0]; const t=(e.innerText||'').split('\n').filter(Boolean).pop(); return `${l}: ${t}`;})
        .filter(s=>!/English/.test(s));
      const h=document.querySelector('h1,h2')?.innerText||'';
      return { titulo:h.replace(/\n/g,' '), campos, drops };
    });
    log(`\n--- serviço ${i+1}: ${estado.titulo}`);
    log('  campos:', JSON.stringify(estado.campos));
    log('  drops :', JSON.stringify(estado.drops));
  }
}catch(e){ log('ERRO:',String(e).split('\n')[0]); }
finally{ await browser.close(); }
