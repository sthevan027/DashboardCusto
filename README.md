# Dashboard Custo

Dashboard de custos (orçado × realizado) com frontend em React/Vite e backend em **Supabase** (PostgreSQL + PostgREST).

**Modo padrão (offline):** sem variáveis de ambiente a app usa **dados simulados** e login de teste (`demo@dashboardcusto.local` / `demonstracao`, configurável em `VITE_DEMO_EMAIL` e `VITE_DEMO_PASSWORD`). Para **ligar o Supabase**, crie `web/.env` com `VITE_STANDALONE=0` e as chaves; veja `web/.env.example`.

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
- A view **`vw_cost_contract_only_items`** alimenta a soma dos itens “só no contrato” em **Mão de Obra**; no detalhamento **Por grupo** só aparece como sublinha o item **6.1.1** (constante `DETAIL_ORPHAN_ITEM_CODE` em `Dashboard.tsx`).

## Seed (`seed.generated.sql`)

- **Fonte padrão**: `Excel/Controle Operacional V3.xlsx`, aba **Dados**.
- **Grupo Total**: linhas pai — total previsto/real por código.
- **Grupos MO/EQ/MAT**: quebra por subgrupo; nome do item costuma seguir o padrão `descrição — subgrupo`.

Layout esperado na aba **Dados** (V3):

- A=Itens, B=Descrição, C=Sub-Grupo, D=UNID., E=QUANT., F=Valor Unid., G=Valor total, H=Total Com BDI, I=VALOR REAL.

Geração do seed:

```bash
python3 -m pip install openpyxl
python3 scripts/generate_seed_from_excel.py
```

Listar abas disponíveis no Excel:

```bash
python3 scripts/generate_seed_from_excel.py --list-sheets
```

Gerar o seed a partir de uma aba específica:

```bash
python3 scripts/generate_seed_from_excel.py --sheet "Dados"
```

Usando outro arquivo Excel:

```bash
python3 scripts/generate_seed_from_excel.py --excel "Excel/Anexo_I_-_PQ-8001PZ-G-11007_Rev.ALT_REV08.xlsx" --sheet "Nome da Aba"
```

Se você estiver dentro da pasta `scripts/`, rode:

```bash
python3 generate_seed_from_excel.py --sheet "Dados"
```

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
