---
description: (Google Cloud) Lê a proposta apontada pelo usuário e gera a estimativa compartilhável no Google Cloud Pricing Calculator
---

Gerar a calculadora **Google Cloud** compartilhável a partir de uma proposta comercial.

**Não exija nome de cliente como argumento.** O usuário indica a proposta pelo caminho, pela
pasta atual ou por referência na mensagem.

**Capacidade verificada:** o link do GCP é anônimo. A estimativa inteira é codificada em
`?dl=...` na própria URL, que se atualiza a cada mudança e reabre sem login (round-trip
validado). Não declare que não é possível gerar o link.

## Passos

1. **Localize o `.docx` da proposta** a partir do que o usuário disse ou da pasta atual. Se houver
   mais de um candidato, liste e pergunte qual usar. Derive o nome curto do caso para nomear
   `build_<caso>.mjs` e os artefatos.
2. **Leia `CLAUDE.md` e `QUIRKS.md` por inteiro antes de escrever qualquer script.** Eles têm as
   armadilhas de UI descobertas por sondagem, que produzem número errado em silêncio se ignoradas.
3. Extraia o texto do `.docx`, leia a seção de custos de nuvem e **valide a matemática** da
   proposta (volume × preço unitário deve bater com os subtotais) antes de automatizar. Escreva a
   volumetria em `VOLUMETRIA_<CASO>.md`: parâmetros declarados, premissas adotadas e derivação.
4. Consulte `forms_gcp.json` (campos por produto) e `catalogo_gcp.json` (nomes exatos). Se o
   produto não estiver mapeado, rode `node discover_forms.mjs "<Produto>"`.
5. Copie `build_exemplo.mjs` ou `build_avancado.mjs` para `build_<caso>.mjs`, ajuste `SERVICES` e
   os fillers respeitando a ordem **dropdowns → renomear → campos numéricos**, e defina a região
   **em cada serviço** com `setRegiao`. Rode em background e confira o custo de cada serviço,
   não só o acumulado.
6. **Audite antes de entregar**: `node probe_gcp8.mjs "<url>"` reabre a estimativa e mostra região,
   quantidades e unidades de cada serviço como ficaram salvos. Um helper pode logar sucesso sem
   ter aplicado a configuração.
7. Entregue o **link** (`https://cloud.google.com/products/calculator?dl=...`), a **tabela de
   custos**, o **total mensal e anual**, e as **diferenças em relação à proposta** explicadas de
   forma honesta (região, unidade, desconto de uso comprometido, arredondamento, premissas).

Se o cliente também quiser uma calculadora que ele mesmo possa ajustar, gere a versão HTML com
`gen_gcp_html.mjs` e preencha `link_oficial` com a URL gerada acima.
