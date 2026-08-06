// TEMPLATE DE REFERÊNCIA — copie para build_<cliente>.mjs e ajuste SERVICES + fillers.
// Cenário de exemplo (Ambiente PROD, região São Paulo): plataforma de dados enxuta.
// Uso: node build_exemplo.mjs
import fs from 'fs';
import { abrirCalculadora, addProduto, fillVerify, setSelect, setRegiao, renomear,
         custoEstavel, lerItens, pegarLink, validarLink } from './gcp_lib.mjs';

const CLIENTE = 'exemplo';
const REGIAO  = /S.o Paulo \(southamerica-east1\)/i;
const log = (...a)=>console.log(...a);

// ---------------- fillers (um por serviço da proposta) ----------------

// 2 VMs n4-standard-8 24x7 para o runtime da aplicação
async function fComputeEngine(page){
  await setSelect(page, /^Series$/, /^N4\b/, log);
  await setSelect(page, /^Machine type$/, /^n4-standard-8\b/, log);
  await fillVerify(page, 'Number of instances', 2, log);
  await fillVerify(page, 'Total instance usage time', 730, log);
  await fillVerify(page, 'Boot disk size', 100, log);
  await setRegiao(page, REGIAO, log);
  await renomear(page, 'Runtime da aplicacao - 2x n4-standard-8 24x7', log);
}

// data lake: 10 TiB em Standard, região SP
async function fCloudStorage(page){
  await setSelect(page, /^Storage class$/, /Standard Storage/i, log);
  await fillVerify(page, 'Total amount of storage', 10, log);
  await setSelect(page, /^Unit$/, /^TiB$/, log);
  await setRegiao(page, REGIAO, log);
  await renomear(page, 'Data lake - 10 TiB Standard', log);
}

// data warehouse: BigQuery Editions, 100 slots baseline + 20 TiB de storage lógico ativo
async function fBigQuery(page){
  await fillVerify(page, 'Baseline slots', 100, log);
  await fillVerify(page, 'Active logical storage', 20, log);
  await setRegiao(page, REGIAO, log);
  await renomear(page, 'Data warehouse - 100 slots + 20 TiB', log);
}

// Lista: [nome exato no catálogo, filler, alvo mensal US$ da proposta (ou null)]
const SERVICES = [
  ['Compute Engine', fComputeEngine, null],
  ['Cloud Storage',  fCloudStorage,  null],
  ['BigQuery',       fBigQuery,      null],
];

// ---------------- pipeline ----------------
const { browser, page } = await abrirCalculadora();
const results = [];
try{
  for(const [produto, filler, alvo] of SERVICES){
    log(`\n=== ${produto}${alvo?` (alvo ~$${alvo})`:''} ===`);
    try{
      await addProduto(page, produto, log);
      await filler(page);
      const custo = await custoEstavel(page);
      const n = parseFloat(String(custo).replace(/,/g,''))||0;
      const status = alvo ? (Math.abs(n-alvo)/alvo < 0.05 ? 'OK' : '<<< FORA DO ALVO') : '';
      log(`   total acumulado = $${custo} ${status}`);
      results.push({ produto, alvo, ok:true, acumulado:custo });
    }catch(e){
      log('   ERRO:', String(e).split('\n')[0]);
      results.push({ produto, alvo, ok:false, err:String(e).split('\n')[0] });
    }
  }

  const itens = await lerItens(page);
  const total = await custoEstavel(page);
  log('\n=== quebra de custos ===');
  itens.grupos.forEach(g=>{
    log(`   ${g.grupo}: ${g.total}`);
    g.itens.forEach(i=>log(`      · ${i.item} = ${i.custo}`));
  });
  log(`=== TOTAL = $${total}/mês (~$${(parseFloat(total.replace(/,/g,''))*12).toFixed(2)}/ano) ===`);

  await page.screenshot({ path:`${CLIENTE}-summary.png`, fullPage:true });
  fs.writeFileSync(`${CLIENTE}-summary.txt`, await page.locator('body').innerText());

  const url = await pegarLink(page, log);
  log('\nLINK:', url);
  const check = await validarLink(url, {}, log);

  fs.writeFileSync(`${CLIENTE}-result.json`, JSON.stringify({
    cliente: CLIENTE, results, itens, total_mensal: total, url, validado: check.ok, total_no_link: check.total
  }, null, 2));
}catch(e){ log('ERRO GERAL:', String(e).split('\n')[0]); }
finally{ await browser.close(); }
