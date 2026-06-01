import {
  getLatestCostEntry,
  resolveCostFromLookup,
  type CostHistoryRow,
  type ProductCostLookup,
} from './productCost.js';

export type MasterCostHistoryRow = {
  masterProductId: number;
  unitCost: number;
  effectiveDate: Date;
};

export type CombinedCostLookup = {
  masterById: Map<number, MasterCostHistoryRow[]>;
  productLookup: ProductCostLookup;
  productIdToMasterId: Map<number, number>;
};

export function buildMasterCostLookup(
  masterHistoryRows: MasterCostHistoryRow[],
  productLookup: ProductCostLookup,
  products: Array<{ id: number; masterProductId: number | null }>,
): CombinedCostLookup {
  const masterById = new Map<number, MasterCostHistoryRow[]>();
  for (const row of masterHistoryRows) {
    const list = masterById.get(row.masterProductId) ?? [];
    list.push(row);
    masterById.set(row.masterProductId, list);
  }
  const productIdToMasterId = new Map<number, number>();
  for (const p of products) {
    if (p.masterProductId != null) productIdToMasterId.set(p.id, p.masterProductId);
  }
  return { masterById, productLookup, productIdToMasterId };
}

export function resolveCombinedCost(
  lookup: CombinedCostLookup,
  productId: number | null | undefined,
  date: Date,
  inlineFallback: number | null | undefined,
): number {
  if (productId == null) return Number(inlineFallback ?? 0);
  const masterId = lookup.productIdToMasterId.get(productId);
  if (masterId != null) {
    const rows = lookup.masterById.get(masterId);
    const latest = getLatestCostEntry(rows as CostHistoryRow[] | undefined, date);
    if (latest) return latest.unitCost;
  }
  return resolveCostFromLookup(lookup.productLookup, productId, date, inlineFallback);
}

export function getLatestMasterCostEntry(
  rows: MasterCostHistoryRow[] | undefined,
  asOf: Date = new Date(),
): MasterCostHistoryRow | null {
  if (!rows || rows.length === 0) return null;
  const t = asOf.getTime();
  let best: MasterCostHistoryRow | null = null;
  for (const row of rows) {
    if (row.effectiveDate.getTime() <= t) best = row;
    else break;
  }
  return best;
}

export function masterEffectiveCostDisplay(
  latestEntry: MasterCostHistoryRow | null,
): { unitCost: number | null; effectiveDate: string | null; source: 'stock' | null } {
  if (!latestEntry) return { unitCost: null, effectiveDate: null, source: null };
  return {
    unitCost: latestEntry.unitCost,
    effectiveDate: latestEntry.effectiveDate.toISOString().slice(0, 10),
    source: 'stock',
  };
}
