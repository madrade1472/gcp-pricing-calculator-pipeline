// Sonda 9: o BigQuery aceita mesmo "Baseline slots" acima do teto de autoscale?
// Suspeita: preencher Baseline slots re-renderiza e o valor volta ao padrão, ou fica preso ao
// "Maximum slots"/"Slot commitments".
import { abrirCalculadora, addProduto, fillVerify, setSelect, setRegiao, custoEstavel } from './gcp_lib.mjs';
const log=(...a)=>console.log(...a);
const { browser, page } = await abrirCalculadora();

const estado = async (tag)=>{
  const v = await page.evaluate(()=>{
    const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};
    const nome=e=>{ const al=e.getAttribute('aria-label'); if(al) return al;
      const ids=e.getAttribute('aria-labelledby');
      return ids?ids.split(' ').map(x=>document.getElementById(x)?.innerText||'').join(' ').replace(/\s+/g,' ').trim():''; };
    return [...document.querySelectorAll('input:not([type=range])')].filter(vis)
      .map(e=>`${nome(e)}=${e.value}`).filter(s=>!/^Rename/.test(s));
  });
  log(`   [${tag}]`, JSON.stringify(v));
};

try{
  await addProduto(page,'BigQuery',log);
  await estado('inicial');

  await setRegiao(page, /S.o Paulo \(southamerica-east1\)/i, log);
  await estado('pos-regiao');

  // quais opções existem em Maximum slots?
  const c=page.getByRole('combobox',{name:/^Maximum slots$/}).locator('visible=true').first();
  await c.click(); await page.waitForTimeout(1200);
  const opts=await page.getByRole('option').locator('visible=true').evaluateAll(e=>e.map(x=>(x.innerText||'').replace(/\n/g,' ')));
  log('   opções Maximum slots:', JSON.stringify(opts));
  await page.keyboard.press('Escape'); await page.waitForTimeout(800);

  await fillVerify(page,'Baseline slots',200,log);
  await estado('pos-baseline-200');
  log('   custo =', await custoEstavel(page));

  await fillVerify(page,'Active logical storage',50,log);
  await estado('pos-storage-50');
  log('   custo =', await custoEstavel(page));
}catch(e){ log('ERRO:',String(e).split('\n')[0]); }
finally{ await browser.close(); }
