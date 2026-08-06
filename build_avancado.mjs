// EXEMPLO AVANÇADO — os três casos que o build_exemplo.mjs não cobre e que quebram na prática:
//
//   1. Gemini      — o form empilha um bloco por modelo, sem dropdown de modelo. Preencher por
//                    rótulo pega SEMPRE o primeiro bloco, que não é o modelo que você quer.
//   2. Cloud Run   — não tem campo numérico, e um "Use case" pré-definido trava o volume em
//                    10 milhões de requisições/mês.
//   3. Reversão    — campos numéricos voltam ao padrão DEPOIS de confirmados, sem aviso no log.
//
// Os valores aqui são ilustrativos e arredondados; troque pelos da sua estimativa.
// Uso: node build_avancado.mjs
import fs from 'fs';
import { abrirCalculadora, addProduto, fillMany, setSelect, setRegiao, renomear,
         custoEstavel, lerItens, pegarLink, validarLink } from './gcp_lib.mjs';

const SAIDA  = 'avancado';
// Case pelo ID da região, nunca pelo nome da cidade: o rótulo da opção muda de produto para
// produto — "Low CO2 Sao Paulo (southamerica-east1)" no Cloud Storage,
// "southamerica-east1 (Sao Paulo) - Tier 2" no Cloud Run.
const REGIAO = /southamerica-east1/i;
const log = (...a)=>console.log(...a);

// ---------------------------------------------------------------------------
// PADRÃO 1 — escolher o bloco do modelo certo dentro de "Gemini Models"
//
// O form lista ~9 modelos empilhados (Gemini 3.5 Flash, 3.1 Pro, 2.5 Pro, 2.5 Flash, ...) e TODOS
// têm campos chamados "Requests per day", "Average input tokens for image". Não há dropdown de
// modelo. `getByLabel` casa o primeiro do DOM — o primeiro bloco, não o seu modelo.
//
// Subir na árvore do DOM não resolve: o ancestral comum engloba a lista inteira e todo bloco
// devolve o mesmo título. O que funciona é casar POSICIONALMENTE cada input com o cabeçalho de
// modelo imediatamente acima dele, e marcar o alvo com um atributo temporário para o Playwright
// preencher pelo caminho normal (disparando os eventos que o React escuta).
//
// Rode `node probe_gemini_blocos.mjs` para ver o mapa de blocos do form atual.
// ---------------------------------------------------------------------------
async function marcarCampoGemini(page, modelo, rotulo){
  return await page.evaluate(({ modelo, rotulo })=>{
    const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};
    const nome=e=>{
      const al=e.getAttribute('aria-label'); if(al) return al.trim();
      const ids=e.getAttribute('aria-labelledby');
      if(ids) return ids.split(' ').map(x=>document.getElementById(x)?.innerText||'').join(' ').replace(/\s+/g,' ').trim();
      return '';
    };
    const topo = el => el.getBoundingClientRect().top + window.scrollY;
    document.querySelectorAll('[data-alvo]').forEach(e=>e.removeAttribute('data-alvo'));

    const cabecalhos=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6,span,div,p,legend,label')]
      .filter(e=>vis(e)&&e.children.length===0)
      .map(e=>({ txt:(e.innerText||'').trim(), y:topo(e) }))
      .filter(x=>/^gemini[\s\d.]/i.test(x.txt)&&x.txt.length<80);

    const inputs=[...document.querySelectorAll('input,textarea')]
      .filter(e=>vis(e)&&e.type!=='range'&&e.type!=='checkbox'&&e.type!=='radio');

    for(const el of inputs){
      const rot = nome(el);
      if(!rot || !rot.startsWith(rotulo)) continue;
      const acima = cabecalhos.filter(c=>c.y <= topo(el)+5).pop();
      if(acima && acima.txt === modelo){ el.setAttribute('data-alvo','1'); return true; }
    }
    return false;
  }, { modelo, rotulo });
}

/** Preenche um campo de um bloco de modelo específico, relocalizando o alvo na segunda leitura. */
async function fillGemini(page, modelo, rotulo, valor){
  for(let i=0;i<5;i++){
    if(!(await marcarCampoGemini(page, modelo, rotulo))){ await page.waitForTimeout(800); continue; }
    const el = page.locator('[data-alvo="1"]').first();
    await el.scrollIntoViewIfNeeded().catch(()=>{});
    await el.click().catch(()=>{});
    await el.fill('').catch(()=>{});
    await el.fill(String(valor)).catch(()=>{});
    await page.keyboard.press('Tab').catch(()=>{});
    await page.waitForTimeout(700);
    if((await el.inputValue().catch(()=>'')).replace(/,/g,'') !== String(valor)) continue;
    // segunda leitura com o elemento consultado DE NOVO: o bloco é remontado ao recalcular o
    // painel, e a primeira leitura pode vir de um nó já substituído.
    await page.waitForTimeout(1600);
    if(!(await marcarCampoGemini(page, modelo, rotulo))) continue;
    const v = (await page.locator('[data-alvo="1"]').first().inputValue().catch(()=>'')).replace(/,/g,'');
    if(v === String(valor)){ log(`   ${modelo} / ${rotulo} = ${valor}`); return true; }
  }
  log(`   !! falha ao fixar ${modelo} / ${rotulo} = ${valor}`);
  return false;
}

// ---------------------------------------------------------------------------
// PADRÃO 3 — fixar campos numéricos contra reversão silenciosa
//
// O `fillVerify` confirma o valor duas vezes e MESMO ASSIM o campo pode voltar ao padrão depois,
// de forma não determinística e sem uma linha no log. Dois casos reais: um item de logging voltou
// de 20 para 100 GiB (US$ 0,40 -> US$ 27,00) e um registry perdeu os 20 GiB (US$ 1,95 -> US$ 0,00).
//
// A ordem que segura é: DROPDOWNS -> RENOMEAR -> NÚMEROS, com o fillMany rodado duas vezes, a
// segunda após o debounce. Renomear é o que remonta o bloco, então precisa vir ANTES dos números.
// ---------------------------------------------------------------------------
async function fixarNumericos(page, campos){
  await fillMany(page, campos, log);
  await page.waitForTimeout(2500);
  await fillMany(page, campos, log);
}

// ---------------- fillers ----------------

// Modelo de trabalho, alto volume e resposta curta.
async function fGeminiFlash(page){
  await setSelect(page, /^Service type$/, /^Gemini Models/, log);
  await page.waitForTimeout(3000);
  const M = 'Gemini 2.5 Flash';
  await fillGemini(page, M, 'Requests per day', 1000);
  await fillGemini(page, M, 'Average input tokens for image', 1000);
  await fillGemini(page, M, 'Average input tokens for text', 500);
  await fillGemini(page, M, 'Average output tokens for text', 200);
  await renomear(page, 'Gemini 2.5 Flash - 1000 req/dia', log);   // <= 36 chars, ver PADRÃO 4
}

// Modelo de raciocínio, baixo volume e resposta longa.
async function fGeminiPro(page){
  await setSelect(page, /^Service type$/, /^Gemini Models/, log);
  await page.waitForTimeout(3000);
  const M = 'Gemini 2.5 Pro';
  await fillGemini(page, M, 'Requests per day', 100);
  await fillGemini(page, M, 'Average input tokens for text', 2000);
  await fillGemini(page, M, 'Average output tokens for text', 500);
  await renomear(page, 'Gemini 2.5 Pro - 100 req/dia', log);
}

// ---------------------------------------------------------------------------
// PADRÃO 2 — Cloud Run
//
// O form NÃO tem campo numérico: CPU, memória e concorrência vêm do "Use case", e o volume vem de
// um dropdown. Com qualquer use case PRÉ-DEFINIDO ("Serverless Function", "AI Agent",
// "Public API / Website"), esse dropdown fica travado em 10 milhões de requisições e abre com ZERO
// opções — o preset amarra volume e perfil juntos. Só "Custom" libera a escolha do volume.
//
// Opções de volume disponíveis em Custom: 0, 1.000, 5.000, 10.000, 30.417 (1.000/dia), 50.000,
// 100.000, 152.083 (5.000/dia), 250.000, 500.000, 760.417 (25.000/dia), 1M, 2,5M, 3,04M, 5M.
// ---------------------------------------------------------------------------
async function fCloudRun(page, requisicoesRe, nome){
  await setSelect(page, /^Use case$/, /^Custom/, log);
  await page.waitForTimeout(2500);
  await setRegiao(page, REGIAO, log);
  await setSelect(page, /Number of requests per month/i, requisicoesRe, log);
  await renomear(page, nome, log);
}
const fCloudRunApi = p => fCloudRun(p, /^100,000$/, 'Cloud Run - API 100k req/mes');

// Storage: dropdowns, depois renomear, depois o número.
async function fCloudStorage(page){
  await setSelect(page, /^Storage class$/, /Standard Storage/i, log);
  await setSelect(page, /^Unit$/, /^GiB$/, log);
  await setRegiao(page, REGIAO, log);
  await renomear(page, 'Cloud Storage - 100 GiB Standard', log);
  await fixarNumericos(page, { 'Total amount of storage':100 });
}

// BigQuery on-demand. Editions começa em 100 slots baseline (~US$ 2 mil/mês) e fica
// desproporcional para cargas pequenas. On-Demand tem DUAS dropdowns "Unit":
// índice 0 = volume consultado, índice 1 = storage.
async function fBigQuery(page){
  await setSelect(page, /^Service type$/, /On.?Demand/i, log);
  await setSelect(page, /^Unit$/, /^GiB$/, log, { indice:0 });
  await setSelect(page, /^Unit$/, /^GiB$/, log, { indice:1 });
  await setRegiao(page, REGIAO, log);
  await renomear(page, 'BigQuery on-demand', log);
  await fixarNumericos(page, { 'Amount of data queried':500, 'Active logical storage':50 });
}

const SERVICES = [
  ['Agent Platform GenAI Models', fGeminiFlash,  'Gemini 2.5 Flash'],
  ['Agent Platform GenAI Models', fGeminiPro,    'Gemini 2.5 Pro'],
  ['Cloud Run',                   fCloudRunApi,  'Cloud Run - API'],
  ['Cloud Storage',               fCloudStorage, 'Cloud Storage'],
  ['BigQuery',                    fBigQuery,     'BigQuery on-demand'],
];

// ---------------- pipeline ----------------
const { browser, page } = await abrirCalculadora();
const results = [];
let anterior = 0;
try{
  for(const [produto, filler, rotulo] of SERVICES){
    log(`\n=== ${rotulo} (${produto}) ===`);
    try{
      await addProduto(page, produto, log);
      await filler(page);
      const custo = await custoEstavel(page);
      const n = parseFloat(String(custo).replace(/,/g,''))||0;
      // Logue o custo POR SERVIÇO, não só o acumulado: um valor absurdo se esconde dentro de um
      // acumulado grande, mas salta aos olhos sozinho.
      log(`   custo do servico = $${(n-anterior).toFixed(2)}   |   acumulado = $${custo}`);
      results.push({ rotulo, produto, custo_servico:+(n-anterior).toFixed(2), acumulado:custo, ok:true });
      anterior = n;
    }catch(e){
      log('   ERRO:', String(e).split('\n')[0]);
      results.push({ rotulo, produto, ok:false, err:String(e).split('\n')[0] });
    }
  }

  const itens = await lerItens(page);
  const total = await custoEstavel(page);
  log('\n=== quebra de custos ===');
  itens.grupos.forEach(g=>{
    log(`   ${g.grupo}: ${g.total}`);
    g.itens.forEach(i=>log(`      · ${i.item} = ${i.custo}`));
  });
  log(`\n=== TOTAL = $${total}/mês ===`);

  const url = await pegarLink(page, log);
  log('\nLINK:', url);
  const check = await validarLink(url, {}, log);

  fs.writeFileSync(`${SAIDA}-result.json`, JSON.stringify({
    results, itens, total_mensal: total, url, validado: check.ok, total_no_link: check.total
  }, null, 2));
  log(`\nAGORA AUDITE:  node probe_gcp8.mjs "${url}"`);
}catch(e){ log('ERRO GERAL:', String(e).split('\n')[0]); }
finally{ await browser.close(); }
