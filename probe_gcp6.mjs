// Sonda 6: como os comboboxes se identificam no DOM (aria-label? labelledby?) e como trocar a região.
import { abrirCalculadora, addProduto, custoEstavel, dispensarBanners } from './gcp_lib.mjs';
import fs from 'fs';

const log=(...a)=>console.log(...a);
const { browser, page } = await abrirCalculadora();

try{
  await addProduto(page,'Compute Engine',log);
  log('custo inicial =', await custoEstavel(page));

  const combos = await page.evaluate(()=>{
    const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};
    return [...document.querySelectorAll('[role="combobox"]')].filter(vis).map(e=>({
      tag:e.tagName, al:e.getAttribute('aria-label'), albb:e.getAttribute('aria-labelledby'),
      albbTxt:(e.getAttribute('aria-labelledby')||'').split(' ').map(x=>document.getElementById(x)?.innerText||'').join('|'),
      cls:e.className, txt:(e.innerText||'').replace(/\n/g,' | ').slice(0,80)
    }));
  });
  fs.writeFileSync('probe-combos.json',JSON.stringify(combos,null,1));
  log('=== COMBOBOXES ==='); log(JSON.stringify(combos,null,1));

  // tentar trocar a região para São Paulo pelo texto atual do combo
  log('\n=== trocando região ===');
  const regCombo = page.getByRole('combobox').filter({ hasText:/Iowa|us-central1/i }).locator('visible=true').first();
  log('achou combo de região?', await regCombo.count());
  if(await regCombo.count()){
    await regCombo.scrollIntoViewIfNeeded().catch(()=>{});
    await regCombo.click(); await page.waitForTimeout(1500);
    await page.screenshot({path:'probe-08-region-open.png'});
    const opts=await page.getByRole('option').locator('visible=true').evaluateAll(
      els=>els.map(e=>(e.innerText||'').trim()).slice(0,25));
    log('primeiras opções:',JSON.stringify(opts));
    const inputs=await page.locator('[role="listbox"] input, input:visible').evaluateAll(
      els=>els.map(e=>({ph:e.placeholder,al:e.getAttribute('aria-label'),v:e.value})).slice(0,10));
    log('inputs abertos:',JSON.stringify(inputs));

    const sp=page.getByRole('option',{name:/S.o Paulo|southamerica-east1/i}).locator('visible=true').first();
    log('achou opção São Paulo?', await sp.count());
    if(await sp.count()){
      await sp.click(); await page.waitForTimeout(2500);
      log('custo após SP =', await custoEstavel(page));
      log('texto do combo agora:', (await regCombo.innerText().catch(()=>'')).replace(/\n/g,' | '));
    }
  }
  await page.screenshot({path:'probe-09-region-set.png',fullPage:false});
  log('URL:',page.url());
}catch(e){ log('ERRO:',String(e).split('\n').slice(0,4).join(' ')); }
finally{ await browser.close(); }
