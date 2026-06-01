export type CostHistoryRow = {
  productId: number;
  unitCost: number;
  effectiveDate: Date;
};

export type ProductCostLookup = {
  byProductId: Map<number, CostHistoryRow[]>;
  fallbackByProductId: Map<number, number | null>;
};

/** Resolve unit cost at a date from preloaded history (in-memory). */
export function resolveCostFromLookup(
  lookup: ProductCostLookup,
  productId: number | null | undefined,
  date: Date,
  inlineFallback: number | null | undefined,
): number {
  if (productId == null) return Number(inlineFallback ?? 0);
  const rows = lookup.byProductId.get(productId);
  if (rows && rows.length > 0) {
    const t = date.getTime();
    let best: CostHistoryRow | null = null;
    for (const row of rows) {
      if (row.effectiveDate.getTime() <= t) best = row;
      else break;
    }
    if (best) return best.unitCost;
  }
  const fb = lookup.fallbackByProductId.get(productId);
  if (fb != null) return fb;
  return Number(inlineFallback ?? 0);
}

/** Build lookup from DB rows + product fallbacks. Rows must be sorted by productId asc, effectiveDate asc. */
export function buildProductCostLookup(
  historyRows: CostHistoryRow[],
  products: Array<{ id: number; costPrice: number | null }>,
): ProductCostLookup {
  const byProductId = new Map<number, CostHistoryRow[]>();
  for (const row of historyRows) {
    const list = byProductId.get(row.productId) ?? [];
    list.push(row);
    byProductId.set(row.productId, list);
  }
  const fallbackByProductId = new Map<number, number | null>();
  for (const p of products) {
    fallbackByProductId.set(p.id, p.costPrice);
  }
  return { byProductId, fallbackByProductId };
}

/** Latest cost entry by effectiveDate (not future). */
export function getLatestCostEntry(
  rows: CostHistoryRow[] | undefined,
  asOf: Date = new Date(),
): CostHistoryRow | null {
  if (!rows || rows.length === 0) return null;
  const t = asOf.getTime();
  let best: CostHistoryRow | null = null;
  for (const row of rows) {
    if (row.effectiveDate.getTime() <= t) best = row;
    else break;
  }
  return best;
}

export function effectiveCostDisplay(
  latestEntry: CostHistoryRow | null,
  costPrice: number | null,
): { unitCost: number | null; effectiveDate: string | null; source: 'stock' | 'manual' | null } {
  if (latestEntry) {
    return {
      unitCost: latestEntry.unitCost,
      effectiveDate: latestEntry.effectiveDate.toISOString().slice(0, 10),
      source: 'stock',
    };
  }
  if (costPrice != null && costPrice > 0) {
    return { unitCost: costPrice, effectiveDate: null, source: 'manual' };
  }
  return { unitCost: null, effectiveDate: null, source: null };
}
