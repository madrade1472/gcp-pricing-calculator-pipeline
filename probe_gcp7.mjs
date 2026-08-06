// Sonda 7: atributos REAIS dos inputs numéricos e das opções dos dropdowns.
import { abrirCalculadora, addProduto, setSelect } from './gcp_lib.mjs';
import fs from 'fs';
const log=(...a)=>console.log(...a);
const { browser, page } = await abrirCalculadora();

try{
  await addProduto(page,'Compute Engine',log);

  const inputs = await page.evaluate(()=>{
    const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};
    return [...document.querySelectorAll('input,textarea')].filter(vis).filter(e=>e.type!=='range').map(e=>({
      type:e.type, id:e.id, name:e.name, value:e.value,
      al:e.getAttribute('aria-label'), albb:e.getAttribute('aria-labelledby'),
      albbTxt:(e.getAttribute('aria-labelledby')||'').split(' ').map(x=>document.getElementById(x)?.innerText.replace(/\n/g,' ')||'').join('|'),
      labelFor: e.id ? (document.querySelector(`label[for="${CSS.escape(e.id)}"]`)?.innerText.replace(/\n/g,' ')||'') : '',
      closest: (e.closest('label')?.innerText||'').replace(/\n/g,' ').slice(0,60),
      cls:e.className.slice(0,40)
    }));
  });
  fs.writeFileSync('probe-inputs.json',JSON.stringify(inputs,null,1));
  log('=== INPUTS (atributos crus) ==='); log(JSON.stringify(inputs,null,1));

  // opções reais do dropdown Series
  log('\n=== opções de Series ===');
  const c=page.getByRole('combobox',{name:/^Series$/}).locator('visible=true').first();
  log('combos Series encontrados:', await c.count());
  if(await c.count()){
    await c.click(); await page.waitForTimeout(1500);
    const o=await page.getByRole('option').locator('visible=true').evaluateAll(els=>els.map(e=>JSON.stringify({txt:(e.innerText||'').replace(/\n/g,' | '),al:e.getAttribute('aria-label')})).slice(0,30));
    log(o.join('\n'));
    await page.keyboard.press('Escape');
  }
}catch(e){ log('ERRO:',String(e).split('\n')[0]); }
finally{ await browser.close(); }
