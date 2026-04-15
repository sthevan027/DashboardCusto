export function formatBRL(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(n);
}

/** Eixos de gráfico — valores grandes em mi/mil para não cortar o rótulo. */
export function formatBRLAxis(n: number): string {
  if (Number.isNaN(n)) return "—";
  const v = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (v >= 1_000_000) {
    // Símbolo "R$" pode ser truncado em telas estreitas; mantém compacto.
    return `${sign}${(v / 1_000_000).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} mi`;
  }
  if (v >= 10_000) {
    return `${sign}${(v / 1_000).toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} mil`;
  }
  return formatBRL(n);
}

/** Formata número para o campo de valor (sem símbolo R$, apenas dígitos pt-BR). */
export function formatBRLDecimalField(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function parseBRLInput(s: string): number | null {
  const t = s
    .trim()
    .replace(/\s/g, "")
    .replace(/R\$\s?/i, "");
  if (!t) return null;
  const normalized = t.includes(",")
    ? t.replace(/\./g, "").replace(",", ".")
    : t;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/**
 * Reparte `total` em partes proporcionais a `weights` (ex.: orçamentos por item).
 * Garante soma exata em centavos (maior resto).
 */
export function distributeAmountByWeights(
  total: number,
  weights: number[],
): number[] {
  if (weights.length === 0) return [];
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0) return weights.map(() => 0);
  const cents = Math.round(total * 100);
  const exact = weights.map((w) => (cents * w) / sumW);
  const floors = exact.map((x) => Math.floor(x));
  const remainder = cents - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floors];
  for (let k = 0; k < remainder && k < order.length; k++) {
    out[order[k]!.i] += 1;
  }
  return out.map((c) => c / 100);
}
