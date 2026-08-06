# Armadilhas do Google Cloud Pricing Calculator

Cada item aqui custou uma estimativa errada ou horas de sondagem. O padrão comum é o pior possível:
**a automação registra sucesso e o número sai errado.** Nenhuma destas falhas gera exceção.

## As que mais custam dinheiro

### Um campo numérico pode reverter DEPOIS de confirmado

O caso mais perigoso do calculator. Você preenche, relê, confere, o valor está lá — e algum tempo
depois o campo volta ao padrão, sem aviso. É não determinístico: o mesmo script produziu o valor
certo numa execução e o errado na seguinte.

Dois casos reais, na mesma estimativa:

| Serviço | Quis | Ficou | Efeito |
|---|---|---|---|
| Cloud Logging | 20 GiB | 100 GiB (padrão) | US$ 0,40 → US$ 27,00 |
| Artifact Registry | 20 GiB | vazio | US$ 1,95 → US$ 0,00 |

O que segura: a ordem **dropdowns → renomear → campos numéricos**, com o preenchimento repetido
**duas vezes**, a segunda depois de ~2,5 s. Renomear é o que remonta o bloco, então precisa vir
ANTES dos números, não depois. Ver `fixarNumericos` em `build_avancado.mjs`.

### A unidade multiplica em silêncio

Em Cloud Storage o padrão é `5000 GiB`. Trocar a unidade para `TiB` sem corrigir a quantidade
vira 5000 TiB, e o total salta para cerca de US$ 179.000/mês. Defina quantidade **e** unidade
juntas, e confira o total depois.

### A região padrão é Iowa, e ela não se propaga

O padrão é `us-central1`, não a sua região. Defina a região **por serviço**. São Paulo custa
bem mais: uma `n4-standard-2` vai de US$ 67,01 para US$ 106,41.

### Preços de lista, sem desconto de uso comprometido

"Committed use discount options" fica em `None`. Se a sua estimativa assume compromisso de 1 ou
3 anos, defina explicitamente — muda o total entre 20% e 55%.

## As que fazem o seletor mentir

### Os campos não têm `aria-label`

Inputs e dropdowns usam **`aria-labelledby`** apontando para um `<span>`. Seletores como
`input[aria-label*="..."]` falham em silêncio. Use `getByLabel` / `getByRole('combobox', {name})`,
que resolvem o nome acessível.

### O nome acessível da opção inclui a segunda linha

A opção "N4" tem nome `"N4 Flexible & cost-optimized"`. São Paulo aparece como
`"Low CO2 Sao Paulo (southamerica-east1)"`, sem acento. Regex com `$` no fim **não casa** —
ancore só no início (`/^N4\b/`) ou use um trecho sem âncora.

### Rótulos de dropdown se repetem dentro do mesmo formulário

O BigQuery tem DOIS comboboxes chamados `Location`: o primeiro é o *tipo* (`Region`/`Multi-region`)
e o segundo é a região. Selecionar pelo rótulo pega o primeiro, troca o tipo, deixa a região em
Iowa — **e ainda assim o clique acha alguma opção, então o log dá sucesso.** Por isso `setSelect`
relê o valor depois de selecionar, e `setRegiao` localiza o combobox pelo VALOR ATUAL.

### O ID da região nem sempre está entre parênteses

A maioria dos produtos mostra `Low CO2 Sao Paulo (southamerica-east1)`. O Cloud Run inverte:
`europe-west1 (Belgium) - Tier 1`, com a **cidade** nos parênteses. Um seletor que exigisse o id
dentro dos parênteses não achava combobox nenhum no Cloud Run e deixava o serviço na Bélgica, com
apenas um aviso no log. Case o id solto, e **sempre pelo ID**, nunca pelo nome da cidade.

### Cards duplicados no DOM

O catálogo tem cópias ocultas do card de cada produto. Filtre com `.locator('visible=true')` antes
de clicar, senão o clique estoura por timeout.

### Ao repetir um produto, escope a busca ao modal

A partir do segundo serviço, o nome do produto também aparece no painel lateral de custos. Um
`getByText('BigQuery')` global casa com o texto do painel — visível, mas não clicável — e o clique
estoura por timeout exatamente quando você adiciona um produto que já está na estimativa.
`addProduto` resolve escopando em `[role="dialog"]`.

## Formulários com comportamento próprio

### `Gemini Models` empilha um bloco por modelo, sem dropdown de modelo

São nove blocos (Gemini 3.5 Flash, 3.1 Pro, 3.1 Flash-Lite, 2.5 Pro, 2.5 Flash, 2.5 Flash Lite,
2.5 Flash Live, 2.5 Pro Thinking, 2.5 Flash Thinking) e **todos** têm campos com os mesmos rótulos
(`Requests per day`, `Average input tokens for image`). `getByLabel` pega sempre o primeiro bloco.

Subir na árvore do DOM não resolve: o ancestral comum engloba a lista inteira e todo bloco devolve
o mesmo título. Case **por posição vertical** — a caixa de cada input contra o cabeçalho de modelo
imediatamente acima. Ver `probe_gemini_blocos.mjs` (mapeia) e `fillGemini` em `build_avancado.mjs`.

Cuidado também com regex frouxa no `Service type`: `/gemini/i` casa **"Gemini Image Models"** antes
de "Gemini Models".

### Cloud Run: um use case pré-definido trava o volume em 10 milhões

O Cloud Run não tem nenhum campo numérico. CPU, memória e concorrência vêm do `Use case`, e o
volume vem de um dropdown. Com qualquer use case pré-definido, esse dropdown abre com **zero
opções** e fica travado em 10 milhões de requisições/mês. Só `Custom: User-defined configuration`
libera a escolha. Num cenário de PoC isso é um erro de três ordens de grandeza.

A região padrão dele também é `europe-west1 (Belgium)`, não `us-central1`.

### Composer/Airflow: dois campos zeram o item sem erro

- **Não toque em `Airflow database storage`.** Qualquer valor acima do padrão (1 GiB) invalida o
  item, que passa a custar **US$ 0** sem erro visível. O ganho seria de centavos; o prejuízo é o
  serviço inteiro sumir do total.
- **Memória fora da razão do mCPU zera o item.** 4 GiB com os 0,5 mCPU padrão deixa o serviço
  inválido, e ele entra na estimativa custando US$ 0 enquanto o total continua plausível. Suba o
  dropdown `1000 mCPU per Airflow <componente>` para 1 antes de preencher a memória.

### BigQuery tem On-Demand além de Editions

Editions começa em 100 slots baseline (cerca de US$ 2 mil/mês) e fica duas ordens de grandeza acima
do necessário para cargas pequenas. `Service type` → `On-Demand` expõe `Amount of data queried` e
`Active logical storage`, com **duas** dropdowns `Unit` (índice 0 = consulta, índice 1 = storage).

### Cloud Vision não expõe face detection

Os campos são Label, Text, Landmark, Logo, Image Properties e Object Localization. Face detection
é tarifada na mesma faixa que **Label Detection** (US$ 1,50/1.000), enquanto **Object Localization
é mais cara** (US$ 2,25/1.000). Lançar volume de faces em Object Localization superestima em 50%.

## Nomes de item

### Renomear NÃO muda o painel lateral de custos

O painel "Cost details" mostra sempre o nome do produto — "Cloud Run", "Generative AI", "BigQuery" —
renomeado ou não. O nome customizado aparece no **card do serviço dentro da estimativa**, que é o
que a pessoa lê ao abrir o link compartilhado.

Ainda vale renomear, sobretudo quando o mesmo produto se repete: sem isso quem abre o link vê três
"Cloud Run" e dois "Generative AI" indistinguíveis.

### O campo "Rename" trunca em 36 caracteres, em silêncio

Nomes maiores entram cortados no meio da palavra.

### Os campos "Rename" de todos os serviços coexistem no DOM

E a ordem deles **não** é a ordem de adição. Pegar `.last()` renomeia um serviço qualquer: numa
estimativa de 12 itens, 5 ficaram com o nome padrão e o log deu sucesso em todos.

Como se renomeia cada serviço logo após adicioná-lo, existe exatamente um campo ainda com nome
padrão — e nomes padrão nunca contêm `" - "`. É esse o critério que `renomear` usa.

## Leitura do resultado

### O painel às vezes não renderiza o nome do item

Só o valor. O **total do grupo** (cabeçalho em CAIXA ALTA) é a leitura confiável.

### Logue o custo POR serviço, não só o acumulado

Um valor absurdo se esconde dentro de um acumulado grande. Sozinho, salta aos olhos.

### Auditar é obrigatório

`node probe_gcp8.mjs "<url>"` reabre a estimativa, expande cada serviço e imprime como cada campo
ficou salvo. É a única checagem que pega uma configuração que "logou sucesso" mas não aplicou.

Num caso real, um build que logou tudo certo produziu dois totais errados — US$ 101,07 e US$ 72,52 —
antes do valor correto de US$ 74,47. Os três passaram pela validação de link sem reclamar, porque o
link estava íntegro; o que estava errado era o conteúdo dele.

## Nomes de catálogo

`addProduto` casa por texto exato. O nome comercial nem sempre é o nome do catálogo:

| Nome usual | Nome no catálogo |
|---|---|
| Vertex AI (modelos generativos) | `Agent Platform GenAI Models` |
| Vertex AI (endpoints / treino) | `Prediction` e `Training` |
| Cloud Composer | `Managed Service for Apache Airflow` |
| Cloud Logging / Cloud Monitoring | `Cloud Operations` |
| Memorystore | `Cloud Memorystore` |
| Kafka gerenciado | `Managed Service for Apache Kafka` |
| Discos (PD / Hyperdisk) | `Hyperdisk and Persistent Disk` |
| VPC, balanceador, NAT | `Networking` |

Não existem no catálogo, e precisam ser estimados por fora: Datastream, Data Fusion, Looker e
Looker Studio Pro, Cloud Scheduler, Eventarc, Identity-Aware Proxy, Cloud IAM.

A lista completa está em `catalogo_gcp.json`; regenere com `node list_catalogo.mjs`.
