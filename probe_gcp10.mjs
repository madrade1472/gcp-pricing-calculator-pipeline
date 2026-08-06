// Sonda 10: por que o Managed Service for Apache Airflow (Cloud Composer) sai $0.00?
import { abrirCalculadora, addProduto, fillVerify, setRegiao, custoEstavel } from './gcp_lib.mjs';
const log=(...a)=>console.log(...a);
const { browser, page } = await abrirCalculadora();

const estado = async (tag)=>{
  const v = await page.evaluate(()=>{
    const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};
    const nome=e=>{ const al=e.getAttribute('aria-label'); if(al) return al;
      const ids=e.getAttribute('aria-labelledby');
      return ids?ids.split(' ').map(x=>document.getElementById(x)?.innerText||'').join(' ').replace(/\s+/g,' ').trim():''; };
    const campos=[...document.querySelectorAll('input:not([type=range])')].filter(vis)
      .map(e=>`${nome(e)}=${e.value}`).filter(s=>!/^Rename/.test(s));
    const drops=[...document.querySelectorAll('[role="combobox"]')].filter(vis)
      .map(e=>`${nome(e).split(' ')[0]}:${(e.innerText||'').split('\n').filter(Boolean).pop()}`)
      .filter(s=>!/English/.test(s));
    return {campos,drops};
  });
  log(`   [${tag}] campos:`, JSON.stringify(v.campos));
  log(`   [${tag}] drops :`, JSON.stringify(v.drops));
};

try{
  await addProduto(page,'Managed Service for Apache Airflow',log);
  await estado('inicial');
  log('   custo com padrões =', await custoEstavel(page));

  await setRegiao(page, /S.o Paulo \(southamerica-east1\)/i, log);
  log('   custo pós região SP =', await custoEstavel(page));
  await estado('pos-regiao');

  await fillVerify(page,'Average number of Airflow Workers',6,log);
  await fillVerify(page,'Memory per Airflow Worker',4,log);
  log('   custo pós workers =', await custoEstavel(page));
  await estado('final');

  await page.screenshot({path:'probe-10-composer.png',fullPage:true});
}catch(e){ log('ERRO:',String(e).split('\n')[0]); }
finally{ await browser.close(); }
