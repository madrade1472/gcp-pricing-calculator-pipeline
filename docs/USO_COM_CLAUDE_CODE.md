# Uso com o Claude Code

Este repositório já vem pronto para ser conduzido por um agente. Três arquivos fazem isso:

| Arquivo | Papel |
|---|---|
| `CLAUDE.md` | Lido automaticamente ao abrir o Claude Code nesta pasta. Descreve o fluxo e o que entregar |
| `QUIRKS.md` | As armadilhas do calculator. O agente é instruído a ler inteiro antes de escrever código |
| `.claude/commands/calc_gcp.md` | O comando `/calc_gcp`, gatilho do fluxo completo |

## Instalação

```bash
git clone https://github.com/madrade1472/gcp-pricing-calculator-pipeline
cd gcp-pricing-calculator-pipeline
npm install && npx playwright install chromium
claude
```

Dentro do Claude Code:

```
/calc_gcp a proposta está em ~/propostas/cliente/proposta.docx
```

## Usar de qualquer pasta

O comando do repositório só aparece quando o Claude Code é aberto nesta pasta. Para acioná-lo de
qualquer lugar, copie-o para os comandos globais e diga onde o projeto mora:

```bash
cp .claude/commands/calc_gcp.md ~/.claude/commands/
```

E acrescente ao `~/.claude/CLAUDE.md` um roteador como este, que faz o pedido em linguagem natural
("monta a calculadora GCP dessa proposta") ter o mesmo efeito do comando:

```markdown
# Calculadoras de custo de cloud

Quando eu pedir "monta a calculadora AWS / GCP / Azure" ou "gera o link de custos", os pipelines
já existem e geram link de verdade. Nunca responder que não é possível gerar o link.

| Pedido | Projeto | Entrega |
|---|---|---|
| AWS | `~/aws-pricing-automation` | Link oficial `calculator.aws/#/estimate?id=...` |
| GCP | `~/gcp-pricing-calculator-pipeline` | Link oficial `cloud.google.com/products/calculator?dl=...` |
| Azure | `~/aws-pricing-automation/azure` | Calculadora HTML auto-hospedável |

Fluxo: localizar o `.docx`, ler o `CLAUDE.md` do projeto antes de escrever script, seguir o
pipeline documentado, rodar em background, conferir cada serviço contra a proposta e entregar o
link, a tabela, o total mensal e anual e as diferenças explicadas.
```

## Projeto irmão

AWS e Azure ficam em
[aws-pricing-automation](https://github.com/madrade1472/aws-pricing-automation), com a mesma
convenção de comandos (`/calc_aws` e `/calc_microsoft`).
