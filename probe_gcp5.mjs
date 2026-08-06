// Sonda 5: multi-serviço numa mesma estimativa (Compute Engine + Cloud Storage + BigQuery)
// e captura do link final. Valida o padrão que o build_<cliente>.mjs vai usar.
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
async function addProduct(name){
  const add=page.getByRole('button',{name:/Add to estimate/i}).locator('visible=true').first();
  await add.scrollIntoViewIfNeeded().catch(()=>{});
  await add.click({timeout:20000});
  await page.waitForTimeout(3000);
  const s=page.locator('input[placeholder*="Search by product"]').locator('visible=true').first();
  await s.fill(''); await s.fill(name); await page.waitForTimeout(2500);
  const card=page.getByText(name,{exact:true}).locator('visible=true').first();
  await card.click({timeout:20000});
  await page.waitForTimeout(6000); await dc();
  log(`  + ${name} adicionado`);
}
function readCost(t){ const m=t.match(/ESTIMATED COST\s*\n?\s*([^\n]+)/i); return m?m[1].trim():'?'; }
async function costSettled(){
  let last='?';
  for(let i=0;i<10;i++){
    await page.waitForTimeout(900);
    const c=readCost(await page.locator('body').innerText().catch(()=>''));
    if(c!=='?'&&c===last) return c;
    last=c;
  }
  return last;
}
async function mapForm(tag){
  const f=await page.evaluate(()=>{
    const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};
    const lbl=e=>{ const al=e.getAttribute('aria-label'); if(al) return al;
      const id=e.getAttribute('aria-labelledby');
      if(id){const t=id.split(' ').map(x=>document.getElementById(x)?.innerText||'').join(' ').trim(); if(t) return t;}
      if(e.id){const l=document.querySelector(`label[for="${CSS.escape(e.id)}"]`); if(l) return l.innerText.trim();}
      return (e.closest('label')?.innerText||'').trim(); };
    const o={inputs:[],selects:[]};
    document.querySelectorAll('input,textarea').forEach(e=>{ if(!vis(e)||e.type==='checkbox'||e.type==='radio'||e.type==='range')return;
      o.inputs.push({label:lbl(e).replace(/\n/g,' '),type:e.type,value:e.value}); });
    document.querySelectorAll('[role="combobox"],select').forEach(e=>{ if(!vis(e))return;
      const t=(e.innerText||e.value||'').trim().replace(/\n/g,' ');
      o.selects.push({label:lbl(e).replace(/\n/g,' '),text:t}); });
    return o;
  });
  fs.writeFileSync(`probe-form-${tag}.json`,JSON.stringify(f,null,1));
  log(`  form ${tag}:`, JSON.stringify(f.inputs.map(x=>x.label)));
  log(`  selects ${tag}:`, JSON.stringify(f.selects.map(x=>x.label).filter(x=>!/English/.test(x))));
}

try{
  await page.goto('https://cloud.google.com/products/calculator',{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForTimeout(6000); await dc();

  await addProduct('Compute Engine');
  log('  custo =', await costSettled());

  await addProduct('Cloud Storage');
  await mapForm('cloud-storage');
  log('  custo =', await costSettled());

  await addProduct('BigQuery');
  await mapForm('bigquery');
  log('  custo total =', await costSettled());

  await page.screenshot({path:'probe-07-multi.png',fullPage:true});
  const body=await page.locator('body').innerText();
  fs.writeFileSync('probe-07-multi.txt',body);
  // painel lateral com os itens
  log('\n=== painel de custo ===');
  const panel=body.match(/Cost details[\s\S]{0,900}/);
  log(panel?panel[0]:'?');
  log('\nLINK FINAL:', page.url());
}catch(e){ log('ERRO:',String(e).split('\n')[0]); }
finally{ await browser.close(); }
