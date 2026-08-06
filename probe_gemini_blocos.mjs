// Casa cada bloco "Requests per day" do form "Gemini Models" com o NOME DO MODELO.
//
// O form empilha UM BLOCO POR MODELO (Gemini 3.5 Flash, 3.1 Pro, 2.5 Pro, 2.5 Flash, ...) e não
// tem dropdown de modelo: todos os blocos repetem os mesmos rótulos de campo. Subir na árvore do
// DOM não resolve — o ancestral comum engloba a lista inteira e todo bloco devolve o mesmo título.
// Por isso o casamento aqui é POSICIONAL: a caixa de cada input contra o cabeçalho de modelo
// imediatamente acima dele na página.
//
// Saída: probe-gemini-blocos.json — o índice de cada bloco e a que modelo ele pertence.
// Uso: node probe_gemini_blocos.mjs
import fs from 'fs';
import { abrirCalculadora, addProduto } from './gcp_lib.mjs';

const log = (...a)=>console.log(...a);

const { browser, page } = await abrirCalculadora();
try{
  await addProduto(page, 'Agent Platform GenAI Models', log);
  const combo = page.getByRole('combobox',{ name:/^Service type$/ }).locator('visible=true').first();
  await combo.click(); await page.waitForTimeout(1500);
  await page.getByRole('option',{ name:/^Gemini Models/ }).locator('visible=true').first().click();
  await page.waitForTimeout(6000);

  const r = await page.evaluate(()=>{
    const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};
    const nome=e=>{
      const al=e.getAttribute('aria-label'); if(al) return al.trim();
      const ids=e.getAttribute('aria-labelledby');
      if(ids) return ids.split(' ').map(x=>document.getElementById(x)?.innerText||'').join(' ').replace(/\s+/g,' ').trim();
      return '';
    };
    const topo = el => el.getBoundingClientRect().top + window.scrollY;

    // candidatos a cabeçalho: elementos-folha cujo texto cita um modelo Gemini
    const cabecalhos = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,span,div,p,legend,label')]
      .filter(e=>vis(e) && e.children.length===0)
      .map(e=>({ txt:(e.innerText||'').trim(), y:topo(e) }))
      .filter(x=>/^gemini[\s\d.]/i.test(x.txt) && x.txt.length<80);

    const inputs = [...document.querySelectorAll('input,textarea')]
      .filter(e=>vis(e)&&e.type!=='range'&&e.type!=='checkbox'&&e.type!=='radio');

    const blocos=[]; let idx=-1;
    for(const el of inputs){
      const rot = nome(el);
      if(!rot || /^Rename/.test(rot)) continue;
      const y = topo(el);
      if(/^Requests per day/.test(rot)){
        idx++;
        const acima = cabecalhos.filter(c=>c.y <= y + 5).pop();
        blocos.push({ indice: idx, modelo: acima ? acima.txt : '(nao identificado)', y, campos: [] });
      }
      if(blocos.length) blocos[blocos.length-1].campos.push(rot);
    }
    return { cabecalhos: cabecalhos.map(c=>c.txt), blocos };
  });

  log('CABECALHOS ENCONTRADOS:', JSON.stringify(r.cabecalhos,null,1));
  log('\nBLOCOS:');
  r.blocos.forEach(b=>log(`  [${b.indice}] ${b.modelo}\n        ${b.campos.join(' / ')}`));
  fs.writeFileSync('probe-gemini-blocos.json', JSON.stringify(r,null,1));
  log('\nOK -> probe-gemini-blocos.json');
}catch(e){ log('ERRO:', String(e)); }
finally{ await browser.close(); }
