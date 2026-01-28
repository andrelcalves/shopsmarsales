// src/index.ts
import express from 'express';
import cors from 'cors';
import formidable from 'formidable';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import util from 'util';
import { createRequire } from 'module';

type FormFields = Record<string, unknown>;
type FormFiles = Record<string, unknown>;

const require = createRequire(import.meta.url);
const xlsx = require('xlsx');

const APP_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
const prismaClientPath = path.join(process.cwd(), 'node_modules', '.prisma', 'client');

function pick(row: Record<string, unknown>, keys: string[]) {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return undefined;
}

function parseBrNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  
  let s = String(v).trim();
  s = s.replace(/R\$\s?/g, '').replace(/BRL\s?/g, '');
  
  if (!s) return 0;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    s = s.replace(',', '.');
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseDateFlexible(v: unknown): Date | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(v).trim();
  if (!s) return null;

  // IMPORTANT: formatos como "12/01/2026" são ambíguos e o JS costuma interpretar como MM/DD.
  // Se bater com dd/mm/aaaa (com hora opcional), parseamos manualmente primeiro.
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]) - 1;
    const yyyy = Number(m[3]);
    const hh = Number(m[4] ?? 0);
    const min = Number(m[5] ?? 0);
    const ss = Number(m[6] ?? 0);
    const d = new Date(yyyy, mm, dd, hh, min, ss);
    return isNaN(d.getTime()) ? null : d;
  }

  // Para outros formatos (ISO etc.), o parse nativo é OK
  let d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  return null;
}

function prettyInspect(obj: unknown) {
  return util.inspect(obj, { depth: 8, colors: false, breakLength: 140 });
}

interface StandardizedSale {
  orderId: string;
  orderDate: Date;
  productName: string;
  quantity: number;
  totalPrice: number;
  status: string; // <--- NOVO CAMPO
  source: string;
}

interface StandardizedOrderItem {
  orderId: string;
  source: string;
  productCode: string;
  name: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
}

function parseTimeToParts(v: unknown): { hh: number; mm: number; ss: number } | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  return { hh: Number(m[1]), mm: Number(m[2]), ss: Number(m[3] ?? 0) };
}

function parseDateAndTime(dateVal: unknown, timeVal: unknown): Date | null {
  const d = parseDateFlexible(dateVal);
  if (!d) return null;
  const t = parseTimeToParts(timeVal);
  if (!t) return d;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), t.hh, t.mm, t.ss);
}

function monthStartFromYYYYMM(v: string): Date | null {
  const s = String(v || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const yyyy = Number(m[1]);
  const mm = Number(m[2]) - 1;
  const d = new Date(yyyy, mm, 1);
  return isNaN(d.getTime()) ? null : d;
}

const standardizeData = (row: Record<string, unknown>, source: string): StandardizedSale | null => {
  try {
    if (source === 'shopee') {
      const orderIdVal = pick(row, ['ID do pedido', 'ID do Pedido', 'Order ID']);
      const orderDateVal = pick(row, ['Data de criação do pedido', 'Data de Criação do Pedido', 'Created Time']);
      const productNameVal = pick(row, ['Nome do Produto', 'Nome do produto', 'Product Name']);
      const qtyVal = pick(row, ['Quantidade', 'Qty', 'Quantity']);
      const priceVal = pick(row, ['Subtotal do produto', 'Valor Total', 'Total global', 'Preço Final Total']);
      
      // Captura o status da Shopee
      const statusVal = pick(row, ['Status do pedido', 'Status', 'Order Status']);

      const orderId = orderIdVal ? String(orderIdVal).trim() : '';
      const orderDate = parseDateFlexible(orderDateVal);
      const productName = productNameVal ? String(productNameVal).trim() : '';
      const quantity = qtyVal ? parseInt(String(qtyVal), 10) || 0 : 0;
      const totalPrice = parseBrNumber(priceVal);
      const status = statusVal ? String(statusVal).trim() : 'Desconhecido';

      if (!orderId || !orderDate || isNaN(orderDate.getTime())) return null;

      return {
        orderId,
        orderDate,
        productName,
        quantity,
        totalPrice,
        status, // <--- Incluindo no objeto
        source: 'shopee',
      };
    }

    if (source === 'tiktok') {
      if (!row['Order ID']) return null;

      // Tenta pegar status do TikTok (geralmente é "Order Status")
      const statusVal = pick(row, ['Order Status', 'Status', 'Order status']);

      return {
        orderId: String(row['Order ID']),
        orderDate: new Date(String(row['Created Time'] ?? '')),
        productName: String(row['Product Name'] ?? ''),
        quantity: parseInt(String(row['Quantity'] ?? '0'), 10) || 0,
        totalPrice: parseBrNumber(row['Order Amount']),
        status: statusVal ? String(statusVal).trim() : 'Desconhecido',
        source: 'tiktok',
      };
    }

    if (source === 'tray') {
      // CSV template: "Pedido";"Data";"Hora"; ... ;"Status pedido"; ... ;"Total"; ...
      const orderIdVal = pick(row, ['Pedido', 'pedido', 'Order ID']);
      const orderDateVal = pick(row, ['Data', 'data']);
      const orderTimeVal = pick(row, ['Hora', 'hora']);
      const totalVal = pick(row, ['Total', 'total', 'Subtotal produtos', 'Subtotal produtos ']);
      const statusVal = pick(row, ['Status pedido', 'Status', 'Status do pedido']);
      const channelVal = pick(row, ['Canal de venda', 'Canal', 'Canal']);

      const orderId = orderIdVal ? String(orderIdVal).trim() : '';
      const orderDate = parseDateAndTime(orderDateVal, orderTimeVal);
      const totalPrice = parseBrNumber(totalVal);
      const status = statusVal ? String(statusVal).trim() : 'Desconhecido';

      if (!orderId || !orderDate || isNaN(orderDate.getTime())) return null;

      // O template é nível pedido (não tem item). Preenchemos campos mínimos.
      const productName =
        channelVal && String(channelVal).trim()
          ? `Pedido (${String(channelVal).trim()})`
          : 'Pedido (Tray)';

      return {
        orderId,
        orderDate,
        productName,
        quantity: 1,
        totalPrice,
        status,
        source: 'tray',
      };
    }

    return null;
  } catch (e) {
    console.error('Erro ao padronizar linha:', prettyInspect({ row, source, e }));
    return null;
  }
};

const standardizeTrayItem = (row: Record<string, unknown>): StandardizedOrderItem | null => {
  try {
    // CSV: "Código pedido";"Nome produto";"Preço venda";"Quantidade";"Código produto"
    const orderIdVal = pick(row, ['Código pedido', 'Codigo pedido', 'C�digo pedido', 'Pedido', 'orderId']);
    const productCodeVal = pick(row, ['Código produto', 'Codigo produto', 'C�digo produto']);
    const nameVal = pick(row, ['Nome produto', 'Nome do Produto', 'Produto']);
    const unitPriceVal = pick(row, ['Preço venda', 'Preco venda', 'Pre�o venda', 'Valor']);
    const qtyVal = pick(row, ['Quantidade', 'Qtd', 'Quantity']);

    const orderId = orderIdVal ? String(orderIdVal).trim() : '';
    const productCode = productCodeVal ? String(productCodeVal).trim() : '';
    const nameRaw = nameVal ? String(nameVal) : '';
    const name = nameRaw.replace(/<br\s*\/?>/gi, '').trim();
    const unitPrice = parseBrNumber(unitPriceVal);
    const quantity = qtyVal ? parseInt(String(qtyVal), 10) || 0 : 0;

    if (!orderId || !productCode || !name) return null;
    if (quantity <= 0) return null;

    return {
      orderId,
      source: 'tray',
      productCode,
      name,
      unitPrice,
      quantity,
      totalPrice: Number((unitPrice * quantity).toFixed(2)),
    };
  } catch (e) {
    console.error('Erro ao padronizar item Tray:', prettyInspect({ row, e }));
    return null;
  }
};

function first<T>(v: T | T[] | undefined): T | undefined {
  if (!v) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function getFileFromFormidable(files: FormFiles) {
  const filesObj = files as unknown as Record<string, any>;
  const keys = Object.keys(filesObj || {});
  if (keys.length === 0) return { key: undefined as string | undefined, file: undefined as any };
  const key = keys[0];
  const uploaded = filesObj[key];
  const file = Array.isArray(uploaded) ? uploaded[0] : uploaded;
  return { key, file };
}

function getFilePath(file: any): string | undefined {
  if (!file) return undefined;
  return file.filepath || file.path || file.filePath || file.tempFilePath;
}

async function main() {
  console.log('Node:', process.version);
  
  if (!fs.existsSync(prismaClientPath)) {
    console.warn('Warning: Prisma client folder not found.');
  }

  const prisma = new PrismaClient();
  await prisma.$connect();
  console.log('prisma.$connect() OK');

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.post('/api/upload', (req, res) => {
    const form = formidable({ multiples: false, keepExtensions: true });

    form.parse(req, async (err: unknown, fields: FormFields, files: FormFields) => {
      if (err) return res.status(500).json({ message: 'Erro no form.' });

      try {
        const { key: fileKey, file } = getFileFromFormidable(files);
        if (!file) return res.status(400).json({ message: 'Arquivo não enviado.' });

        const filepath = getFilePath(file);
        if (!filepath) return res.status(400).json({ message: 'Caminho do arquivo não encontrado.' });

        const sourceRaw = (fields as any).source;
        const source = first(sourceRaw) as string | undefined;

        if (!source || (source !== 'shopee' && source !== 'tiktok' && source !== 'tray')) {
          return res.status(400).json({ message: 'Source inválido.' });
        }

        const ext = String(path.extname(filepath || '')).toLowerCase();
        // CSV do Tray usa ';' como separador
        const workbook =
          ext === '.csv'
            ? xlsx.readFile(filepath, { FS: ';', raw: true })
            : xlsx.readFile(filepath);
        const sheetName = workbook.SheetNames[0];
        const jsonData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
          defval: '',
          raw: true,
        }) as Record<string, unknown>[];

        const standardizedSales = jsonData
          .map((row) => standardizeData(row, source))
          .filter((sale): sale is StandardizedSale => sale !== null);

        const operations = standardizedSales.map((sale) => {
          return prisma.order.upsert({
            where: {
              // Certifique-se de que @@unique([orderId, source]) existe no schema
              orderId_source: { 
                orderId: sale.orderId,
                source: sale.source,
              },
            },
            update: {
              totalPrice: sale.totalPrice,
              productName: sale.productName,
              quantity: sale.quantity,
              orderDate: sale.orderDate,
              status: sale.status, // Atualiza o status se mudar
            },
            create: sale, // Cria com status
          });
        });

        console.log(`Processando ${operations.length} registros...`);
        const results = await prisma.$transaction(operations);

        return res.status(200).json({
          message: 'Processado com sucesso.',
          count: results.length,
        });

      } catch (e) {
        console.error(e);
        return res.status(500).json({ message: 'Erro interno.' });
      }
    });
  });

  // Upload de itens/produtos vendidos (Tray)
  app.post('/api/upload-items', (req, res) => {
    const form = formidable({ multiples: false, keepExtensions: true });

    form.parse(req, async (err: unknown, fields: FormFields, files: FormFields) => {
      if (err) return res.status(500).json({ message: 'Erro no form.' });

      try {
        const { file } = getFileFromFormidable(files as any);
        if (!file) return res.status(400).json({ message: 'Arquivo não enviado.' });

        const filepath = getFilePath(file);
        if (!filepath) return res.status(400).json({ message: 'Caminho do arquivo não encontrado.' });

        const sourceRaw = (fields as any).source;
        const source = String(first(sourceRaw) ?? '').trim().toLowerCase();
        if (source !== 'tray') return res.status(400).json({ message: 'Source inválido (use tray).' });

        const ext = String(path.extname(filepath || '')).toLowerCase();
        const workbook =
          ext === '.csv'
            ? xlsx.readFile(filepath, { FS: ';', raw: true })
            : xlsx.readFile(filepath);

        const sheetName = workbook.SheetNames[0];
        const jsonData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
          defval: '',
          raw: true,
        }) as Record<string, unknown>[];

        const items = jsonData
          .map((row) => standardizeTrayItem(row))
          .filter((it): it is StandardizedOrderItem => it !== null);

        // Agrupar por pedido para atualizar metadados no Order (sem alterar totalPrice,
        // pois o canal Tray pode ter desconto progressivo e o total correto vem da planilha de pedidos)
        const byOrder = new Map<string, { qty: number; firstName: string }>();
        for (const it of items) {
          const k = it.orderId;
          const prev = byOrder.get(k);
          if (!prev) byOrder.set(k, { qty: it.quantity, firstName: it.name });
          else byOrder.set(k, { qty: prev.qty + it.quantity, firstName: prev.firstName });
        }

        const ops: any[] = [];

        // upsert item por (orderId, source, productCode)
        for (const it of items) {
          ops.push(
            (prisma as any).orderItem.upsert({
              where: { orderId_source_productCode: { orderId: it.orderId, source: 'tray', productCode: it.productCode } },
              update: {
                name: it.name,
                unitPrice: it.unitPrice,
                quantity: it.quantity,
                totalPrice: it.totalPrice,
              },
              create: it,
            })
          );
        }

        // Atualiza o Order somando itens (se o pedido existir)
        for (const [orderId, agg] of byOrder.entries()) {
          ops.push(
            prisma.order.updateMany({
              where: { orderId, source: 'tray' },
              data: {
                quantity: agg.qty,
                productName: agg.firstName,
              },
            })
          );
        }

        const results = await prisma.$transaction(ops);
        const updatedOrders = results.filter((r: any) => r && typeof r.count === 'number').reduce((a: number, r: any) => a + r.count, 0);

        return res.status(200).json({
          message: 'Itens processados com sucesso.',
          items: items.length,
          ordersUpdated: updatedOrders,
        });
      } catch (e) {
        console.error(e);
        return res.status(500).json({ message: 'Erro interno.' });
      }
    });
  });

  app.get('/api/sales', async (_req, res) => {
    try {
      const sales = await prisma.order.findMany({ orderBy: { orderDate: 'desc' } });
      return res.status(200).json(sales);
    } catch (e) {
      return res.status(500).json({ message: 'Erro ao buscar vendas.' });
    }
  });

  // Remove registros por origem (ex.: ?source=tray)
  app.delete('/api/orders', async (req, res) => {
    try {
      const source = String(req.query.source ?? '').trim().toLowerCase();
      if (!source) return res.status(400).json({ message: 'Informe ?source=...' });

      const result = await prisma.order.deleteMany({ where: { source } });
      return res.status(200).json({ message: 'Removido com sucesso.', deleted: result.count, source });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao remover pedidos.' });
    }
  });

  // Remove itens/produtos por origem (ex.: ?source=tray)
  app.delete('/api/order-items', async (req, res) => {
    try {
      const source = String(req.query.source ?? '').trim().toLowerCase();
      if (!source) return res.status(400).json({ message: 'Informe ?source=...' });

      const prismaAny = prisma as any;
      if (!prismaAny.orderItem) {
        return res.status(500).json({ message: 'Model OrderItem não disponível no Prisma Client. Rode prisma generate.' });
      }

      const result = await prismaAny.orderItem.deleteMany({ where: { source } });
      return res.status(200).json({ message: 'Itens removidos com sucesso.', deleted: result.count, source });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao remover itens.' });
    }
  });

  // --- ADS Spend ---
  // GET /api/adspend?from=2026-01&to=2026-12
  app.get('/api/adspend', async (req, res) => {
    try {
      const from = req.query.from ? monthStartFromYYYYMM(String(req.query.from)) : null;
      const to = req.query.to ? monthStartFromYYYYMM(String(req.query.to)) : null;

      const where: any = {};
      if (from || to) {
        where.month = {};
        if (from) where.month.gte = from;
        if (to) where.month.lt = new Date(to.getFullYear(), to.getMonth() + 1, 1);
      }

      const prismaAny = prisma as any;
      const rows = await prismaAny.adSpend.findMany({
        where,
        orderBy: [{ month: 'asc' }, { channel: 'asc' }],
      });
      return res.status(200).json(rows);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao buscar gastos de ADS.' });
    }
  });

  // UPSERT por (month, channel)
  // body: { month: "2026-01", channel: "meta", amount: 1234.56, notes?: "" }
  app.post('/api/adspend', async (req, res) => {
    try {
      const monthStr = String(req.body?.month ?? '');
      const channel = String(req.body?.channel ?? '').trim().toLowerCase();
      const amount = parseBrNumber(req.body?.amount);
      const notes = String(req.body?.notes ?? '');

      const month = monthStartFromYYYYMM(monthStr);
      if (!month) return res.status(400).json({ message: 'month inválido. Use YYYY-MM (ex: 2026-01).' });
      if (!channel) return res.status(400).json({ message: 'channel obrigatório.' });

      const prismaAny = prisma as any;
      if (!prismaAny.adSpend) return res.status(500).json({ message: 'Model AdSpend não disponível. Rode prisma generate.' });

      const row = await prismaAny.adSpend.upsert({
        where: { month_channel: { month, channel } },
        update: { amount, notes },
        create: { month, channel, amount, notes },
      });
      return res.status(200).json(row);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao salvar gasto de ADS.' });
    }
  });

  // DELETE /api/adspend?month=2026-01&channel=meta
  app.delete('/api/adspend', async (req, res) => {
    try {
      const monthStr = String(req.query.month ?? '');
      const channel = String(req.query.channel ?? '').trim().toLowerCase();
      const month = monthStartFromYYYYMM(monthStr);
      if (!month) return res.status(400).json({ message: 'month inválido. Use YYYY-MM.' });
      if (!channel) return res.status(400).json({ message: 'channel obrigatório.' });

      const prismaAny = prisma as any;
      await prismaAny.adSpend.delete({
        where: { month_channel: { month, channel } },
      });
      return res.status(200).json({ message: 'Removido com sucesso.' });
    } catch (e: any) {
      if (String(e?.code || '') === 'P2025') {
        return res.status(200).json({ message: 'Não havia registro para remover.' });
      }
      console.error(e);
      return res.status(500).json({ message: 'Erro ao remover gasto de ADS.' });
    }
  });

  // Dashboard ADS (ROAS) baseado em Orders + AdSpend
  // GET /api/ads-dashboard?from=2026-01&to=2026-12
  app.get('/api/ads-dashboard', async (req, res) => {
    try {
      const from = req.query.from ? monthStartFromYYYYMM(String(req.query.from)) : null;
      const to = req.query.to ? monthStartFromYYYYMM(String(req.query.to)) : null;

      const orderWhere: any = {};
      if (from || to) {
        orderWhere.orderDate = {};
        if (from) orderWhere.orderDate.gte = from;
        if (to) orderWhere.orderDate.lt = new Date(to.getFullYear(), to.getMonth() + 1, 1);
      }

      const orders = await prisma.order.findMany({
        where: orderWhere,
        select: { orderDate: true, source: true, totalPrice: true, status: true },
      });

      const revenueByMonthChannel = new Map<string, number>(); // YYYY-MM|channel
      const revenueByMonthTotal = new Map<string, number>(); // YYYY-MM

      for (const o of orders) {
        if (o.status && String(o.status).toLowerCase().includes('cancelado')) continue;
        const d = new Date(o.orderDate);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const ch = String(o.source || '').toLowerCase();
        const key = `${ym}|${ch}`;
        revenueByMonthChannel.set(key, (revenueByMonthChannel.get(key) || 0) + (o.totalPrice || 0));
        revenueByMonthTotal.set(ym, (revenueByMonthTotal.get(ym) || 0) + (o.totalPrice || 0));
      }

      const prismaAny = prisma as any;
      const spendRows = await prismaAny.adSpend.findMany({
        where: (() => {
          const where: any = {};
          if (from || to) {
            where.month = {};
            if (from) where.month.gte = from;
            if (to) where.month.lt = new Date(to.getFullYear(), to.getMonth() + 1, 1);
          }
          return where;
        })(),
        orderBy: [{ month: 'asc' }, { channel: 'asc' }],
      });

      const spendByMonthChannel = new Map<string, number>(); // YYYY-MM|channel
      const spendByMonthTotal = new Map<string, number>(); // YYYY-MM
      for (const r of spendRows) {
        const d = new Date(r.month);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const ch = String(r.channel || '').toLowerCase();
        const key = `${ym}|${ch}`;
        const amt = Number(r.amount || 0);
        spendByMonthChannel.set(key, (spendByMonthChannel.get(key) || 0) + amt);
        spendByMonthTotal.set(ym, (spendByMonthTotal.get(ym) || 0) + amt);
      }

      const months = new Set<string>([...revenueByMonthTotal.keys(), ...spendByMonthTotal.keys()]);
      const monthsSorted = [...months].sort();

      const channels = new Set<string>();
      for (const k of revenueByMonthChannel.keys()) channels.add(k.split('|')[1]);
      for (const k of spendByMonthChannel.keys()) channels.add(k.split('|')[1]);
      const channelsSorted = [...channels].sort();

      const byMonth = monthsSorted.map((ym) => {
        const revenue = Number((revenueByMonthTotal.get(ym) || 0).toFixed(2));
        const spend = Number((spendByMonthTotal.get(ym) || 0).toFixed(2));
        const roas = spend > 0 ? Number((revenue / spend).toFixed(4)) : null;

        const byChannel = channelsSorted.map((ch) => {
          const rev = Number((revenueByMonthChannel.get(`${ym}|${ch}`) || 0).toFixed(2));
          const sp = Number((spendByMonthChannel.get(`${ym}|${ch}`) || 0).toFixed(2));
          const r = sp > 0 ? Number((rev / sp).toFixed(4)) : null;
          return { channel: ch, revenue: rev, spend: sp, roas: r };
        });

        return { month: ym, revenue, spend, roas, byChannel };
      });

      const totalRevenue = Number([...revenueByMonthTotal.values()].reduce((a, b) => a + b, 0).toFixed(2));
      const totalSpend = Number([...spendByMonthTotal.values()].reduce((a, b) => a + b, 0).toFixed(2));
      const totalRoas = totalSpend > 0 ? Number((totalRevenue / totalSpend).toFixed(4)) : null;

      return res.status(200).json({
        kpis: { revenue: totalRevenue, spend: totalSpend, roas: totalRoas },
        channels: channelsSorted,
        byMonth,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao gerar dashboard de ADS.' });
    }
  });
// src/index.ts (Substitua o endpoint /api/dashboard por este mais completo)

app.get('/api/dashboard', async (_req, res) => {
  try {
    // 1. Busca vendas válidas
    const sales = await prisma.order.findMany({
      where: {
        NOT: { status: { contains: 'Cancelado' } }
      },
      orderBy: { orderDate: 'asc' }
    });

    // Estruturas de dados
    const salesByChannel: Record<string, number> = {};
    const ordersByChannel: Record<string, number> = {}; // Contagem de pedidos
    const salesByMonth: Record<string, any> = {};
    const productRanking: Record<string, { quantity: number, total: number }> = {};

    sales.forEach(sale => {
      const monthYear = new Date(sale.orderDate).toLocaleDateString('pt-BR', { month: '2-digit', year: '2-digit' });
      const amount = sale.totalPrice;
      const source = sale.source;
      const product = sale.productName;

      // A. Por Canal (Receita e Volume)
      salesByChannel[source] = (salesByChannel[source] || 0) + amount;
      ordersByChannel[source] = (ordersByChannel[source] || 0) + 1;

      // B. Por Mês (Acumulando Receita e Contagem)
      if (!salesByMonth[monthYear]) {
        salesByMonth[monthYear] = { 
          name: monthYear, 
          shopee: 0, tiktok: 0, total: 0, 
          shopeeCount: 0, tiktokCount: 0, totalCount: 0 
        };
      }
      
      if (source === 'shopee') {
        salesByMonth[monthYear].shopee += amount;
        salesByMonth[monthYear].shopeeCount += 1;
      }
      if (source === 'tiktok') {
        salesByMonth[monthYear].tiktok += amount;
        salesByMonth[monthYear].tiktokCount += 1;
      }
      salesByMonth[monthYear].total += amount;
      salesByMonth[monthYear].totalCount += 1;

      // C. Ranking de Produtos
      if (!productRanking[product]) {
        productRanking[product] = { quantity: 0, total: 0 };
      }
      productRanking[product].quantity += sale.quantity;
      productRanking[product].total += amount;
    });

    // 3. Formatar
    const chartChannel = Object.keys(salesByChannel).map(key => ({
      name: key.charAt(0).toUpperCase() + key.slice(1),
      value: Number(salesByChannel[key].toFixed(2))
    }));

    const chartMonthly = Object.values(salesByMonth); // Já é um array de objetos

    // Top 5 Produtos por Faturamento
    const topProducts = Object.entries(productRanking)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const totalRevenue = chartChannel.reduce((acc, curr) => acc + curr.value, 0);
    const totalOrders = Object.values(ordersByChannel).reduce((acc, curr) => acc + curr, 0);

    return res.status(200).json({
      kpis: {
        revenue: totalRevenue,
        orders: totalOrders,
        ticketMedio: totalOrders > 0 ? totalRevenue / totalOrders : 0
      },
      byChannel: chartChannel,
      byMonth: chartMonthly,
      topProducts: topProducts
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Erro ao gerar dashboard.' });
  }
});

  app.listen(APP_PORT, () => console.log(`Rodando em ${APP_PORT}`));
}



main().catch(console.error);