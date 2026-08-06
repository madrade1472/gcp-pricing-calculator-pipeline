# gcp-pricing-calculator-pipeline

Gera estimativas **reais e compartilháveis** no [Google Cloud Pricing Calculator](https://cloud.google.com/products/calculator)
dirigindo a interface oficial com Playwright, e devolve a URL pública que qualquer pessoa abre sem
login.

Não é um simulador de preços nem uma reimplementação da tabela do Google. O preço vem do próprio
calculator, então ele acompanha as mudanças de tarifa sem que você mantenha nada.

```
proposta comercial (.docx, planilha, escopo técnico)
        │
        ▼   ← CABEÇA: ler o documento, derivar volumes, escolher produtos,
        │            traduzir nome comercial -> nome de catálogo, escrever o filler
  build_<caso>.mjs        a descrição da estimativa, em código
        │
        ▼   ← BRAÇO: daqui para baixo é determinístico
  gcp_lib.mjs             dirige a UI: catálogo, campos, dropdowns, região
        │
        ▼
  https://cloud.google.com/products/calculator?dl=<estimativa inteira>
        │
        ▼
  probe_gcp8.mjs          reabre o link e confere o que ficou salvo
```

## Este repositório é o braço, não a cabeça

Vale dizer isso logo, porque muda o que você espera daqui.

O que está neste repositório é **execução determinística**: dirigir a interface, preencher campo
por campo, contornar as armadilhas, gerar a URL e auditar o que ficou salvo. Isso roda com Node e
Playwright, sem IA nenhuma.

Só que um repositório vazio não estima coisa alguma. Para um caso novo, **alguém precisa escrever
o `build_<caso>.mjs`**, e é aí que está o trabalho de verdade:

- ler a proposta e derivar a volumetria — capturas por dia, tokens por chamada, GiB por mês;
- decidir quais produtos entram, e quais não têm equivalente no catálogo e precisam ficar de fora;
- traduzir nome comercial para nome de catálogo — Cloud Composer é `Managed Service for Apache
  Airflow`, Vertex AI generativo é `Agent Platform GenAI Models`;
- descobrir os rótulos reais dos campos daquele produto, rodando as sondas;
- montar o filler na ordem que não quebra, e justificar cada premissa que não veio do documento.

Esse trabalho é de interpretação, não de automação. Na prática, em todos os casos reais, quem fez
foi um agente de IA lendo o documento — o projeto nasceu assim. Um humano consegue fazer o mesmo,
lendo o [QUIRKS.md](QUIRKS.md) e as sondas, mas é laborioso e é exatamente onde os erros aparecem.

Resumindo: **rodar um build pronto não precisa de IA; produzir um build para uma proposta nova
precisa de alguém — ou algo — que entenda a proposta.** O [CLAUDE.md](CLAUDE.md) traz as instruções
para um agente conduzir esse processo de ponta a ponta.

## O link é anônimo, e é a própria URL

Diferente da calculadora da Azure, que exige conta Microsoft para salvar ou compartilhar, o Google
Cloud **codifica a estimativa inteira no parâmetro `?dl=`** da URL da página:

- Não existe botão "salvar". A URL na barra de endereços já é o link compartilhável, e ela se
  atualiza a cada mudança.
- O botão **Share** só abre um diálogo com "Copy link" e "Download .csv" — o link que ele copia é
  a mesma URL.
- Validado com round-trip em contexto limpo, sem cookies: a estimativa volta idêntica, com o mesmo
  total.

Duas consequências práticas na hora de entregar:

- **O link é longo e não pode ser quebrado.** Se quebrar a linha ao colar num e-mail ou PDF, abre
  vazio. Cole como hyperlink, não como texto solto.
- **Ele é imutável.** Se quem receber mexer num valor, a URL muda na barra de endereços e vira
  outra estimativa. A sua continua intacta.

## Instalação

```bash
npm install
npx playwright install chromium
```

Node 18+. Nenhuma credencial, nenhuma conta Google, nenhuma API key — o pipeline usa a página
pública. Isso vale para **executar** um build; para escrever um build novo a partir de uma
proposta, veja "Este repositório é o braço, não a cabeça", acima.

## Uso

### 1. Rodar o exemplo

```bash
node build_exemplo.mjs
```

Compute Engine + Cloud Storage + BigQuery em São Paulo. Ao final imprime a quebra de custos, o
total e o link, e revalida o link numa sessão limpa.

Para os casos difíceis — Gemini, Cloud Run, campos que revertem:

```bash
node build_avancado.mjs
```

### 2. Descobrir os campos do seu produto

Antes de escrever um filler, veja os rótulos reais do formulário:

```bash
node discover_forms.mjs "Cloud Storage" "BigQuery"     # -> forms_gcp.json
node probe_opcoes_dropdown.mjs                          # opções de cada dropdown
node list_catalogo.mjs                                  # -> catalogo_gcp.json, nomes exatos
```

`addProduto` casa o nome **exato** do catálogo, e ele nem sempre é o nome comercial: Cloud Composer
é `Managed Service for Apache Airflow`, Vertex AI generativo é `Agent Platform GenAI Models`.

### 3. Escrever o seu build

Copie `build_exemplo.mjs`, ajuste a lista `SERVICES` e os fillers. Um filler descreve **um** serviço:

```js
async function fCloudStorage(page){
  await setSelect(page, /^Storage class$/, /Standard Storage/i, log);
  await setSelect(page, /^Unit$/, /^GiB$/, log);
  await setRegiao(page, /southamerica-east1/i, log);
  await renomear(page, 'Data lake - 10 TiB Standard', log);      // <= 36 caracteres
  await fixarNumericos(page, { 'Total amount of storage':10 });   // números por último
}
```

A ordem não é estética. **Dropdowns → renomear → campos numéricos**, sempre. Trocar um dropdown
re-renderiza o bloco e descarta o que foi digitado; renomear também remonta o bloco. Números por
último, e conferidos duas vezes.

### 4. Auditar antes de entregar

```bash
node probe_gcp8.mjs "https://cloud.google.com/products/calculator?dl=..."
```

Isto reabre a estimativa, expande cada serviço e imprime **como cada campo ficou salvo**.

Não pule. Num caso real, um build que logou tudo certo produziu dois totais errados — US$ 101,07 e
US$ 72,52 — antes do valor correto de US$ 74,47. Os três passaram pela validação de link sem
reclamar, porque o link estava íntegro. O que estava errado era o conteúdo dele.

## Por que a automação precisa desconfiar de si mesma

O calculator falha de um jeito específico: **ele registra sucesso e devolve o número errado.** Não
lança exceção, não pinta o campo de vermelho, não avisa. Alguns exemplos reais:

- Um campo de storage voltou de 20 para 100 GiB **depois** de ter sido confirmado duas vezes. O
  item foi de US$ 0,40 para US$ 27,00, sem uma linha no log.
- O BigQuery tem dois comboboxes chamados `Location`. Selecionar pelo rótulo pega o errado, troca
  o tipo de localização, deixa a região em Iowa — e o clique ainda encontra alguma opção, então o
  log dá sucesso.
- O Cloud Run trava o volume em 10 milhões de requisições/mês sob qualquer use case pré-definido.
  Numa PoC, isso é um erro de três ordens de grandeza que não aparece em lugar nenhum.

Daí as três regras que o código todo segue:

1. **Escrever, e depois reler.** `fillVerify` confere duas vezes, a segunda com o elemento
   consultado de novo após o debounce. `setSelect` relê o valor do combobox depois de clicar.
2. **Logar o custo por serviço, não só o acumulado.** Um valor absurdo se esconde dentro de um
   acumulado grande; sozinho, salta aos olhos.
3. **Auditar o link, não o log.** O log diz o que o script tentou. A auditoria diz o que ficou.

O catálogo completo de armadilhas está em **[QUIRKS.md](QUIRKS.md)** — cada uma custou uma
estimativa errada ou horas de sondagem. Leia antes de escrever um filler novo.

## Helpers (`gcp_lib.mjs`)

| Helper | Papel |
|---|---|
| `abrirCalculadora()` | Abre o calculator e dispensa banners de cookie, login e chat |
| `addProduto(page, nome)` | "Add to estimate" → busca → clica no card, com três estratégias de clique |
| `fillVerify(page, rotulo, valor)` | Preenche um campo numérico e relê duas vezes |
| `fillMany(page, campos)` | Preenche vários campos e reconfere **todos** em passadas, até estabilizar |
| `setSelect(page, rotuloRe, opcaoRe)` | Escolhe opção de dropdown e relê o valor selecionado |
| `setRegiao(page, regiaoRe)` | Define a região localizando o combobox pelo valor atual, não pelo rótulo |
| `renomear(page, nome)` | Renomeia o serviço recém-adicionado |
| `custoEstavel(page)` | Espera o total do painel parar de oscilar |
| `lerItens(page)` | Quebra de custos por grupo |
| `pegarLink(page)` | Devolve a URL `?dl=...` |
| `validarLink(url)` | Reabre o link em contexto limpo e confere o total |

`fillMany` existe porque confirmar campo a campo não basta: preencher B remonta o bloco e reverte
A, e a checagem de A já tinha passado. A única forma confiável é reler o conjunto inteiro depois de
mexer em tudo e recolocar o que saiu do lugar.

## Sondas

Scripts de descoberta que mapeiam a UI. Sirvam também de registro do que já foi verificado — antes
de concluir que algo é impossível, vale olhar aqui.

| Sonda | O que investiga |
|---|---|
| `discover_forms.mjs` | Campos e dropdowns por produto → `forms_gcp.json` |
| `list_catalogo.mjs` | Os 62 nomes exatos do catálogo → `catalogo_gcp.json` |
| `probe_opcoes_dropdown.mjs` | As opções que cada dropdown realmente aceita |
| `probe_gemini_blocos.mjs` | Casa cada bloco do form Gemini com o modelo a que pertence |
| `probe_gcp8.mjs` | **Auditoria**: reabre um link e imprime o que ficou salvo |
| `probe_gcp1..12.mjs` | Sondas de descoberta da UI (catálogo, formulários, share, round-trip, região, Composer) |

## Entrega alternativa: calculadora HTML

Quando quem recebe precisa ajustar parâmetros sem depender do calculator oficial:

```bash
node gen_gcp_html.mjs minha-estimativa.json calculadora.html
node verify_gcp_html.mjs calculadora.html
```

Spec do JSON:

```json
{
  "titulo": "...", "subtitulo": "...", "regiao": "southamerica-east1",
  "link_oficial": "https://cloud.google.com/products/calculator?dl=...",
  "rodape": "...",
  "servicos": [
    { "categoria": "Dados", "servico": "BigQuery", "detalhe": "on-demand",
      "qtd": 500, "unidade": "GiB", "preco": 3.13 }
  ]
}
```

Os serviços são agrupados por `categoria`, na ordem em que aparecem no array. O campo
`link_oficial` aceita a URL `?dl=` gerada pelo pipeline, ligando as duas entregas.
Exemplo pronto: `gcp_teste.json` → `calculadora_gcp_teste.html`.

## Estrutura

```
gcp_lib.mjs              helpers de UI — toda a lógica difícil mora aqui
build_exemplo.mjs        template básico (Compute Engine, Cloud Storage, BigQuery)
build_avancado.mjs       Gemini, Cloud Run e proteção contra reversão de campo
discover_forms.mjs       mapeia campos por produto        -> forms_gcp.json
list_catalogo.mjs        nomes exatos do catálogo         -> catalogo_gcp.json
probe_*.mjs              sondas de descoberta e auditoria
gen_gcp_html.mjs         gerador da calculadora HTML offline
verify_gcp_html.mjs      valida o HTML gerado
QUIRKS.md                catálogo de armadilhas da UI
```

Os `build_*.mjs` só descrevem a estimativa. Toda a lógica de UI fica em `gcp_lib.mjs` — ao
encontrar uma armadilha nova, corrija lá e documente em `QUIRKS.md`, em vez de espalhar gambiarra
pelos builds.

## Limitações

- Depende do DOM do calculator. Se o Google mudar a interface, os seletores quebram — as sondas
  existem para remapear rápido.
- Nem todo produto está no catálogo. Eventarc, IAP, Cloud IAM, Cloud Scheduler, Datastream, Data
  Fusion e Looker não aparecem e precisam ser estimados por fora.
- Os preços saem sem desconto de uso comprometido, a menos que você defina explicitamente.
- Uma estimativa de 12 serviços leva de 10 a 15 minutos, porque cada campo é escrito e reconferido.
  A lentidão é proposital.

## Licença

MIT.
