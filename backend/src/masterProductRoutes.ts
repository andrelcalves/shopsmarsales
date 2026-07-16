import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import {
  buildProductCostLookup,
  type CostHistoryRow,
} from './productCost.js';
import {
  getLatestMasterCostEntry,
  masterEffectiveCostDisplay,
  type MasterCostHistoryRow,
} from './masterProductCost.js';

type Deps = {
  prisma: PrismaClient;
  parseBrNumber: (v: unknown) => number;
  parseDateOnly: (dateStr: string) => Date | null;
  isOrderValidForStock: (o: { status?: string }) => boolean;
};

async function loadMasterCostHistoryMap(prismaAny: any, masterIds: number[]) {
  const ids = [...new Set(masterIds.filter((id) => id > 0))];
  if (ids.length === 0) return new Map<number, MasterCostHistoryRow[]>();
  const rows = await prismaAny.masterProductCostHistory.findMany({
    where: { masterProductId: { in: ids } },
    orderBy: [{ masterProductId: 'asc' }, { effectiveDate: 'asc' }],
  });
  const map = new Map<number, MasterCostHistoryRow[]>();
  for (const r of rows) {
    const list = map.get(r.masterProductId) ?? [];
    list.push({
      masterProductId: r.masterProductId,
      unitCost: Number(r.unitCost),
      effectiveDate: new Date(r.effectiveDate),
    });
    map.set(r.masterProductId, list);
  }
  return map;
}

async function createMasterCostEntry(
  prismaAny: any,
  masterProductId: number,
  unitCost: number,
  effectiveDate: Date,
  notes = 'stock',
) {
  return prismaAny.masterProductCostHistory.create({
    data: { masterProductId, unitCost, effectiveDate, notes },
  });
}

export async function computeSoldByProduct(
  prisma: PrismaClient,
  stockStartDate: Date | null,
  isOrderValidForStock: Deps['isOrderValidForStock'],
) {
  const ordersSince = stockStartDate
    ? await prisma.order.findMany({
        where: { orderDate: { gte: stockStartDate } },
        include: { items: true },
      })
    : [];
  const soldByProduct = new Map<number, number>();
  for (const o of ordersSince) {
    if (!isOrderValidForStock(o)) continue;
    for (const item of o.items) {
      const pid = item.productId;
      if (pid == null) continue;
      soldByProduct.set(pid, (soldByProduct.get(pid) || 0) + (item.quantity || 0));
    }
  }
  return soldByProduct;
}

export async function buildMasterStockCurrent(
  prismaAny: any,
  prisma: PrismaClient,
  isOrderValidForStock: Deps['isOrderValidForStock'],
) {
  const config = await prismaAny.inventoryConfig.findFirst({ orderBy: { id: 'desc' } });
  const stockStartDate = config ? new Date(config.stockStartDate) : null;
  const soldByProduct = await computeSoldByProduct(prisma, stockStartDate, isOrderValidForStock);
  const now = new Date();

  const masters = await prismaAny.masterProduct.findMany({
    include: {
      stock: true,
      products: true,
    },
    orderBy: { name: 'asc' },
  });

  const masterIds = masters.map((m: any) => m.id);
  const costMap = await loadMasterCostHistoryMap(prismaAny, masterIds);

  const items = masters.map((m: any) => {
    const productIds = (m.products ?? []).map((p: any) => p.id);
    const sold = productIds.reduce((sum: number, pid: number) => sum + (soldByProduct.get(pid) || 0), 0);
    const opening = m.stock?.quantity ?? 0;
    const current = Math.max(0, opening - sold);
    const costRows = costMap.get(m.id);
    const latest = getLatestMasterCostEntry(costRows, now);
    const costFields = masterEffectiveCostDisplay(latest);
    const members = (m.products ?? []).map((p: any) => ({
      productId: p.id,
      code: p.code,
      name: p.name,
      sku: p.sku,
      source: p.source ?? '',
      variationName: p.variationName,
      sold: soldByProduct.get(p.id) || 0,
    }));
    const sources = [...new Set(members.map((x: any) => x.source).filter(Boolean))];
    return {
      type: 'master' as const,
      masterProductId: m.id,
      sku: m.sku,
      name: m.name,
      opening,
      sold,
      current,
      costPrice: costFields.unitCost,
      effectiveCostDate: costFields.effectiveDate,
      costSource: costFields.source,
      sources,
      members,
    };
  });

  return {
    stockStartDate: stockStartDate ? stockStartDate.toISOString().slice(0, 10) : null,
    items,
  };
}

export function registerMasterProductRoutes(app: Express, deps: Deps) {
  const { prisma, parseBrNumber, parseDateOnly, isOrderValidForStock } = deps;
  const prismaAny = prisma as any;

  app.get('/api/master-products', async (req, res) => {
    try {
      const nameQ = String(req.query.name ?? '').trim().toLowerCase();
      const skuQ = String(req.query.sku ?? '').trim().toLowerCase();
      const data = await buildMasterStockCurrent(prismaAny, prisma, isOrderValidForStock);
      let items = data.items;
      if (nameQ) items = items.filter((i: any) => String(i.name || '').toLowerCase().includes(nameQ));
      if (skuQ) items = items.filter((i: any) => String(i.sku || '').toLowerCase().includes(skuQ));
      return res.status(200).json({ stockStartDate: data.stockStartDate, items });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao buscar produtos mestre.' });
    }
  });

  app.get('/api/master-products/pending', async (req, res) => {
    try {
      const nameQ = String(req.query.name ?? '').trim().toLowerCase();
      const skuQ = String(req.query.sku ?? '').trim().toLowerCase();
      const sourceQ = String(req.query.source ?? '').trim().toLowerCase();
      const products = await prisma.product.findMany({
        where: { masterProductId: null },
        orderBy: [{ source: 'asc' }, { name: 'asc' }],
      });
      let filtered = products;
      if (nameQ) filtered = filtered.filter((p) => p.name.toLowerCase().includes(nameQ) || p.code.toLowerCase().includes(nameQ));
      if (skuQ) filtered = filtered.filter((p) => String(p.sku ?? '').toLowerCase().includes(skuQ));
      if (sourceQ) filtered = filtered.filter((p) => String(p.source ?? '').toLowerCase().includes(sourceQ));
      return res.status(200).json(filtered);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao buscar produtos pendentes.' });
    }
  });

  app.post('/api/master-products', async (req, res) => {
    try {
      const { sku, name, productIds } = req.body ?? {};
      const skuStr = String(sku ?? '').trim();
      const nameStr = String(name ?? '').trim();
      const ids = Array.isArray(productIds)
        ? productIds.map((x: unknown) => parseInt(String(x), 10)).filter((n: number) => Number.isInteger(n) && n > 0)
        : [];
      if (!skuStr) return res.status(400).json({ message: 'SKU mestre é obrigatório.' });
      if (!nameStr) return res.status(400).json({ message: 'Nome canônico é obrigatório.' });
      const master = await prismaAny.masterProduct.create({
        data: { sku: skuStr, name: nameStr },
      });
      await prismaAny.masterProductStock.create({
        data: { masterProductId: master.id, quantity: 0 },
      });
      if (ids.length > 0) {
        await prismaAny.product.updateMany({
          where: { id: { in: ids }, masterProductId: null },
          data: { masterProductId: master.id },
        });
      }
      const created = await prismaAny.masterProduct.findUnique({
        where: { id: master.id },
        include: { stock: true, products: true },
      });
      return res.status(201).json(created);
    } catch (e: any) {
      if (e?.code === 'P2002') return res.status(400).json({ message: 'SKU mestre já existe.' });
      console.error(e);
      return res.status(500).json({ message: 'Erro ao criar produto mestre.' });
    }
  });

  app.patch('/api/master-products/:id', async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'ID inválido.' });
      const { sku, name } = req.body ?? {};
      const data: Record<string, string> = {};
      if (typeof sku === 'string' && sku.trim()) data.sku = sku.trim();
      if (typeof name === 'string' && name.trim()) data.name = name.trim();
      if (Object.keys(data).length === 0) {
        return res.status(400).json({ message: 'Informe sku e/ou name.' });
      }
      const updated = await prismaAny.masterProduct.update({
        where: { id },
        data,
        include: { stock: true, products: true },
      });
      return res.status(200).json(updated);
    } catch (e: any) {
      if (e?.code === 'P2002') return res.status(400).json({ message: 'SKU mestre já existe.' });
      console.error(e);
      return res.status(500).json({ message: 'Erro ao atualizar produto mestre.' });
    }
  });

  app.post('/api/master-products/:id/members', async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'ID inválido.' });
      const { productIds } = req.body ?? {};
      const ids = Array.isArray(productIds)
        ? productIds.map((x: unknown) => parseInt(String(x), 10)).filter((n: number) => Number.isInteger(n) && n > 0)
        : [];
      if (ids.length === 0) return res.status(400).json({ message: 'Informe productIds.' });
      const already = await prismaAny.product.findMany({
        where: { id: { in: ids }, masterProductId: { not: null, notIn: [id] } },
        select: { id: true, name: true },
      });
      if (already.length > 0) {
        return res.status(400).json({
          message: 'Um ou mais produtos já pertencem a outro mestre.',
          products: already,
        });
      }
      await prismaAny.product.updateMany({
        where: { id: { in: ids } },
        data: { masterProductId: id },
      });
      const master = await prismaAny.masterProduct.findUnique({
        where: { id },
        include: { stock: true, products: true },
      });
      return res.status(200).json(master);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao vincular produtos.' });
    }
  });

  app.post('/api/master-products/:id/merge-into', async (req, res) => {
    try {
      const sourceId = parseInt(String(req.params.id), 10);
      const { targetMasterId } = req.body ?? {};
      const targetId = targetMasterId != null ? parseInt(String(targetMasterId), 10) : NaN;
      if (!Number.isInteger(sourceId) || sourceId <= 0) {
        return res.status(400).json({ message: 'ID de origem inválido.' });
      }
      if (!Number.isInteger(targetId) || targetId <= 0) {
        return res.status(400).json({ message: 'targetMasterId inválido.' });
      }
      if (sourceId === targetId) {
        return res.status(400).json({ message: 'Origem e destino devem ser mestres diferentes.' });
      }

      const [source, target] = await Promise.all([
        prismaAny.masterProduct.findUnique({
          where: { id: sourceId },
          include: { stock: true, costHistory: true },
        }),
        prismaAny.masterProduct.findUnique({
          where: { id: targetId },
          include: { stock: true },
        }),
      ]);
      if (!source) return res.status(404).json({ message: 'Mestre de origem não encontrado.' });
      if (!target) return res.status(404).json({ message: 'Mestre de destino não encontrado.' });

      const sourceQty = source.stock?.quantity ?? 0;
      const targetQty = target.stock?.quantity ?? 0;
      const mergedQty = targetQty + sourceQty;
      const sourceLabel = `merged from ${source.sku}`;
      const costEntries = (source.costHistory ?? []).map((r: any) => ({
        masterProductId: targetId,
        unitCost: Number(r.unitCost),
        effectiveDate: new Date(r.effectiveDate),
        notes: r.notes ? `${sourceLabel}: ${r.notes}` : sourceLabel,
      }));

      const txOps: any[] = [
        prismaAny.product.updateMany({
          where: { masterProductId: sourceId },
          data: { masterProductId: targetId },
        }),
        prismaAny.masterProductStock.upsert({
          where: { masterProductId: targetId },
          update: { quantity: mergedQty },
          create: { masterProductId: targetId, quantity: mergedQty },
        }),
      ];
      if (costEntries.length > 0) {
        txOps.push(prismaAny.masterProductCostHistory.createMany({ data: costEntries }));
      }
      txOps.push(prismaAny.masterProduct.delete({ where: { id: sourceId } }));

      await prisma.$transaction(txOps);

      const updatedTarget = await prismaAny.masterProduct.findUnique({
        where: { id: targetId },
        include: { stock: true, products: true, costHistory: true },
      });
      return res.status(200).json(updatedTarget);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao mesclar mestres.' });
    }
  });

  app.delete('/api/products/:id/unlink-master', async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'ID inválido.' });
      await prismaAny.product.update({
        where: { id },
        data: { masterProductId: null },
      });
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao desvincular produto.' });
    }
  });

  app.get('/api/master-products/:id/cost-history', async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'ID inválido.' });
      const rows = await prismaAny.masterProductCostHistory.findMany({
        where: { masterProductId: id },
        orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }],
      });
      return res.status(200).json(
        rows.map((r: any) => ({
          id: r.id,
          masterProductId: r.masterProductId,
          unitCost: r.unitCost,
          effectiveDate: new Date(r.effectiveDate).toISOString().slice(0, 10),
          notes: r.notes,
          createdAt: r.createdAt,
        })),
      );
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao buscar histórico de custo.' });
    }
  });

  app.put('/api/master-product-stock', async (req, res) => {
    try {
      const { masterProductId, quantity, unitCost, effectiveDate } = req.body ?? {};
      const mid = masterProductId != null ? parseInt(String(masterProductId), 10) : NaN;
      const qty = quantity != null ? parseInt(String(quantity), 10) : 0;
      if (!Number.isInteger(mid) || mid <= 0) return res.status(400).json({ message: 'masterProductId inválido.' });
      if (qty > 0 && (unitCost == null || unitCost === '')) {
        return res.status(400).json({ message: 'Preço de custo é obrigatório quando a quantidade é maior que zero.' });
      }
      const master = await prismaAny.masterProduct.findUnique({ where: { id: mid } });
      if (!master) return res.status(404).json({ message: 'Produto mestre não encontrado.' });
      const row = await prismaAny.masterProductStock.upsert({
        where: { masterProductId: mid },
        update: { quantity: qty },
        create: { masterProductId: mid, quantity: qty },
      });
      if (unitCost != null && unitCost !== '') {
        const cost = parseBrNumber(unitCost);
        if (!Number.isFinite(cost) || cost < 0) return res.status(400).json({ message: 'Preço de custo inválido.' });
        const effDate = effectiveDate ? parseDateOnly(String(effectiveDate)) : new Date();
        if (!effDate) return res.status(400).json({ message: 'Data de vigência inválida.' });
        await createMasterCostEntry(prismaAny, mid, cost, effDate, 'stock');
      }
      return res.status(200).json(row);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao salvar estoque do produto mestre.' });
    }
  });
}

export async function loadCombinedCostLookup(prismaAny: any, productIds: number[]) {
  const uniqueIds = [...new Set(productIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (uniqueIds.length === 0) {
    return {
      masterById: new Map<number, MasterCostHistoryRow[]>(),
      productLookup: buildProductCostLookup([], []),
      productIdToMasterId: new Map<number, number>(),
    };
  }
  const products = await prismaAny.product.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, costPrice: true, masterProductId: true },
  });
  const masterIds = [...new Set(products.map((p: any) => p.masterProductId).filter(Boolean))] as number[];
  const [productHistory, masterHistory] = await Promise.all([
    prismaAny.productCostHistory.findMany({
      where: { productId: { in: uniqueIds } },
      orderBy: [{ productId: 'asc' }, { effectiveDate: 'asc' }],
    }),
    masterIds.length > 0
      ? prismaAny.masterProductCostHistory.findMany({
          where: { masterProductId: { in: masterIds } },
          orderBy: [{ masterProductId: 'asc' }, { effectiveDate: 'asc' }],
        })
      : [],
  ]);
  const productRows: CostHistoryRow[] = productHistory.map((r: any) => ({
    productId: r.productId,
    unitCost: Number(r.unitCost),
    effectiveDate: new Date(r.effectiveDate),
  }));
  const productLookup = buildProductCostLookup(
    productRows,
    products.map((p: any) => ({ id: p.id, costPrice: p.costPrice })),
  );
  const masterById = new Map<number, MasterCostHistoryRow[]>();
  for (const r of masterHistory) {
    const list = masterById.get(r.masterProductId) ?? [];
    list.push({
      masterProductId: r.masterProductId,
      unitCost: Number(r.unitCost),
      effectiveDate: new Date(r.effectiveDate),
    });
    masterById.set(r.masterProductId, list);
  }
  const productIdToMasterId = new Map<number, number>();
  for (const p of products) {
    if (p.masterProductId != null) productIdToMasterId.set(p.id, p.masterProductId);
  }
  return { masterById, productLookup, productIdToMasterId };
}
