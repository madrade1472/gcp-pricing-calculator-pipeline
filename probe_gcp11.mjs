// Sonda 11: quais combinações de CPU/memória o Managed Airflow (Gen 2) aceita?
// Suspeita: memória fora da razão permitida pelo mCPU invalida o item e ele passa a custar $0.
import { abrirCalculadora, addProduto, fillVerify, setSelect, setRegiao, custoEstavel } from './gcp_lib.mjs';
const log=(...a)=>console.log(...a);
const { browser, page } = await abrirCalculadora();

const erros = async ()=> await page.evaluate(()=>{
  const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};
  return [...document.querySelectorAll('[role="alert"],[aria-live],.error,[class*="error"]')].filter(vis)
    .map(e=>(e.innerText||'').trim()).filter(Boolean).slice(0,6);
});

try{
  await addProduto(page,'Managed Service for Apache Airflow',log);
  await setRegiao(page, /S.o Paulo \(southamerica-east1\)/i, log);
  log('A) padrões em SP           =', await custoEstavel(page));

  await fillVerify(page,'Average number of Airflow Workers',6,log);
  log('B) 6 workers, mem padrão   =', await custoEstavel(page), JSON.stringify(await erros()));

  await fillVerify(page,'Memory per Airflow Worker',4,log);
  log('C) 6 workers, mem 4 GiB    =', await custoEstavel(page), JSON.stringify(await erros()));

  // subir o mCPU do worker para acompanhar a memória
  const opts = await (async()=>{
    const c=page.getByRole('combobox',{name:/1000 mCPU per Airflow Worker/i}).locator('visible=true').first();
    if(!(await c.count())) return ['(combo não encontrado)'];
    await c.click(); await page.waitForTimeout(1200);
    const o=await page.getByRole('option').locator('visible=true').evaluateAll(e=>e.map(x=>(x.innerText||'').trim()));
    await page.keyboard.press('Escape'); await page.waitForTimeout(600);
    return o;
  })();
  log('   opções de mCPU por worker:', JSON.stringify(opts));

  await setSelect(page, /1000 mCPU per Airflow Worker/i, /^1$/, log);
  log('D) 6 workers, mem 4, cpu 1 =', await custoEstavel(page), JSON.stringify(await erros()));

  await fillVerify(page,'Storage per Airflow Worker',10,log);
  log('E) + storage 10 GiB        =', await custoEstavel(page), JSON.stringify(await erros()));

  await page.screenshot({path:'probe-11-composer.png',fullPage:true});
}catch(e){ log('ERRO:',String(e).split('\n')[0]); }
finally{ await browser.close(); }
