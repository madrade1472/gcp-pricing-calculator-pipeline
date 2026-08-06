// Enumera as OPÇÕES de cada dropdown de um produto — o que "Service type", "Use case",
// "Number of requests per month" etc. realmente aceitam.
//
// Existe porque duas armadilhas só aparecem aqui: (1) casar a opção por regex frouxa pega a
// errada ("Gemini Image Models" quando se queria "Gemini Models"), e (2) um dropdown pode abrir
// com ZERO opções quando outro campo o trava — é o caso do volume do Cloud Run sob um use case
// pré-definido. Rodar isto antes de escrever um filler evita as duas.
//
// Saída: probe-opcoes.json
// Uso: node probe_opcoes_dropdown.mjs
import fs from 'fs';
import { abrirCalculadora, addProduto } from './gcp_lib.mjs';

const log = (...a)=>console.log(...a);

async function mapear(page){
  return await page.evaluate(()=>{
    const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};
    const nome=e=>{
      const al=e.getAttribute('aria-label'); if(al) return al.replace(/\n/g,' ').trim();
      const ids=e.getAttribute('aria-labelledby');
      if(ids) return ids.split(' ').map(x=>document.getElementById(x)?.innerText||'').join(' ').replace(/\s+/g,' ').trim();
      return '';
    };
    const campos=[], dropdowns=[];
    document.querySelectorAll('input,textarea').forEach(e=>{
      if(!vis(e)||e.type==='range'||e.type==='checkbox'||e.type==='radio') return;
      const n=nome(e); if(!n||/^Rename/.test(n)) return;
      campos.push({ rotulo:n, padrao:e.value });
    });
    document.querySelectorAll('[role="combobox"]').forEach((e,i)=>{
      if(!vis(e)) return;
      const n=nome(e); if(!n||/English/.test(n)) return;
      const linhas=(e.innerText||'').split('\n').map(s=>s.trim()).filter(Boolean);
      dropdowns.push({ idx:i, rotulo:n, atual:linhas[linhas.length-1]||'' });
    });
    return { campos, dropdowns };
  });
}

// abre TODOS os comboboxes visíveis um a um e lista as opções
async function todasOpcoes(page){
  const out = [];
  const combos = page.getByRole('combobox').locator('visible=true');
  const n = await combos.count();
  for(let i=0;i<n;i++){
    const c = combos.nth(i);
    const rotulo = await c.evaluate(e=>{
      const al=e.getAttribute('aria-label'); if(al) return al.trim();
      const ids=e.getAttribute('aria-labelledby');
      if(ids) return ids.split(' ').map(x=>document.getElementById(x)?.innerText||'').join(' ').replace(/\s+/g,' ').trim();
      return '';
    }).catch(()=>'');
    if(!rotulo || /English/.test(rotulo)) continue;
    const atual = (((await c.innerText().catch(()=>'')) || '').split('\n').filter(Boolean).pop()||'').trim();
    await c.scrollIntoViewIfNeeded().catch(()=>{});
    await c.click().catch(()=>{});
    await page.waitForTimeout(1500);
    const opts = await page.getByRole('option').locator('visible=true').allInnerTexts().catch(()=>[]);
    await page.keyboard.press('Escape').catch(()=>{});
    await page.waitForTimeout(700);
    out.push({ i, rotulo, atual, opcoes: opts.map(s=>s.replace(/\n/g,' | ').trim()).slice(0,60) });
    log(`   [${i}] ${rotulo} (=${atual}) -> ${opts.length} opcoes`);
  }
  return out;
}

const out = {};

// ---------- Agent Platform GenAI Models -> "Gemini Models" (exato) ----------
{
  const { browser, page } = await abrirCalculadora();
  try{
    await addProduto(page, 'Agent Platform GenAI Models', log);
    const combo = page.getByRole('combobox',{ name:/^Service type$/ }).locator('visible=true').first();
    await combo.click(); await page.waitForTimeout(1500);
    const g = page.getByRole('option',{ name:/^Gemini Models/ }).locator('visible=true').first();
    if(await g.count()){
      await g.click(); await page.waitForTimeout(5000);
      out['GenAI.GeminiModels.form'] = await mapear(page);
      log('form:', JSON.stringify(out['GenAI.GeminiModels.form'],null,1));
      out['GenAI.GeminiModels.dropdowns'] = await todasOpcoes(page);
    } else { log('!! opcao "Gemini Models" nao encontrada'); await page.keyboard.press('Escape'); }
  }catch(e){ log('ERRO GenAI:', String(e).split('\n')[0]); }
  finally{ await browser.close(); }
}

// ---------- Cloud Run: estado padrão e use case Custom ----------
{
  const { browser, page } = await abrirCalculadora();
  try{
    await addProduto(page, 'Cloud Run', log);
    log('--- Cloud Run padrao ---');
    out['CloudRun.default.dropdowns'] = await todasOpcoes(page);
    const uc = page.getByRole('combobox',{ name:/^Use case$/ }).locator('visible=true').first();
    await uc.click(); await page.waitForTimeout(1500);
    const custom = page.getByRole('option',{ name:/^Custom/ }).locator('visible=true').first();
    if(await custom.count()){
      await custom.click(); await page.waitForTimeout(5000);
      out['CloudRun.custom.form'] = await mapear(page);
      log('--- Cloud Run custom ---');
      log('form:', JSON.stringify(out['CloudRun.custom.form'],null,1));
      out['CloudRun.custom.dropdowns'] = await todasOpcoes(page);
    } else { log('!! Custom nao encontrado'); await page.keyboard.press('Escape'); }
  }catch(e){ log('ERRO Cloud Run:', String(e).split('\n')[0]); }
  finally{ await browser.close(); }
}

fs.writeFileSync('probe-opcoes.json', JSON.stringify(out,null,1));
log('\nOK -> probe-opcoes.json');
