// Gerador de calculadora GCP (HTML interativo auto-hospedável) a partir de um spec JSON.
// Uso: node gen_gcp_html.mjs <spec.json> [saida.html]
// Alternativa ao link oficial quando o cliente quer ajustar parâmetros sem depender do calculator.
import fs from 'fs';

const specPath = process.argv[2];
if(!specPath){ console.error('uso: node gen_gcp_html.mjs <spec.json> [saida.html]'); process.exit(1); }
const spec = JSON.parse(fs.readFileSync(specPath,'utf-8'));
const out = process.argv[3] || specPath.replace(/\.json$/,'').replace(/(^|\/)([^\/]+)$/,'$1calculadora_gcp_$2') + '.html';

const total = spec.servicos.reduce((s,x)=>s + (x.qtd*x.preco),0);

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${spec.titulo}</title>
<style>
  :root{ --bg:#0b1220; --panel:#121a2b; --panel2:#1a2438; --line:#26324a; --txt:#eaf0fb; --muted:#93a1bd;
    --gcp:#1a73e8; --gcp2:#5ea9ff; --ok:#37d399; --amber:#fbbc04; }
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--txt);line-height:1.5}
  header{padding:26px 32px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,#101a2e,#0b1220)}
  header h1{margin:0;font-size:19px;font-weight:650}
  header p{margin:5px 0 0;color:var(--muted);font-size:13px}
  .badge{display:inline-block;background:var(--gcp);color:#fff;font-size:11px;font-weight:700;padding:2px 9px;border-radius:4px;margin-right:8px;letter-spacing:.5px}
  .kpis{display:flex;gap:16px;flex-wrap:wrap;padding:22px 32px 4px}
  .kpi{flex:1;min-width:180px;background:linear-gradient(160deg,#16223a,#111a2c);border:1px solid var(--line);border-radius:12px;padding:16px 18px}
  .kpi .lbl{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px}
  .kpi .val{font-size:26px;font-weight:700;margin-top:4px;font-variant-numeric:tabular-nums}
  .kpi .val.gcp{color:var(--gcp2)} .kpi .val.ok{color:var(--ok)}
  .wrap{padding:18px 32px 40px;overflow-x:auto}
  table{width:100%;border-collapse:collapse;font-size:13px;background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden;min-width:760px}
  th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums}
  th{color:var(--muted);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.5px;background:var(--panel2)}
  td.num,th.num{text-align:right}
  tr:last-child td{border-bottom:none}
  tr.cat td{background:#0f1830;color:var(--gcp2);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
  input{width:90px;background:var(--panel2);border:1px solid var(--line);color:var(--txt);padding:6px 8px;border-radius:6px;font-size:13px;text-align:right;font-variant-numeric:tabular-nums}
  input:focus{outline:none;border-color:var(--gcp2)}
  tfoot td{border-top:2px solid var(--line);font-weight:700;font-size:15px;background:var(--panel2)}
  .sub{color:var(--muted);font-size:12px}
  footer{padding:16px 32px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}
  a{color:var(--gcp2)}
  .reset{margin:14px 0;background:var(--gcp);border:none;color:#fff;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer}
  .oficial{display:inline-block;margin:14px 0 14px 10px;color:var(--gcp2);font-size:13px}
</style>
</head>
<body>
<header>
  <h1><span class="badge">Google Cloud</span>${spec.titulo}</h1>
  <p>${spec.subtitulo||''} · ${spec.regiao||''}</p>
</header>
<div class="kpis">
  <div class="kpi"><div class="lbl">Custo mensal estimado</div><div class="val gcp" id="kMes">—</div></div>
  <div class="kpi"><div class="lbl">Custo anual estimado</div><div class="val ok" id="kAno">—</div><div class="sub">12 meses</div></div>
  <div class="kpi"><div class="lbl">Serviços</div><div class="val" id="kQtd">—</div></div>
</div>
<div class="wrap">
  <button class="reset" onclick="resetDefaults()">↺ Restaurar valores padrão</button>
  ${spec.link_oficial?`<a class="oficial" href="${spec.link_oficial}" target="_blank">Abrir no Google Cloud Pricing Calculator ↗</a>`:''}
  <table>
    <thead><tr><th>Serviço</th><th>Detalhamento</th><th class="num">Qtde</th><th>Unidade</th><th class="num">Preço unit. (US$)</th><th class="num">Subtotal/mês (US$)</th></tr></thead>
    <tbody id="body"></tbody>
    <tfoot><tr><td colspan="5">Total mensal estimado (Google Cloud ${spec.regiao||''})</td><td class="num" id="tTotal">—</td></tr></tfoot>
  </table>
</div>
<footer>
  ${spec.rodape||'Valores estimados de lista (on-demand). O consumo real e descontos (CUD, sustained use, contratos) podem alterar o total.'}
  · Referência: <a href="https://cloud.google.com/products/calculator" target="_blank">Google Cloud Pricing Calculator</a>
</footer>
<script>
const SERVICOS = ${JSON.stringify(spec.servicos)};
const $=id=>document.getElementById(id);
const usd=n=>'$'+n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
function render(){
  const b=$('body'); b.innerHTML='';
  let cat=null;
  SERVICOS.forEach((s,i)=>{
    if(s.categoria!==cat){ cat=s.categoria; const r=document.createElement('tr'); r.className='cat'; r.innerHTML='<td colspan="6">'+cat+'</td>'; b.appendChild(r); }
    const tr=document.createElement('tr');
    tr.innerHTML='<td>'+s.servico+'</td><td class="sub">'+(s.detalhe||'')+'</td>'+
      '<td class="num"><input type="number" step="any" value="'+s.qtd+'" oninput="upd('+i+',\\'qtd\\',this.value)"></td>'+
      '<td class="sub">'+(s.unidade||'')+'</td>'+
      '<td class="num"><input type="number" step="any" value="'+s.preco+'" oninput="upd('+i+',\\'preco\\',this.value)"></td>'+
      '<td class="num" id="sub'+i+'"></td>';
    b.appendChild(tr);
  });
  calc();
}
function upd(i,k,v){ SERVICOS[i][k]=parseFloat(v)||0; calc(); }
function calc(){
  let total=0;
  SERVICOS.forEach((s,i)=>{ const st=s.qtd*s.preco; total+=st; const el=$('sub'+i); if(el) el.textContent=usd(st); });
  $('tTotal').textContent=usd(total);
  $('kMes').textContent=usd(total);
  $('kAno').textContent=usd(total*12);
  $('kQtd').textContent=SERVICOS.length;
}
const DEFAULTS=JSON.parse(JSON.stringify(SERVICOS));
function resetDefaults(){ DEFAULTS.forEach((d,i)=>{SERVICOS[i]={...d}}); render(); }
render();
</script>
</body>
</html>`;

fs.writeFileSync(out, html);
console.log('OK ->', out, '| total mensal spec =', '$'+total.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}));
