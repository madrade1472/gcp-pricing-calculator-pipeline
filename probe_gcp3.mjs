// Sonda 3: adicionar Compute Engine, mapear o formulário, ler o custo e testar o Share anônimo.
import { chromium } from 'playwright';
import fs from 'fs';

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{width:1440,height:1600} });
const log=(...a)=>console.log(...a);

async function dc(){
  for(const re of [/^Accept all$/i,/^Dismiss$/i]){
    const b=page.getByRole('button',{name:re}).first();
    if(await b.count()&&await b.isVisible().catch(()=>0)){ await b.click().catch(()=>{}); await page.waitForTimeout(500); }
  }
}
async function mapForm(tag){
  const fields=await page.evaluate(()=>{
    const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};
    const lbl=e=>{
      const al=e.getAttribute('aria-label'); if(al) return al;
      const id=e.getAttribute('aria-labelledby');
      if(id){ const t=id.split(' ').map(x=>document.getElementById(x)?.innerText||'').join(' ').trim(); if(t) return t; }
      if(e.id){ const l=document.querySelector(`label[for="${CSS.escape(e.id)}"]`); if(l) return l.innerText.trim(); }
      return (e.closest('label')?.innerText||'').trim();
    };
    const out={inputs:[],selects:[],checks:[]};
    document.querySelectorAll('input,textarea').forEach(e=>{ if(!vis(e))return;
      const rec={label:lbl(e),type:e.type,value:e.value,ph:e.placeholder||''};
      if(e.type==='checkbox'||e.type==='radio') out.checks.push({...rec,checked:e.checked}); else out.inputs.push(rec); });
    document.querySelectorAll('[role="combobox"],select').forEach(e=>{ if(!vis(e))return;
      out.selects.push({label:lbl(e),text:(e.innerText||e.value||'').trim().replace(/\n/g,' ')}); });
    return out;
  });
  fs.writeFileSync(`probe-form-${tag}.json`, JSON.stringify(fields,null,1));
  log(`--- FORM ${tag}: ${fields.inputs.length} inputs, ${fields.selects.length} selects, ${fields.checks.length} checks`);
  log(JSON.stringify(fields,null,1).slice(0,4000));
}
function readCost(t){ const m=t.match(/ESTIMATED COST\s*\n?\s*([^\n]+)/i); return m?m[1].trim():'?'; }

try{
  await page.goto('https://cloud.google.com/products/calculator',{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForTimeout(6000); await dc();

  await page.getByRole('button',{name:/Add to estimate/i}).first().click();
  await page.waitForTimeout(3000);
  await page.locator('input[placeholder*="Search by product"]').first().fill('Compute Engine');
  await page.waitForTimeout(2500);

  // o card do produto: clicar no título VISÍVEL (existem cópias ocultas no DOM)
  const card=page.getByText('Compute Engine',{exact:true}).locator('visible=true').first();
  log('cards visiveis:', await page.getByText('Compute Engine',{exact:true}).locator('visible=true').count());
  await card.click({timeout:20000});
  await page.waitForTimeout(6000); await dc();
  await page.screenshot({path:'probe-04-ce-form.png',fullPage:true});
  log('URL apos add:',page.url());
  await mapForm('compute-engine');

  const body=await page.locator('body').innerText();
  fs.writeFileSync('probe-04-body.txt',body);
  log('CUSTO:',readCost(body));

  // ---- Share anônimo ----
  log('\n=== testando SHARE ===');
  const share=page.getByRole('button',{name:/Share/i}).first();
  await share.scrollIntoViewIfNeeded().catch(()=>{});
  await share.click({timeout:15000});
  await page.waitForTimeout(4000);
  await page.screenshot({path:'probe-05-share.png',fullPage:false});
  const sBody=await page.locator('body').innerText();
  fs.writeFileSync('probe-05-share.txt',sBody);
  log('--- dialogo share ---');
  log(sBody.slice(0,1200));
  const vals=await page.locator('input:visible, textarea:visible').evaluateAll(els=>els.map(e=>e.value).filter(v=>v&&v.length>20));
  log('VALORES DE INPUT (possíveis URLs):',JSON.stringify(vals,null,1));
  const btns=await page.getByRole('button').evaluateAll(els=>els.map(e=>(e.innerText||'').trim().replace(/\n/g,' ')).filter(Boolean).slice(0,30));
  log('BOTOES no dialogo:',JSON.stringify(btns));
  log('URL final:',page.url());
}catch(e){ log('ERRO:',String(e)); }
finally{ await browser.close(); }
