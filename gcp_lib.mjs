// Helpers compartilhados para dirigir o Google Cloud Pricing Calculator (cloud.google.com/products/calculator).
// Usado pelos build_<cliente>.mjs. Espelha o papel do build_tiops.mjs no projeto AWS, mas isolado
// numa lib porque no GCP a UI é a mesma para todos os produtos (modal de catálogo + form + painel lateral).
import { chromium } from 'playwright';

export const CALC_URL = 'https://cloud.google.com/products/calculator';

export function makeLog(prefix=''){ return (...a)=>console.log(prefix,...a); }

export async function abrirCalculadora({ headless=true, width=1440, height=1600 } = {}){
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage({ viewport:{ width, height } });
  await page.goto(CALC_URL,{ waitUntil:'domcontentloaded', timeout:90000 });
  await page.waitForTimeout(6000);
  await dispensarBanners(page);
  return { browser, page };
}

/** Fecha banners de cookie e o convite de login ("Dismiss"), que cobrem os botões. */
export async function dispensarBanners(page){
  for(const re of [/^Accept all$/i, /^Dismiss$/i, /^I agree$/i]){
    const b = page.getByRole('button',{ name:re }).locator('visible=true').first();
    if(await b.count() && await b.isVisible().catch(()=>false)){
      await b.click().catch(()=>{});
      await page.waitForTimeout(500);
    }
  }
  // o widget de chat flutuante intercepta cliques no canto inferior direito
  await page.evaluate(()=>{
    document.querySelectorAll('iframe[src*="chat"], [id*="chat-widget"], [class*="chat-widget"]')
      .forEach(e=>{ e.style.display='none'; });
  }).catch(()=>{});
}

/**
 * Adiciona um produto à estimativa atual: abre o modal "Add to estimate",
 * busca pelo nome e clica no card. O nome precisa ser EXATO como no catálogo
 * (ex.: 'Compute Engine', 'Cloud Storage', 'BigQuery', 'Vertex AI').
 */
export async function addProduto(page, nome, log=console.log){
  // Abrir o catálogo é o passo mais frágil do pipeline: conforme a estimativa cresce, o painel
  // lateral rola e o botão "Add to estimate" acaba coberto (widget de chat, banner de login) ou
  // fora da viewport, e o clique normal estoura por timeout. Três estratégias em ordem.
  let aberto = false;
  for(let t=0; t<3 && !aberto; t++){
    // fecha um modal que tenha sobrado de uma tentativa anterior, senão ele bloqueia o clique
    if(t > 0){ await page.keyboard.press('Escape').catch(()=>{}); await page.waitForTimeout(800); }
    await dispensarBanners(page);
    const add = page.getByRole('button',{ name:/Add to estimate/i }).locator('visible=true').first();
    if(!(await add.count())){ await page.waitForTimeout(1500); continue; }
    await add.scrollIntoViewIfNeeded().catch(()=>{});
    try{
      if(t === 0)      await add.click({ timeout:12000 });
      else if(t === 1) await add.click({ timeout:12000, force:true });
      else             await add.evaluate(el=>el.click());
    }catch{ /* tenta a próxima estratégia */ }
    await page.waitForTimeout(2500);
    aberto = await page.locator('input[placeholder*="Search by product"]').locator('visible=true').count() > 0;
  }
  if(!aberto) throw new Error(`não consegui abrir o catálogo para adicionar: ${nome}`);

  const busca = page.locator('input[placeholder*="Search by product"]').locator('visible=true').first();
  await busca.fill(''); await busca.fill(nome);
  await page.waitForTimeout(2500);

  // ESCOPAR AO MODAL é obrigatório: a partir do 2º serviço o nome do produto também aparece no
  // painel lateral de custos, e um seletor global casa com o texto do painel (visível, porém não
  // clicável como card) — o clique estoura por timeout justamente quando se repete um produto.
  const modal = page.locator('[role="dialog"]').locator('visible=true').first();
  const card = modal.getByText(nome,{ exact:true }).locator('visible=true').first();
  if(!(await card.count())){
    await page.keyboard.press('Escape').catch(()=>{});
    throw new Error(`produto não encontrado no catálogo: ${nome}`);
  }
  await card.click({ timeout:25000 });
  await page.waitForTimeout(6000);
  await dispensarBanners(page);
  log(`   + ${nome}`);
}

/**
 * Preenche um campo numérico e RELÊ o valor para confirmar.
 * Os forms do calculator re-renderizam ao trocar dropdowns e descartam o que foi digitado,
 * então confirmar é obrigatório (mesma lição do projeto AWS).
 */
export async function fillVerify(page, label, valor, log=console.log){
  // Os campos numéricos NÃO têm aria-label: o rótulo vem por `aria-labelledby` apontando para um
  // <span> ("Number of instances*", "Boot disk size (GiB) info"). getByLabel resolve o nome
  // acessível e cobre os dois casos (labelledby e aria-label dos textareas "Rename X").
  // String casa por substring; passe regex se precisar de precisão.
  // Alguns rótulos ("Number of vCPUs", "Amount of memory") pertencem a DOIS controles: o slider
  // (input[type=range]) e a caixa numérica. Excluímos o range para não escrever no lugar errado.
  const campo = page.locator('input:not([type="range"]), textarea');
  const alvo = () => page.getByLabel(label).and(campo).locator('visible=true').first();
  const ler  = async () => ((await alvo().inputValue().catch(()=>'')) || '').replace(/,/g,'');

  for(let i=0;i<5;i++){
    const el = alvo();
    if(!(await el.count())){ await page.waitForTimeout(700); continue; }
    await el.scrollIntoViewIfNeeded().catch(()=>{});
    await el.click().catch(()=>{});
    await el.fill('').catch(()=>{});
    await el.fill(String(valor)).catch(()=>{});
    await page.keyboard.press('Tab').catch(()=>{});
    await page.waitForTimeout(600);
    if(await ler() !== String(valor)) continue;

    // SEGUNDA leitura, com o elemento consultado de novo depois do debounce. Confirmar só uma vez
    // não basta: trocar um dropdown (o `Unit` do Cloud Storage é o caso clássico) remonta o bloco
    // logo em seguida e o campo volta ao padrão — o valor lido na hora era de um nó já substituído.
    // Foi assim que 20 TiB viraram os 5000 TiB do padrão, um salto de US$ 179 mil no total.
    await page.waitForTimeout(1500);
    if(await ler() === String(valor)) return true;
  }
  log(`   !! falha ao fixar "${label}" = ${valor} (valor final: "${await ler()}")`);
  return false;
}

/**
 * Escolhe uma opção num dropdown (role=combobox).
 * ATENÇÃO: os combos do calculator quase nunca têm `aria-label` — eles usam `aria-labelledby`
 * apontando para um <span> com o rótulo ("Region", "Machine type", "Storage class").
 * Por isso resolvemos pelo NOME ACESSÍVEL (getByRole), que já segue o labelledby.
 * `labelRe` casa com o rótulo e `opcaoRe` com o texto da opção.
 *
 * CUIDADO com o `$` em `opcaoRe`: o nome acessível da opção inclui a descrição na 2ª linha
 * ("N4 Flexible & cost-optimized", "Low CO2 Sao Paulo (southamerica-east1)"). Use âncora só no
 * início (/^N4\b/) ou trecho sem âncora — /^N4$/ NÃO casa.
 */
export async function setSelect(page, labelRe, opcaoRe, log=console.log, opts={}){
  const { indice=0, alvo=null } = opts;               // `alvo`: combobox já localizado (ver setRegiao)
  const combo = alvo || page.getByRole('combobox',{ name:labelRe }).locator('visible=true').nth(indice);
  if(!(await combo.count())){ log(`   !! combobox não encontrado: ${labelRe}`); return false; }

  const valorAtual = async () =>
    (((await combo.innerText().catch(()=>'')) || '').split('\n').filter(Boolean).pop() || '').trim();
  const casa = v => opcaoRe instanceof RegExp ? opcaoRe.test(v) : v.includes(String(opcaoRe));

  for(let tentativa=0; tentativa<2; tentativa++){
    if(casa(await valorAtual())) break;
    await combo.scrollIntoViewIfNeeded().catch(()=>{});
    await combo.click().catch(()=>{});
    await page.waitForTimeout(1300);

    let opt = page.getByRole('option',{ name:opcaoRe }).locator('visible=true').first();
    if(!(await opt.count())){
      // listas longas (machine types, regiões) são virtualizadas: typeahead no listbox aberto
      const termo = String(opcaoRe).replace(/^\/|\/[a-z]*$/g,'').replace(/[\\^$()[\]|?*+]/g,'').trim();
      if(termo.length>2){
        await page.keyboard.type(termo.slice(0,20),{ delay:40 }).catch(()=>{});
        await page.waitForTimeout(1200);
        opt = page.getByRole('option',{ name:opcaoRe }).locator('visible=true').first();
      }
    }
    if(await opt.count()) await opt.click().catch(()=>{});
    else await page.keyboard.press('Escape').catch(()=>{});
    await page.waitForTimeout(2200);
  }

  // CONFIRMAR lendo o valor de volta. Sem isso o helper mente: quando dois comboboxes têm o mesmo
  // rótulo (o BigQuery tem "Location" para o TIPO e para a REGIÃO), clicar no errado ainda acha
  // alguma opção e o log dá sucesso, enquanto a estimativa continua na região padrão.
  const final = await valorAtual();
  if(casa(final)){ log(`   ${String(labelRe)} = ${final}`); return true; }
  log(`   !! não consegui definir "${labelRe}" = ${opcaoRe} — continua "${final}"`);
  return false;
}

/**
 * Preenche VÁRIOS campos e depois confere TODOS de novo, repetindo até estabilizar.
 *
 * Confirmar campo a campo não basta: preencher B remonta o bloco e reverte A, e a checagem de A
 * já tinha passado. O único jeito confiável é reler o conjunto inteiro depois de mexer em tudo e
 * recolocar o que saiu do lugar. Devolve `true` só quando todos os campos batem.
 *
 *   await fillMany(page, { 'Baseline slots':200, 'Active logical storage':50 }, log)
 */
export async function fillMany(page, campos, log=console.log, passes=4){
  const entradas = Object.entries(campos);
  const seletor = page.locator('input:not([type="range"]), textarea');
  const ler = async (label) =>
    (((await page.getByLabel(label).and(seletor).locator('visible=true').first()
        .inputValue().catch(()=>'')) || '')).replace(/,/g,'');

  for(let p=0; p<passes; p++){
    let divergentes = [];
    for(const [label, valor] of entradas){
      if(await ler(label) !== String(valor)) divergentes.push([label, valor]);
    }
    if(!divergentes.length) return true;
    if(p > 0) log(`   (reajustando ${divergentes.map(d=>d[0]).join(', ')})`);
    for(const [label, valor] of divergentes) await fillVerify(page, label, valor, ()=>{});
    await page.waitForTimeout(1800);   // deixa o recálculo do painel terminar antes de reconferir
  }

  const restantes = [];
  for(const [label, valor] of entradas){
    const got = await ler(label);
    if(got !== String(valor)) restantes.push(`${label}: quis ${valor}, ficou ${got||'vazio'}`);
  }
  if(restantes.length){ log(`   !! campos não fixados -> ${restantes.join(' | ')}`); return false; }
  return true;
}

/**
 * Renomeia o serviço aberto (campo "Rename <tipo>") para o nome usado na proposta.
 * Vale a pena sempre: é o texto que o cliente vê no painel de custos do link compartilhado.
 * O sufixo do rótulo muda por produto ("Rename Instances", "Rename Cloud Storage",
 * "Rename Editions"), então casamos só pelo prefixo.
 */
export async function renomear(page, nome, log=console.log){
  // Os campos "Rename" de TODOS os serviços da estimativa ficam no DOM ao mesmo tempo, e a ordem
  // deles NÃO é a ordem em que os produtos foram adicionados. Pegar `.last()` renomeava um serviço
  // qualquer: numa estimativa de 12 itens, 5 ficaram com o nome padrão e o painel entregue ao
  // cliente mostrou três "Cloud Run" e dois "Generative AI" indistinguíveis — sem nenhum erro no
  // log, porque o fill funcionava, só que no campo errado.
  //
  // Como renomeamos cada serviço logo depois de adicioná-lo, existe exatamente UM campo ainda com
  // o nome padrão. Os nomes padrão do calculator ("Cloud Run", "Generative AI", "On-Demand",
  // "Cloud Logging") nunca contêm " - ", e os nomes de proposta sempre contêm — é esse o critério
  // para achar o campo do serviço recém-adicionado.
  const todos = page.locator('textarea[aria-label^="Rename"], input[aria-label^="Rename"]').locator('visible=true');
  const n = await todos.count();
  if(!n){ log(`   !! campo de renomear não encontrado`); return false; }

  let el = null;
  for(let i=n-1;i>=0;i--){
    const v = (await todos.nth(i).inputValue().catch(()=>'')) || '';
    if(!v.includes(' - ')){ el = todos.nth(i); break; }
  }
  if(!el){ log(`   !! nenhum campo de renomear ainda com nome padrão (nome "${nome}" não aplicado)`); return false; }

  await el.scrollIntoViewIfNeeded().catch(()=>{});
  await el.fill(String(nome)).catch(()=>{});
  await page.keyboard.press('Tab').catch(()=>{});
  await page.waitForTimeout(1000);
  // O campo tem maxlength de ~36 caracteres e TRUNCA em silêncio. Um nome mais longo entra cortado
  // no meio da palavra, então tratamos prefixo como sucesso (mas avisamos, para encurtar o nome).
  const final = (await el.inputValue().catch(()=>'')) || '';
  if(final === String(nome)){ log(`   nome = ${nome}`); return true; }
  if(final && String(nome).startsWith(final)){
    log(`   nome = ${final}   (TRUNCADO em ${final.length} chars — encurte o nome na proposta)`);
    return true;
  }
  log(`   !! renomear falhou: quis "${nome}", ficou "${final}"`);
  return false;
}

/**
 * Define a região do serviço aberto (o padrão do calculator é Iowa/us-central1).
 *
 * NÃO localiza pelo rótulo: o BigQuery tem DOIS comboboxes chamados "Location" — o primeiro é o
 * TIPO ("Region"/"Multi-region") e o segundo é a região de verdade. Pegar o primeiro troca o tipo
 * e deixa a região em Iowa. Aqui localizamos pelo VALOR ATUAL, que sempre traz o id da região
 * entre parênteses (us-central1, southamerica-east1, europe-west1...).
 */
export async function setRegiao(page, regiaoRe=/S.o Paulo \(southamerica-east1\)/i, log=console.log){
  // O id da região nem sempre vem entre parênteses: o Cloud Run inverte e mostra
  // "europe-west1 (Belgium) - Tier 1", com a CIDADE nos parênteses. Exigir os parênteses ao
  // redor do id fazia o helper não achar combobox nenhum no Cloud Run e deixar o serviço na
  // Bélgica sem erro fatal — só um aviso no log. Por isso casamos o id solto, com \b.
  const RE_REGIAO = /\b(us|europe|asia|southamerica|northamerica|australia|me|africa)-[a-z]+\d\b/i;
  const combos = page.getByRole('combobox').locator('visible=true');
  const n = await combos.count();
  for(let i=0;i<n;i++){
    const c = combos.nth(i);
    if(RE_REGIAO.test((await c.innerText().catch(()=>'')) || '')){
      return setSelect(page, 'Region', regiaoRe, log, { alvo:c });
    }
  }
  log('   !! nenhum combobox de região encontrado neste serviço');
  return false;
}

/** Lê o total do painel lateral ("ESTIMATED COST  $X / mo"). */
export function lerCusto(texto){
  const m = texto.match(/ESTIMATED COST\s*\n?\s*\$?([\d.,]+)/i);
  return m ? m[1] : '?';
}

/** Espera o total estabilizar antes de ler (o painel recalcula em debounce). */
export async function custoEstavel(page){
  let last='?';
  for(let i=0;i<12;i++){
    await page.waitForTimeout(900);
    const c = lerCusto(await page.locator('body').innerText().catch(()=>''));
    if(c!=='?' && c===last) return c;
    last=c;
  }
  return last;
}

/**
 * Extrai a quebra de custos do painel lateral.
 * Retorna { grupos:[{grupo,total,itens:[{item,custo}]}] }.
 *
 * O painel repete ícones/labels de UI ("delete_forever", "edit", "more_vert") entre os valores,
 * e o nome do item às vezes não é renderizado (aparece só o valor). Por isso o TOTAL DO GRUPO
 * — que vem sempre logo abaixo do cabeçalho em CAIXA ALTA — é a leitura confiável; os itens são
 * complementares. Renomeie cada serviço (campo "Rename <X>") para o painel casar com a proposta.
 */
export async function lerItens(page){
  return await page.evaluate(()=>{
    const txt = document.body.innerText;
    const bloco = (txt.split(/Cost details/)[1] || '').split(/ESTIMATED COST/)[0];
    const RUIDO = /^(settings|USD|arrow_drop_down|Adjust currency|add|Add to estimate|delete_forever|Delete group|edit|Edit|more_vert|More options|info)$/i;
    const linhas = bloco.split('\n').map(s=>s.trim()).filter(Boolean);
    const grupos = []; let g = null;
    for(let i=0;i<linhas.length;i++){
      const l = linhas[i], prox = linhas[i+1]||'';
      // cabeçalho de grupo: CAIXA ALTA seguido do total do grupo
      if(/^[A-Z][A-Z0-9 &/()-]{2,39}$/.test(l) && /^\$[\d.,]+$/.test(prox)){
        g = { grupo:l, total:prox, itens:[] }; grupos.push(g); i++; continue;
      }
      if(!g) continue;
      if(/^\$[\d.,]+$/.test(l)){
        // valor solto: o nome do item pode não ter sido renderizado
        const ant = linhas[i-1]||'';
        const nome = (!RUIDO.test(ant) && !/^\$/.test(ant)) ? ant : '(sem nome)';
        if(!g.itens.some(x=>x.item===nome && x.custo===l)) g.itens.push({ item:nome, custo:l });
      }
    }
    return { grupos };
  });
}

/**
 * O link compartilhável do GCP é a PRÓPRIA URL da página (?dl=<blob>), atualizada a cada mudança
 * e válida sem login. Abrimos o diálogo Share só para forçar o flush do estado e conferir o total.
 */
export async function pegarLink(page, log=console.log){
  await dispensarBanners(page);
  const share = page.getByRole('button',{ name:/^Share$/i }).locator('visible=true').first();
  if(await share.count()){
    await share.scrollIntoViewIfNeeded().catch(()=>{});
    await share.click({ timeout:20000 }).catch(()=>{});
    await page.waitForTimeout(3500);
    await page.keyboard.press('Escape').catch(()=>{});
    await page.waitForTimeout(1000);
  }
  const url = page.url();
  if(!url.includes('dl=')) log('   !! a URL não tem ?dl= — a estimativa pode estar vazia');
  return url;
}

/** Valida o link abrindo-o num contexto limpo (sem cookies/sessão), como o cliente veria. */
export async function validarLink(url, { headless=true } = {}, log=console.log){
  const browser = await chromium.launch({ headless });
  const ctx = await browser.newContext({ viewport:{ width:1440, height:1400 } });
  const page = await ctx.newPage();
  try{
    await page.goto(url,{ waitUntil:'domcontentloaded', timeout:90000 });
    await page.waitForTimeout(9000);
    const body = await page.locator('body').innerText();
    const total = lerCusto(body);
    log(`   link validado em sessão limpa: total = $${total}`);
    return { ok: total!=='?', total, body };
  } finally { await browser.close(); }
}
