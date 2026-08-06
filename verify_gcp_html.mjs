// Valida a calculadora HTML gerada: abre headless, confere o total renderizado contra o spec
// e testa se a edição de uma quantidade recalcula o total.
// Uso: node verify_gcp_html.mjs <arquivo.html> [spec.json]
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const arquivo = process.argv[2];
if(!arquivo){ console.error('uso: node verify_gcp_html.mjs <arquivo.html> [spec.json]'); process.exit(1); }
const spec = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3],'utf-8')) : null;

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:1400, height:1100 } });
const num = s => parseFloat(String(s).replace(/[^\d,.-]/g,'').replace(/\./g,'').replace(',','.'))||0;

try{
  await page.goto('file://'+path.resolve(arquivo),{ waitUntil:'domcontentloaded' });
  await page.waitForTimeout(800);

  const mes = await page.locator('#kMes').innerText();
  const ano = await page.locator('#kAno').innerText();
  const qtd = await page.locator('#kQtd').innerText();
  const rodape = await page.locator('#tTotal').innerText();
  console.log('mensal =', mes, '| anual =', ano, '| serviços =', qtd, '| total tabela =', rodape);

  if(mes !== rodape) console.log('!! KPI e rodapé divergem');
  if(spec){
    const esperado = spec.servicos.reduce((s,x)=>s+x.qtd*x.preco,0);
    const diff = Math.abs(num(mes)-esperado);
    console.log(`spec = $${esperado.toFixed(2)} | render = $${num(mes).toFixed(2)} | dif = $${diff.toFixed(2)}`,
      diff < 0.05 ? 'OK' : '<<< DIVERGENTE');
    if(Number(qtd) !== spec.servicos.length) console.log('!! contagem de serviços divergente');
  }

  // interatividade: dobrar a 1ª quantidade deve aumentar o total
  const antes = num(await page.locator('#kMes').innerText());
  const inp = page.locator('table input').first();
  await inp.fill(String(num(await inp.inputValue())*2 || 2));
  await page.waitForTimeout(400);
  const depois = num(await page.locator('#kMes').innerText());
  console.log(`interatividade: $${antes.toFixed(2)} -> $${depois.toFixed(2)}`, depois>antes ? 'OK' : '<<< NÃO RECALCULOU');

  await page.screenshot({ path: arquivo.replace(/\.html$/,'')+'-preview.png', fullPage:true });
  console.log('screenshot ->', arquivo.replace(/\.html$/,'')+'-preview.png');
} finally { await browser.close(); }
