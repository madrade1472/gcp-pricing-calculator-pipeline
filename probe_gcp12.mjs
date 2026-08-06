// Sonda 12: bissecção — replica a sequência EXATA do fComposerProd, lendo o custo após cada campo,
// para achar qual deles invalida o item (custo vira "?" ou para de somar).
import { abrirCalculadora, addProduto, fillVerify, setSelect, setRegiao, custoEstavel } from './gcp_lib.mjs';
const log=(...a)=>console.log(...a);
const { browser, page } = await abrirCalculadora();

async function passo(tag, fn){
  await fn();
  const c = await custoEstavel(page);
  log(`   ${tag.padEnd(38)} -> $${c}${c==='?'?'   <<< INVALIDOU':''}`);
  return c;
}

try{
  await addProduto(page,'Managed Service for Apache Airflow',log);
  await passo('inicial (Iowa, padrões)', async()=>{});
  await passo('região SP', ()=>setRegiao(page, /S.o Paulo \(southamerica-east1\)/i, log));
  await passo('mCPU scheduler = 1',  ()=>setSelect(page,/1000 mCPU per Airflow Scheduler/i,/^1$/,log));
  await passo('mCPU worker = 1',     ()=>setSelect(page,/1000 mCPU per Airflow Worker/i,/^1$/,log));
  await passo('mCPU web server = 1', ()=>setSelect(page,/1000 mCPU per Airflow Web Server/i,/^1$/,log));
  await passo('hours = 730',              ()=>fillVerify(page,'Average hours each server runs',730,log));
  await passo('schedulers = 2',           ()=>fillVerify(page,'Number of Airflow Schedulers',2,log));
  await passo('mem scheduler = 4',        ()=>fillVerify(page,'Memory per Airflow Scheduler',4,log));
  await passo('storage scheduler = 10',   ()=>fillVerify(page,'Storage per Airflow Scheduler',10,log));
  await passo('workers = 6',              ()=>fillVerify(page,'Average number of Airflow Workers',6,log));
  await passo('mem worker = 4',           ()=>fillVerify(page,'Memory per Airflow Worker',4,log));
  await passo('storage worker = 10',      ()=>fillVerify(page,'Storage per Airflow Worker',10,log));
  await passo('mem web server = 4',       ()=>fillVerify(page,'Memory per Airflow Web Server',4,log));
  await passo('storage web server = 10',  ()=>fillVerify(page,'Storage per Airflow Web Server',10,log));
  await passo('db storage = 20',          ()=>fillVerify(page,'Airflow database storage',20,log));
  await page.screenshot({path:'probe-12-composer.png',fullPage:true});
}catch(e){ log('ERRO:',String(e).split('\n')[0]); }
finally{ await browser.close(); }
