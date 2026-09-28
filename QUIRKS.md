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

### A região pode voltar ao padrão com o build logando a certa

Cloud Run já foi salvo em `europe-west1 (Belgium)` e Memorystore em `Iowa (us-central1)`, os dois
pedidos em us-east4, com o log mostrando a região correta. O mesmo vale para o tipo de boot disk
(`balanced-persistent-disk`, `ssd-persistent-disk`). Só a auditoria pegou. Quando a estimativa
tiver muitos serviços, planeje um passe final de correção de região sobre o link pronto.

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

### Cloud Run: o volume reverte para 10 milhões mesmo com `Custom`

Não é o caso do use case acima. Com `Custom` aplicado, o `setSelect` relê "100,000" e loga
sucesso; o filler pode reafirmar o volume três vezes seguidas, todas confirmadas, e a estimativa
salva continua com 10 milhões. A reversão não acontece no filler, e sim adiante, quando os
produtos seguintes são adicionados. O que funciona é **um passe final sobre a estimativa já
montada**, percorrendo os botões `Edit` e reaplicando o volume. Só a auditoria do link pega isso.

### Não dá para saber qual serviço está aberto no painel de `Edit`

Os campos "Rename" de todos os serviços coexistem no DOM e todos passam no teste de visibilidade;
o rename mais próximo do painel na vertical pode ser de outro serviço, e o ancestral do painel não
contém rename nenhum. A ordem dos botões `Edit` também não é a ordem de adição. Para corrigir
vários serviços do mesmo produto, identifique o painel pelo conteúdo dele (a presença de um campo
específico) ou **aplique o mesmo valor a todos**, para que a identificação deixe de importar.

### Cloud Run não tem campo de vCPU nem de memória

Nem com `Custom`. Os radios `service` / `job` / `worker_pool` / `instance` só trocam o dropdown de
volume (`Number of requests per month`, ou `Number of executions per month` com
`Execution time per task`); `worker_pool` dá um valor fixo de cerca de US$ 31. Nenhum aceita
vCPU-hora, então um contêiner sempre ligado (o equivalente a Fargate ou App Runner) não se
espelha pelo calculator. Declare a diferença por fora, a preço de lista.

### Compute Engine: instâncias e tempo de uso são acoplados

`Total instance usage time` é o total **somado** de todas as instâncias, não por VM. Subir as
instâncias para 2 faz o calculator reescrever o tempo para 1460 sozinho. Preencher os dois cria um
cabo de guerra: o filler ajusta o tempo para 730, o calculator derruba as instâncias para 1, e o
item sai pela metade do preço. **Preencha só `Number of instances`.**

### Compute Engine: Spot é radio sem nome, e o clique no pai não marca

O modelo de provisionamento (`value="regular"` / `value="spot"`) é `input[type=radio]` sem nome
acessível; não existe combobox "Provisioning model". Clicar no elemento pai do input loga
"clicado", o radio continua desmarcado e o nó entra a preço regular, sem erro. O que marca é
clicar no **texto visível**:

```js
await page.getByText(/^Spot \(Preemptible VM\)/).first().click();
// sempre reler depois
await page.locator('input[value="spot"]').first().isChecked();
```

Uma `n2-highmem-8` em us-east4 cai de US$ 431,93 para US$ 109,34.

### Preço de Spot não acompanha o on-demand entre regiões

Para `n2-highmem-8`, 10 nós on-demand custam US$ 6.671/mês em São Paulo e US$ 4.420 em us-east1,
como esperado. Mas o nó **spot** custa US$ 188,67/mês em São Paulo contra US$ 288,89 em us-east1:
28% do on-demand lá e 65% aqui. Um cenário com muito spot pode sair **mais barato em São Paulo**,
ao contrário de todo o resto. Não assuma que us-east1 é sempre mais barato; meça. E como preço
spot varia, confira contra a tabela publicada antes de fechar.

### `Prediction` sem acelerador abre uma cascata de três dropdowns

Com `Accelerator Type = No accelerator` aparecem `Machine Family` → `Series` → `Machine type`,
todos vazios. As opções de cada nível só carregam depois que o pai é escolhido. Pedir
`Machine type` direto acha o combobox, não acha opção nenhuma, e o item entra custando US$ 0,00
sem erro fatal. Percorra os três na ordem.

### BigQuery Editions: três jeitos de invalidar o item em silêncio

- **`Slot commitments` é QUANTIDADE de slots, não prazo**, e precisa ser maior ou igual a
  `Baseline slots`. O asterisco faz parecer o campo de compromisso de 1 ou 3 anos. Preencher 0
  achando que é "sem compromisso" faz o item custar `?`, e o **total da estimativa inteira** vira
  `?` junto. A partir daí todo delta por serviço é lido como zero.
- **`Maximum slots` menor que `Baseline slots` zera o item.** O dropdown vem em
  `Medium (200 slots)`. Com baseline de 500 o serviço some da quebra de custos, o delta dele é
  US$ 0,00 e o total continua plausível; aqui o total **não** vira `?`, então a checagem de total
  inválido não pega. Opções: Small (100), Medium (200), Large (400), XL (800), 2XL (1600),
  3XL (3200), 4XL (6400) e `Specify a custom amount`. Escolha a faixa acima do baseline antes dos
  números, e ancore o regex (`/^XL \(800 slots\)/`): `/XL/` solto casa 2XL, 3XL e 4XL. Num caso
  real, esse erro deixou a estimativa em US$ 32.923/mês em vez de US$ 87.926.
- **Edição e prazo de compromisso são radios sem nome**, fora de `forms_gcp.json`: valores
  `standard` / `enterprise` / `enterprisePlus` e `0` / `1` / `3` anos. O padrão já vem
  **Enterprise com 1 ano**. Marcar o input com `check({force:true})` não muda nada; é preciso
  clicar no elemento pai visível (ao contrário do Compute Engine, onde o pai não funciona).

### Dataproc: duas variantes, rótulos repetidos e um nome novo

- `Service type` tem `Dataproc Serverless for Spark` (padrão) e `Dataproc on GCE/GKE`. O nome traz
  a barra: `/on GKE/` não casa, use `/GCE.GKE/i`.
- Na variante GCE/GKE, `Machine Family`, `Series` e `Machine type` aparecem duas vezes, para o
  master e para o worker, com nome acessível idêntico. `setSelect` pega sempre o primeiro e deixa
  o worker em `n1-standard-4`, sem aviso. Enderece pela ordem de ocorrência
  (`getByRole('combobox', {name}).nth(1)` para o worker). Os dropdowns de SSD local, ao contrário,
  se distinguem pelo rótulo (`per Master Node` / `per Worker Node`).
- Só a variante GCE/GKE expõe workers spot, SSD local e desconto de uso comprometido.
- **No modal de busca o produto virou `Managed Service for Apache Spark`**, mas a grade do
  catálogo ainda mostra `Dataproc`. `addProduto(page, 'Dataproc')` falha sempre com "produto não
  encontrado" e o build segue sem o serviço, com total plausível. Quando um nome do catálogo
  falhar, sonde o modal em vez de confiar só em `catalogo_gcp.json`, e procure `ERRO:` no log.
- **A variante serverless perdeu o dropdown `Period`**: `Usage time` passou a ser horas **por
  mês**. Um filler antigo (`Unit` Hours, `Period` Day, 8) grava 8 h/mês, e o item sai por
  US$ 4,37 em vez de cerca de US$ 131. Preencha já multiplicado pelos dias (8 x 30 = 240).

### Cloud SQL: sem alta disponibilidade, e a licença pesa mais que a máquina

Os radios do formulário são só a edição (`enterprise` / `enterprisePlus`) e o disco
(`ssd` / `hdd`); não há opção de HA. Para espelhar um RDS Multi-AZ, dobre as instâncias (primária
e standby são cobradas) e some o storage das duas cópias. **SQL Server tem dropdown
`License type`** (Express, Web, Standard, Enterprise; padrão Standard): 2x `db-standard-2` com
600 GiB cada em us-east4 custam US$ 1.188,67 em SQL Server contra US$ 429,47 em MySQL. Modelar um
SQL Server como MySQL tira cerca de US$ 380 por instância de 2 vCPU, sem aviso.

### Networking: rótulo por substring casa o campo errado

`fillMany` casa rótulo por substring, e "Amount of data" também casa "Amount of data processed"
do Cloud NAT. Com um NAT e dois itens de Data Transfer na mesma estimativa, o valor foi para o
campo errado e o egress saiu por US$ 339 em vez de US$ 194. Para Data Transfer, case o rótulo
exato (`/^Amount of data( info)?$/`). O formulário tem dois blocos com rótulos repetidos: o
primeiro (`Unit` TiB, origem e destino por continente) é egress para a internet; o segundo
(`Unit` PiB, por região) é tráfego entre regiões Google. Referência: 61 TiB de us-east4 para North
America = US$ 5.314,56.

O `Networking` não tem Private Service Connect: só IP Address, Data Transfer, NAT Gateway (radios
`public-nat` / `private-nat`) e Cloud Load Balancing.

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
| Dataproc | `Managed Service for Apache Spark` (no modal de busca) |

Não existem no catálogo, e precisam ser estimados por fora: Datastream, Data Fusion, Looker e
Looker Studio Pro, Cloud Scheduler, Eventarc, Identity-Aware Proxy, Cloud IAM.

A lista completa está em `catalogo_gcp.json`; regenere com `node list_catalogo.mjs`.

### Databricks no GCP em São Paulo não tem serverless

Não é do calculator, mas decide a região de qualquer cenário Databricks no GCP: em
`southamerica-east1` faltam serverless (SQL warehouses, jobs, pipelines), Lakeflow Connect, Model
Serving e Genie (docs.databricks.com/gcp/en/resources/feature-region-support, set/2026). Os DBUs
não existem no catálogo do calculator; some por fora.
