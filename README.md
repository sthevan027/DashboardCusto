# JL-DashboardCusto

Dashboard de custos (orçado × realizado) com frontend em React/Vite e backend em **Supabase** (PostgreSQL + PostgREST).

## Estrutura do repositório

| Caminho | Descrição |
|--------|-----------|
| `web/` | App React (`pnpm` para dependências e scripts). |
| `web/src/lib/db/catalog.ts` | Nomes das tabelas e views expostas ao cliente (espelha o banco). |
| `Supabase/schema.sql` | **Somente** tabelas, índices, funções, triggers, views e RLS (sem dados). |
| `Supabase/seed.generated.sql` | Dados iniciais gerados a partir do Excel (grupos, subgrupos, itens, orçamentos, lançamentos). |
| `scripts/generate_seed_from_excel.py` | Gera `seed.generated.sql` a partir da planilha. |

## Ordem de aplicação no Supabase

1. Executar `Supabase/schema.sql` (cria objetos).
2. Executar `Supabase/seed.generated.sql` (carrega dimensões e fatos).

Sem o seed, o schema sozinho deixa tabelas vazias.

## Modelo de dados (resumo)

- **`cost_groups`**: centros de 1º nível — **Mão de Obra**, **Equipamento**, **Materiais**, **Total**.
- **`cost_subgroups`**: subdivisão opcional (ex.: tipo de equipamento).
- **`cost_items`**: linha orçamentária; pertence a um grupo e opcionalmente a um subgrupo; `code` alinha com o código da planilha.
- **`cost_budgets`**: valor previsto por item (um orçamento por item).
- **`cost_entries`**: lançamentos do valor real (competência, valor).
- **`cost_entries_audit`**: trilha de INSERT/UPDATE/DELETE em `cost_entries`.

Views `vw_cost_*` expõem análises (previsto × real, agregados por grupo, etc.) com `security_invoker` para respeitar RLS. Detalhes por view ficam nos comentários que o projeto já mantém no catálogo em código ou podem ser documentados aqui sob demanda.

### Regra de negócio importante (Total × MO/EQ/MAT)

O mesmo **`code`** pode existir no grupo **Total** e também em **Mão de Obra / Equipamento / Materiais** (linhas distintas em `cost_items`).

- Visão **por atividade / contrato** (`vw_cost_activity_analysis`): usa só itens do grupo **Total** (uma linha por código no contrato).
- Visão **por quebra operacional** (`vw_cost_budget_line_unique` e derivados): usa itens **fora** do grupo Total; evita dupla contagem quando o código existe nas duas frentes.
- Itens que existem **somente** no Total (sem linha irmã em MO/EQ/MAT com o mesmo código) entram no agregado **`Outros (só no contrato)`** em `vw_cost_group_summary` / `vw_cost_subgroup_summary`, para a soma por grupo fechar com o total do contrato.
- A view **`vw_cost_contract_only_items`** lista cada linha “só no contrato”; no **Detalhamento → Por grupo**, esses valores somam em **Mão de Obra** e o item (ex. **6.1.1**) aparece como sublinha logo abaixo desse grupo.

## Seed (`seed.generated.sql`)

- **Fonte**: `Excel/Controle Operacional V2.xlsx`, aba **Dados**.
- **Grupo Total**: linhas pai — total previsto/real por código.
- **Grupos MO/EQ/MAT**: quebra por subgrupo; nome do item costuma seguir o padrão `descrição — subgrupo`.

### Notas e sanity (referência da geração do seed)

- A soma do **Total previsto** das linhas pai na aba Dados pode diferir levemente do “Total” na aba Controle do Excel; o seed reflete a aba **Dados**.
- Exemplo de checagens (valores típicos de uma geração):

  - Soma **Total previsto** (linhas pai): **8.088.941,03**
  - Soma **Total real** (linhas pai): **0,00**
  - Soma **previsto** (detalhe MO+EQ+MAT): **6.941.006,40**
  - Soma **real** (detalhe MO+EQ+MAT): **0,00**

  A diferença entre o total contrato (~8M) e a soma da quebra MO/EQ/MAT (~6,9M) corresponde a códigos/orçamentos que não têm linha espelhada na quebra operacional; no app isso aparece como **`Outros (só no contrato)`** após aplicar o `schema.sql` atual.

## Frontend

Na pasta `web/`, instalar e subir:

```bash
pnpm install
pnpm dev
```

Build de produção:

```bash
pnpm build
```

Variáveis de ambiente (ex.: `.env` em `web/`): URL e chave anônima do Supabase, conforme documentação do projeto Vite.

## Convenção de nomes no banco

- Tabelas: prefixo `cost_*`.
- Views: prefixo `vw_cost_*`.

Os nomes usados no cliente devem coincidir com `web/src/lib/db/catalog.ts`.
