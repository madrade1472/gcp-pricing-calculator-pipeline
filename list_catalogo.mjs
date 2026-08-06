// Lista os nomes EXATOS dos produtos no catálogo "Add to estimate".
// addProduto() casa por texto exato, então usar o nome daqui evita "produto não encontrado".
// Uso: node list_catalogo.mjs  ->  catalogo_gcp.json
import fs from 'fs';
import { abrirCalculadora, dispensarBanners } from './gcp_lib.mjs';

const log=(...a)=>console.log(...a);
const { browser, page } = await abrirCalculadora();
try{
  await page.getByRole('button',{name:/Add to estimate/i}).locator('visible=true').first().click();
  await page.waitForTimeout(4000);
  await dispensarBanners(page);

  // rolar o modal até o fim para materializar todos os cards
  for(let i=0;i<25;i++){
    await page.mouse.wheel(0,1600);
    await page.waitForTimeout(500);
  }
  const nomes = await page.evaluate(()=>{
    const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};
    const set=new Set();
    document.querySelectorAll('[role="dialog"] h1,[role="dialog"] h2,[role="dialog"] h3,[role="dialog"] div').forEach(e=>{
      if(!vis(e)) return;
      if(e.children.length) return;              // só folhas de texto
      const t=(e.innerText||'').trim();
      if(t && t.length<60 && !/^(Add to this estimate|Sort by|Search)/i.test(t)) set.add(t);
    });
    return [...set];
  });
  fs.writeFileSync('catalogo_gcp.json', JSON.stringify(nomes.sort(),null,1));
  log(`${nomes.length} produtos ->  catalogo_gcp.json`);
  log(JSON.stringify(nomes.sort(),null,0).slice(0,3000));
}catch(e){ log('ERRO:',String(e).split('\n')[0]); }
finally{ await browser.close(); }
