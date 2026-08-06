// Mapeia os campos (inputs numéricos e dropdowns) dos produtos mais usados nas propostas.
// Gera forms_gcp.json — consultar ANTES de escrever um filler, para acertar os rótulos de primeira.
// Uso: node discover_forms.mjs [Produto A] [Produto B] ...
import fs from 'fs';
import { abrirCalculadora, addProduto, dispensarBanners, CALC_URL } from './gcp_lib.mjs';

const PADRAO = [
  'Compute Engine','Cloud Storage','BigQuery','Cloud Run','Cloud SQL','Vertex AI',
  'Google Kubernetes Engine','Cloud Composer','Dataflow','Dataproc','Pub/Sub',
  'Cloud Logging','Cloud Monitoring','Datastream','Memorystore','Cloud Functions',
];
const PRODUTOS = process.argv.slice(2).length ? process.argv.slice(2) : PADRAO;
const log=(...a)=>console.log(...a);

async function mapear(page){
  return await page.evaluate(()=>{
    const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};
    const nome=e=>{
      const al=e.getAttribute('aria-label'); if(al) return al.replace(/\n/g,' ').trim();
      const ids=e.getAttribute('aria-labelledby');
      if(ids) return ids.split(' ').map(x=>document.getElementById(x)?.innerText||'').join(' ').replace(/\n/g,' ').replace(/\s+/g,' ').trim();
      return '';
    };
    const campos=[], dropdowns=[];
    document.querySelectorAll('input,textarea').forEach(e=>{
      if(!vis(e)||e.type==='range'||e.type==='checkbox'||e.type==='radio') return;
      const n=nome(e); if(!n||/^Rename/.test(n)) return;
      campos.push({ rotulo:n, tipo:e.type, padrao:e.value });
    });
    document.querySelectorAll('[role="combobox"]').forEach(e=>{
      if(!vis(e)) return;
      const n=nome(e); if(!n||/English/.test(n)) return;
      const linhas=(e.innerText||'').split('\n').map(s=>s.trim()).filter(Boolean);
      dropdowns.push({ rotulo:n.split(' ')[0]===n?n:n, atual:linhas[linhas.length-1]||'' });
    });
    return { campos, dropdowns };
  });
}

// mescla com o que já foi mapeado, para dar pra rodar só os produtos que faltam
const out = fs.existsSync('forms_gcp.json') ? JSON.parse(fs.readFileSync('forms_gcp.json','utf-8')) : {};
for(const k of Object.keys(out)) if(out[k].erro) delete out[k];
for(const produto of PRODUTOS){
  let browser;
  try{
    // sessão nova por produto: o form anterior fica montado e polui a leitura
    const s = await abrirCalculadora(); browser = s.browser;
    await addProduto(s.page, produto, log);
    await dispensarBanners(s.page);
    const m = await mapear(s.page);
    out[produto]=m;
    log(`   ${produto}: ${m.campos.length} campos, ${m.dropdowns.length} dropdowns`);
  }catch(e){
    out[produto]={ erro:String(e).split('\n')[0] };
    log(`   ${produto}: ERRO ${String(e).split('\n')[0]}`);
  }finally{ if(browser) await browser.close(); }
  fs.writeFileSync('forms_gcp.json', JSON.stringify(out,null,1));
}
log('\nOK -> forms_gcp.json');
