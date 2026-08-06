# Instruções para um agente conduzir este pipeline

Este arquivo é lido automaticamente por agentes de código como o Claude Code. Ele descreve o
trabalho que **não** é determinístico: transformar uma proposta comercial em uma estimativa
correta no Google Cloud Pricing Calculator.

O código deste repositório executa. Quem interpreta o documento e escreve o `build_<caso>.mjs`
é você.

## O que você recebe e o que precisa entregar

**Recebe:** um documento de proposta, escopo técnico ou planilha de dimensionamento, apontado por
caminho ou pela pasta atual.

**Entrega, sempre nesta forma:**

1. o link `https://cloud.google.com/products/calculator?dl=...`, validado em sessão limpa;
2. a tabela de custos, serviço a serviço;
3. o total mensal e o anual;
4. as diferenças em relação à proposta, explicadas de forma honesta — região, unidade, desconto de
   uso comprometido, arredondamento, premissa que você inventou por não estar no documento.

O item 4 não é opcional. Uma estimativa que esconde de onde veio cada número é pior que nenhuma.

## Antes de escrever qualquer linha

**Leia o [QUIRKS.md](QUIRKS.md) inteiro.** Ele documenta armadilhas que não são óbvias e que
produzem número errado **em silêncio** — campos sem `aria-label`, rótulos de dropdown duplicados
dentro do mesmo formulário, região padrão em Iowa, unidade que multiplica o total, nomes de
catálogo diferentes dos comerciais, campos que revertem depois de confirmados. Reaprender isso na
marra custa horas e produz número errado sem avisar.

## Passos

### 1. Extrair e ler a proposta

Extraia o texto do `.docx` (descompactar e ler `word/document.xml` costuma bastar). Procure a
seção de custos de nuvem, o escopo técnico e a lista de recursos.

**Valide a matemática da proposta antes de automatizar:** volume × preço unitário tem que bater
com os subtotais. Se a seção de custos estiver em branco — comum, quando ela remete ao Pricing
Calculator — diga isso explicitamente e derive a volumetria dos parâmetros declarados no resto do
documento (frequência de captura, dias, usuários, GiB, chamadas por dia).

### 2. Documentar a volumetria antes de codificar

Escreva um arquivo de volumetria com três blocos separados:

- **parâmetros declarados na proposta**, com a seção de onde saiu cada um;
- **premissas de engenharia** que você adotou porque o documento não diz;
- **a derivação**, passo a passo, de cada número que vai entrar no calculator.

Isso não é burocracia. É o que permite alguém contestar uma premissa sua sem refazer a conta
inteira, e é de onde sai a explicação honesta do item 4.

Se o documento admitir mais de um cenário, modele os dois e diga qual está no link.

### 3. Descobrir os campos antes de escrever o filler

```bash
node list_catalogo.mjs                     # nomes exatos -> catalogo_gcp.json
node discover_forms.mjs "<Produto>"        # campos e dropdowns -> forms_gcp.json
node probe_opcoes_dropdown.mjs             # o que cada dropdown realmente aceita
```

`addProduto` casa o nome **exato** do catálogo. Nome errado estoura com "produto não encontrado".

Nem todo produto existe no catálogo. Eventarc, IAP, Cloud IAM, Cloud Scheduler, Datastream, Data
Fusion e Looker não aparecem — liste-os separadamente com a justificativa de custo, em vez de
omitir.

### 4. Escrever o build

Copie `build_exemplo.mjs` (básico) ou `build_avancado.mjs` (Gemini, Cloud Run, campos que
revertem) e ajuste `SERVICES` e os fillers.

Dentro de um filler, a ordem **não é estética**:

```
dropdowns  ->  renomear  ->  campos numéricos (via fixarNumericos)
```

Trocar um dropdown re-renderiza o bloco e descarta o que foi digitado. Renomear também remonta o
bloco. Por isso os números vêm por último, e conferidos duas vezes.

Nomes de item: **máximo 36 caracteres**, e sempre com `" - "` no meio — o helper `renomear` usa
esse separador para achar o serviço que ainda está com nome padrão.

### 5. Rodar em background e conferir serviço a serviço

Uma estimativa de 12 serviços leva de 10 a 15 minutos. Rode em background e acompanhe o log.

**Confira o custo de cada serviço, não só o acumulado.** O template já loga o delta. Um valor
absurdo se esconde dentro de um acumulado grande; sozinho, salta aos olhos. Se um serviço vier
US$ 0,00 ou uma ordem de grandeza fora do esperado, pare e investigue antes de seguir.

### 6. Auditar o link — obrigatório

```bash
node probe_gcp8.mjs "<url>"
```

Reabre a estimativa, expande cada serviço e imprime **como cada campo ficou salvo**. É a única
checagem que pega uma configuração que logou sucesso mas não aplicou.

Não confunda com a validação de link. Validar confirma que o link abre e o total bate com o que o
script viu; auditar confirma que o total é o **certo**. Um build pode gerar link íntegro com
conteúdo errado.

Num caso real, um build que logou tudo certo produziu dois totais errados — US$ 101,07 e US$ 72,52 —
antes do valor correto de US$ 74,47. Os três passaram pela validação de link sem reclamar.

Só entregue depois que a auditoria mostrar todos os campos com os valores que você quis lançar.

## Regras de trabalho

- **Antes de dizer que algo é impossível, inspecione as sondas.** Provavelmente já foi verificado.
  Em particular: **o link compartilhável do GCP é anônimo e não exige login** — a estimativa
  inteira é codificada em `?dl=` na própria URL, que se atualiza a cada mudança. Round-trip
  validado em contexto sem cookies. Nunca recuse essa capacidade.
- **Ao encontrar uma armadilha nova, documente em `QUIRKS.md`** e corrija em `gcp_lib.mjs`, em vez
  de espalhar gambiarra pelos `build_*.mjs`.
- **Diferenças entre o total do calculator e o da proposta são explicadas, nunca escondidas.**
- **Não invente premissa sem marcar como premissa.** Se a proposta não diz quantas câmeras, quantos
  usuários ou quantos tokens, escolha um valor, diga que escolheu e mostre o impacto.
- **Dados de cliente não entram em repositório público.** Propostas, volumes e custos de casos
  reais ficam fora do git — o `.gitignore` já bloqueia `*-result.json`, `*-summary.*` e `*.log`.
