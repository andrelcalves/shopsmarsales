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

/** Parsea YYYY-MM-DD como meio-dia UTC para não perder um dia em fusos como Brasil. */
function parseDateOnlyAsNoonUTC(dateStr: string | null | undefined): Date | null {
  if (dateStr == null || String(dateStr).trim() === '') return null;
  const s = String(dateStr).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    const d = new Date(Date.UTC(year, month, day, 12, 0, 0, 0));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
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
  status: string;
  source: string;
  freight?: number;
  paymentType?: string; // Pagamento tipo (apenas Tray)
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

interface StandardizedShopeeItem {
  orderId: string;
  orderDate: Date;
  status: string;
  commissionFee: number | null;
  serviceFee: number | null;
  productCode: string;      // para OrderItem e Product: canal_idUnico (ex: shopee_1734118760415856191)
  name: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  discount: number | null;
}

function standardizeShopeeRow(row: Record<string, unknown>): StandardizedShopeeItem | null {
  try {
    const orderIdVal = pick(row, ['ID do pedido', 'ID do Pedido', 'Order ID']);
    const orderDateVal = pick(row, ['Data de criação do pedido', 'Data de Criação do Pedido', 'Created Time']);
    const statusVal = pick(row, ['Status do pedido', 'Status', 'Order Status']);
    const productNameVal = pick(row, ['Nome do Produto', 'Nome do produto', 'Product Name']);
    const variationVal = pick(row, ['Variation', 'Variação', 'Variacao']);
    const skuIdVal = pick(row, ['SKU ID', 'ID do SKU']);
    const qtyVal = pick(row, ['Quantidade', 'Qty', 'Quantity']);
    const priceVal = pick(row, ['SKU Subtotal After Discount', 'Subtotal do produto', 'Valor Total', 'Total global', 'Preço Final Total']);
    const unitPriceVal = pick(row, ['SKU Unit Original Price', 'Preço unitário', 'Preco unitario', 'Unit Price', 'Preço']);
    const platformDiscVal = pick(row, ['SKU Platform Discount']);
    const sellerDiscVal = pick(row, ['SKU Seller Discount']);
    const discountVal = pick(row, ['Desconto', 'Discount', 'Desconto do produto', 'Seller discount']);
    const commissionVal = pick(row, ['Net Commission Fee', 'Taxa de comissão líquida', 'Commission Fee']);
    const serviceVal = pick(row, ['Taxa de serviço bruta', 'Gross service fee', 'Service Fee', 'Taxa de servico bruta']);

    const orderId = orderIdVal ? String(orderIdVal).trim() : '';
    const orderDate = parseDateFlexible(orderDateVal);
    const status = statusVal ? String(statusVal).trim() : 'Desconhecido';
    const productName = productNameVal ? String(productNameVal).trim() : '';
    const variation = variationVal ? String(variationVal).trim() : '';
    const name = variation ? `${productName} - ${variation}` : productName;
    const skuId = skuIdVal ? String(skuIdVal).trim() : '';
    const slug = slugifyProductKey(productName, variation);
    const productCode = skuId || hashToUniqueId(slug);
    const quantity = qtyVal ? parseInt(String(qtyVal), 10) || 0 : 0;
    const totalPrice = parseBrNumber(priceVal);
    const unitPrice = unitPriceVal != null ? parseBrNumber(unitPriceVal) : (quantity > 0 ? totalPrice / quantity : 0);
    const discount = discountVal != null
      ? parseBrNumber(discountVal)
      : (platformDiscVal != null || sellerDiscVal != null)
        ? (parseBrNumber(platformDiscVal) || 0) + (parseBrNumber(sellerDiscVal) || 0) || null
        : null;
    const commissionFee = commissionVal != null ? parseBrNumber(commissionVal) : null;
    const serviceFee = serviceVal != null ? parseBrNumber(serviceVal) : null;

    if (!orderId || !orderDate || isNaN(orderDate.getTime())) return null;

    return {
      orderId,
      orderDate,
      status,
      commissionFee,
      serviceFee,
      productCode,
      name,
      unitPrice,
      quantity,
      totalPrice,
      discount,
    };
  } catch (e) {
    console.error('Erro ao padronizar linha Shopee:', e);
    return null;
  }
}

interface StandardizedTiktokItem {
  orderId: string;
  orderDate: Date;
  status: string;
  productCode: string;
  name: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  discount: number | null;
}


function standardizeTiktokRow(row: Record<string, unknown>): StandardizedTiktokItem | null {
  try {
    const orderIdVal = pick(row, ['Order ID']);
    const orderDateVal = pick(row, ['Created Time']);
    const statusVal = pick(row, ['Order Status', 'Order Substatus']);
    const productNameVal = pick(row, ['Product Name']);
    const variationVal = pick(row, ['Variation']);
    const skuIdVal = pick(row, ['SKU ID']);
    const sellerSkuVal = pick(row, ['Seller SKU']);
    const qtyVal = pick(row, ['Quantity']);
    const unitPriceVal = pick(row, ['SKU Unit Original Price']);
    const subtotalAfterVal = pick(row, ['SKU Subtotal After Discount']);
    const platformDiscountVal = pick(row, ['SKU Platform Discount']);
    const sellerDiscountVal = pick(row, ['SKU Seller Discount']);

    const orderId = orderIdVal ? String(orderIdVal).trim() : '';
    const orderDate = parseDateFlexible(orderDateVal);
    const status = statusVal ? String(statusVal).trim() : 'Desconhecido';
    const productName = productNameVal ? String(productNameVal).trim() : '';
    const variation = variationVal ? String(variationVal).trim() : '';
    const name = variation ? `${productName} - ${variation}` : productName;
    const productCode = (sellerSkuVal ? String(sellerSkuVal).trim() : null) || (skuIdVal ? String(skuIdVal).trim() : '') || `${orderId}_${(productName || 'item').slice(0, 30)}`;
    const quantity = qtyVal ? parseInt(String(qtyVal), 10) || 0 : 0;
    const unitPrice = parseBrNumber(unitPriceVal);
    const totalPrice = parseBrNumber(subtotalAfterVal);
    const discount = (parseBrNumber(platformDiscountVal) || 0) + (parseBrNumber(sellerDiscountVal) || 0) || null;

    if (!orderId || !orderDate || isNaN(orderDate.getTime())) return null;

    return {
      orderId,
      orderDate,
      status,
      productCode,
      name,
      unitPrice,
      quantity,
      totalPrice,
      discount: discount !== null && discount > 0 ? discount : null,
    };
  } catch (e) {
    console.error('Erro ao padronizar linha TikTok:', e);
    return null;
  }
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
      // CSV template: "Pedido";"Data";"Hora";"Frete valor"; ... ;"Status pedido"; ... ;"Total"; ...
      const orderIdVal = pick(row, ['Pedido', 'pedido', 'Order ID']);
      const orderDateVal = pick(row, ['Data', 'data']);
      const orderTimeVal = pick(row, ['Hora', 'hora']);
      const totalVal = pick(row, ['Total', 'total', 'Subtotal produtos', 'Subtotal produtos ']);
      const freightVal = pick(row, ['Frete valor', 'Frete', 'Valor frete']);
      const paymentTypeVal = pick(row, ['Pagamento tipo', 'Pagamento', 'Forma pagamento paga']);
      const statusVal = pick(row, ['Status pedido', 'Status', 'Status do pedido']);
      const channelVal = pick(row, ['Canal de venda', 'Canal', 'Canal']);

      const orderId = orderIdVal ? String(orderIdVal).trim() : '';
      const orderDate = parseDateAndTime(orderDateVal, orderTimeVal);
      const totalPrice = parseBrNumber(totalVal);
      const freight = freightVal != null ? parseBrNumber(freightVal) : undefined;
      const paymentType = paymentTypeVal ? String(paymentTypeVal).trim() : undefined;
      const status = statusVal ? String(statusVal).trim() : 'Desconhecido';

      if (!orderId || !orderDate || isNaN(orderDate.getTime())) return null;

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
        freight,
        paymentType,
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
    const name = nameRaw
      .replace(/<br\s*\/?>/gi, '')
      .replace(/\s*\(Disponibilidade[^)]*\)/gi, '')
      .replace(/\s*\(Imediata\)/gi, '')
      .trim();
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

function slugifyProductKey(name: string, variation: string): string {
  const s = `${name}${variation ? '_' + variation : ''}`.trim();
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'item';
}

function hashToUniqueId(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return String(Math.abs(h));
}

async function ensureProduct(prisma: any, source: string, productCode: string, name: string): Promise<number> {
  const code = `${source}_${String(productCode).trim()}`;
  const p = await prisma.product.upsert({
    where: { code },
    update: { name }, // atualiza nome em re-import (ex.: após remover "Imediata")
    create: { code, name, source },
  });
  return p.id;
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
        // CSV: Tray usa ';', TikTok/Shopee usam ','
        const workbook =
          ext === '.csv'
            ? xlsx.readFile(filepath, { FS: source === 'tray' ? ';' : ',', raw: true })
            : xlsx.readFile(filepath);
        const sheetName = workbook.SheetNames[0];
        const jsonData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
          defval: '',
          raw: true,
        }) as Record<string, unknown>[];

        if (source === 'shopee') {
          const rows = jsonData
            .map((row) => standardizeShopeeRow(row))
            .filter((r): r is StandardizedShopeeItem => r !== null);

          const byOrder = new Map<string, {
            orderDate: Date;
            status: string;
            commissionFee: number | null;
            serviceFee: number | null;
            totalPrice: number;
            productName: string;
            quantity: number;
          }>();
          for (const r of rows) {
            const key = r.orderId;
            if (!byOrder.has(key)) {
              byOrder.set(key, {
                orderDate: r.orderDate,
                status: r.status,
                commissionFee: r.commissionFee,
                serviceFee: r.serviceFee,
                totalPrice: 0,
                productName: r.name,
                quantity: 0,
              });
            }
            const agg = byOrder.get(key)!;
            agg.totalPrice += r.totalPrice;
            agg.quantity += r.quantity;
          }

          const ops: any[] = [];
          for (const [orderId, agg] of byOrder.entries()) {
            ops.push(
              prisma.order.upsert({
                where: { orderId_source: { orderId, source: 'shopee' } },
                update: {
                  orderDate: agg.orderDate,
                  status: agg.status,
                  totalPrice: Number(agg.totalPrice.toFixed(2)),
                  quantity: agg.quantity,
                  productName: agg.productName,
                  commissionFee: agg.commissionFee,
                  serviceFee: agg.serviceFee,
                },
                create: {
                  orderId,
                  source: 'shopee',
                  orderDate: agg.orderDate,
                  status: agg.status,
                  totalPrice: Number(agg.totalPrice.toFixed(2)),
                  quantity: agg.quantity,
                  productName: agg.productName,
                  commissionFee: agg.commissionFee,
                  serviceFee: agg.serviceFee,
                },
              })
            );
          }
          const productIds = new Map<string, number>();
          for (const r of rows) {
            const key = `shopee_${r.productCode}`;
            if (!productIds.has(key)) {
              const id = await ensureProduct(prisma, 'shopee', r.productCode, r.name);
              productIds.set(key, id);
            }
          }
          for (const r of rows) {
            const productId = productIds.get(`shopee_${r.productCode}`);
            ops.push(
              (prisma as any).orderItem.upsert({
                where: { orderId_source_productCode: { orderId: r.orderId, source: 'shopee', productCode: r.productCode } },
                update: {
                  name: r.name,
                  unitPrice: r.unitPrice,
                  quantity: r.quantity,
                  totalPrice: r.totalPrice,
                  discount: r.discount,
                  productId,
                },
                create: {
                  orderId: r.orderId,
                  source: 'shopee',
                  productCode: r.productCode,
                  name: r.name,
                  unitPrice: r.unitPrice,
                  quantity: r.quantity,
                  totalPrice: r.totalPrice,
                  discount: r.discount ?? 0,
                  productId,
                },
              })
            );
          }
          const results = await prisma.$transaction(ops);
          return res.status(200).json({
            message: 'Processado com sucesso.',
            count: results.length,
          });
        }

        if (source === 'tiktok') {
          const rows = jsonData
            .map((row) => standardizeTiktokRow(row))
            .filter((r): r is StandardizedTiktokItem => r !== null);

          const byOrder = new Map<string, {
            orderDate: Date;
            status: string;
            orderAmount: number;
            productName: string;
            quantity: number;
          }>();
          for (const r of rows) {
            const key = r.orderId;
            if (!byOrder.has(key)) {
              const firstMatch = jsonData.find((row) => String(row['Order ID'] ?? '').trim() === key);
              const orderAmount = parseBrNumber(firstMatch?.['Order Amount']);
              byOrder.set(key, {
                orderDate: r.orderDate,
                status: r.status,
                orderAmount,
                productName: r.name,
                quantity: 0,
              });
            }
            byOrder.get(key)!.quantity += r.quantity;
          }

          const ops: any[] = [];
          for (const [orderId, agg] of byOrder.entries()) {
            const orderTotal = agg.orderAmount > 0 ? agg.orderAmount : rows.filter((r) => r.orderId === orderId).reduce((s, r) => s + r.totalPrice, 0);
            ops.push(
              prisma.order.upsert({
                where: { orderId_source: { orderId, source: 'tiktok' } },
                update: {
                  orderDate: agg.orderDate,
                  status: agg.status,
                  totalPrice: Number(orderTotal.toFixed(2)),
                  quantity: agg.quantity,
                  productName: agg.productName,
                },
                create: {
                  orderId,
                  source: 'tiktok',
                  orderDate: agg.orderDate,
                  status: agg.status,
                  totalPrice: Number(orderTotal.toFixed(2)),
                  quantity: agg.quantity,
                  productName: agg.productName,
                },
              })
            );
          }
          const productIds = new Map<string, number>();
          for (const r of rows) {
            const key = `tiktok_${r.productCode}`;
            if (!productIds.has(key)) {
              const id = await ensureProduct(prisma, 'tiktok', r.productCode, r.name);
              productIds.set(key, id);
            }
          }
          for (const r of rows) {
            const productId = productIds.get(`tiktok_${r.productCode}`);
            ops.push(
              (prisma as any).orderItem.upsert({
                where: { orderId_source_productCode: { orderId: r.orderId, source: 'tiktok', productCode: r.productCode } },
                update: {
                  name: r.name,
                  unitPrice: r.unitPrice,
                  quantity: r.quantity,
                  totalPrice: r.totalPrice,
                  discount: r.discount,
                  productId,
                },
                create: {
                  orderId: r.orderId,
                  source: 'tiktok',
                  productCode: r.productCode,
                  name: r.name,
                  unitPrice: r.unitPrice,
                  quantity: r.quantity,
                  totalPrice: r.totalPrice,
                  discount: r.discount ?? 0,
                  productId,
                },
              })
            );
          }
          const results = await prisma.$transaction(ops);
          return res.status(200).json({ message: 'Processado com sucesso.', count: results.length });
        }

        const standardizedSales = jsonData
          .map((row) => standardizeData(row, source))
          .filter((sale): sale is StandardizedSale => sale !== null);

        const operations = standardizedSales.map((sale) => {
          const data: any = {
            orderId: sale.orderId,
            source: sale.source,
            orderDate: sale.orderDate,
            productName: sale.productName,
            quantity: sale.quantity,
            totalPrice: sale.totalPrice,
            status: sale.status,
          };
          if (sale.source === 'tray') {
            if (sale.freight != null) data.freight = sale.freight;
            if (sale.paymentType != null) data.paymentType = sale.paymentType;
          }
          return prisma.order.upsert({
            where: {
              orderId_source: {
                orderId: sale.orderId,
                source: sale.source,
              },
            },
            update: data,
            create: data,
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

        const productIds = new Map<string, number>();
        for (const it of items) {
          const key = `tray_${it.productCode}`;
          if (!productIds.has(key)) {
            const id = await ensureProduct(prisma, 'tray', it.productCode, it.name);
            productIds.set(key, id);
          }
        }

        const ops: any[] = [];

        // upsert item por (orderId, source, productCode)
        for (const it of items) {
          const productId = productIds.get(`tray_${it.productCode}`);
          ops.push(
            (prisma as any).orderItem.upsert({
              where: { orderId_source_productCode: { orderId: it.orderId, source: 'tray', productCode: it.productCode } },
              update: {
                name: it.name,
                unitPrice: it.unitPrice,
                quantity: it.quantity,
                totalPrice: it.totalPrice,
                productId,
              },
              create: { ...it, productId },
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

  app.get('/api/products', async (req, res) => {
    try {
      const q = String(req.query.q ?? '').trim();
      const where = q ? {
        OR: [
          { code: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
        ],
      } : {};
      const rows = await (prisma as any).product.findMany({
        where,
        orderBy: { name: 'asc' },
        include: { _count: { select: { orderItems: true } } },
      });
      return res.status(200).json(rows);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao buscar produtos.' });
    }
  });

  app.post('/api/products', async (req, res) => {
    try {
      const { code, name, costPrice, source } = req.body ?? {};
      const c = String(code ?? '').trim();
      const n = String(name ?? '').trim();
      const src = String(source ?? '').trim().toLowerCase();
      if (!c || !n) return res.status(400).json({ message: 'code e name obrigatórios.' });
      const lookupCode = src ? `${src}_${c}` : c;
      const row = await (prisma as any).product.upsert({
        where: { code: lookupCode },
        update: { name: n, costPrice: costPrice != null ? parseBrNumber(costPrice) : null, source: src },
        create: { code: lookupCode, name: n, costPrice: costPrice != null ? parseBrNumber(costPrice) : null, source: src },
      });
      return res.status(200).json(row);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao salvar produto.' });
    }
  });

  app.put('/api/products/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { name, costPrice } = req.body ?? {};
      const data: any = {};
      if (name != null) data.name = String(name);
      if (costPrice !== undefined) data.costPrice = costPrice === null ? null : parseBrNumber(costPrice);
      const row = await (prisma as any).product.update({ where: { id }, data });
      return res.status(200).json(row);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao atualizar produto.' });
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

  // Taxas por tipo de pagamento (Tray)
  // GET /api/payment-type-fees?month=2026-01&channel=tray
  app.get('/api/payment-type-fees', async (req, res) => {
    try {
      const monthStr = String(req.query.month ?? '').trim();
      const channel = String(req.query.channel ?? 'tray').trim().toLowerCase();
      const month = monthStartFromYYYYMM(monthStr);
      if (!month) return res.status(400).json({ message: 'Parâmetro month inválido (use YYYY-MM).' });

      const prismaAny = prisma as any;
      const rows = await prismaAny.paymentTypeFee.findMany({
        where: { month, channel },
        orderBy: { paymentType: 'asc' },
      });
      return res.status(200).json(rows);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao buscar taxas por tipo de pagamento.' });
    }
  });

  // POST /api/payment-type-fees - body: { month, channel, paymentType, percent }
  app.post('/api/payment-type-fees', async (req, res) => {
    try {
      const { month: monthStr, channel, paymentType, percent } = req.body ?? {};
      const ch = String(channel ?? 'tray').trim().toLowerCase();
      const pt = String(paymentType ?? '').trim();
      const pct = parseBrNumber(percent ?? 0);
      const month = monthStartFromYYYYMM(String(monthStr ?? ''));
      if (!month) return res.status(400).json({ message: 'month inválido. Use YYYY-MM.' });
      if (!pt) return res.status(400).json({ message: 'paymentType obrigatório.' });

      const prismaAny = prisma as any;
      const row = await prismaAny.paymentTypeFee.upsert({
        where: { month_channel_paymentType: { month, channel: ch, paymentType: pt } },
        update: { percent: pct },
        create: { month, channel: ch, paymentType: pt, percent: pct },
      });
      return res.status(200).json(row);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao salvar taxa.' });
    }
  });

  // DELETE /api/payment-type-fees?month=2026-01&channel=tray&paymentType=...
  app.delete('/api/payment-type-fees', async (req, res) => {
    try {
      const monthStr = String(req.query.month ?? '');
      const channel = String(req.query.channel ?? 'tray').trim().toLowerCase();
      const paymentType = String(req.query.paymentType ?? '').trim();
      const month = monthStartFromYYYYMM(monthStr);
      if (!month) return res.status(400).json({ message: 'month inválido. Use YYYY-MM.' });
      if (!paymentType) return res.status(400).json({ message: 'paymentType obrigatório.' });

      const prismaAny = prisma as any;
      await prismaAny.paymentTypeFee.delete({
        where: { month_channel_paymentType: { month, channel, paymentType } },
      });
      return res.status(200).json({ message: 'Removido com sucesso.' });
    } catch (e: any) {
      if (String(e?.code || '') === 'P2025') {
        return res.status(200).json({ message: 'Não havia registro para remover.' });
      }
      console.error(e);
      return res.status(500).json({ message: 'Erro ao remover taxa.' });
    }
  });

  // GET /api/payment-types - lista tipos de pagamento únicos dos pedidos Tray (para dropdown)
  app.get('/api/payment-types', async (_req, res) => {
    try {
      const rows = await prisma.order.findMany({
        where: { source: 'tray' },
      });
      const seen = new Set<string>();
      for (const r of rows) {
        const pt = (r as any).paymentType;
        if (pt && String(pt).trim()) seen.add(String(pt).trim());
      }
      const types = [...seen].sort();
      return res.status(200).json(types);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao buscar tipos de pagamento.' });
    }
  });

  // --- Estoque (data inicial + baixa por vendas + projeção) ---
  const prismaAny = prisma as any;

  app.get('/api/inventory-config', async (_req, res) => {
    try {
      const row = await prismaAny.inventoryConfig.findFirst({ orderBy: { id: 'desc' } });
      if (!row) return res.status(200).json({ stockStartDate: null });
      const d = new Date(row.stockStartDate);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return res.status(200).json({ stockStartDate: dateStr });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao buscar config de estoque.' });
    }
  });

  app.post('/api/inventory-config', async (req, res) => {
    try {
      const { stockStartDate } = req.body ?? {};
      const dateStr = String(stockStartDate ?? '').trim();
      if (!dateStr) return res.status(400).json({ message: 'stockStartDate obrigatório (YYYY-MM-DD).' });
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return res.status(400).json({ message: 'Data inválida.' });
      const existing = await prismaAny.inventoryConfig.findFirst({ orderBy: { id: 'desc' } });
      if (existing) {
        await prismaAny.inventoryConfig.update({
          where: { id: existing.id },
          data: { stockStartDate: d },
        });
      } else {
        await prismaAny.inventoryConfig.create({ data: { stockStartDate: d } });
      }
      return res.status(200).json({ stockStartDate: dateStr });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao salvar config de estoque.' });
    }
  });

  // Grupos de produtos (consolidar estoque quando o mesmo produto tem nomes diferentes nos canais)
  app.get('/api/product-groups', async (_req, res) => {
    try {
      const prismaAny = prisma as any;
      if (!prismaAny.productGroup) return res.status(200).json([]);
      const groups = await prismaAny.productGroup.findMany({
        include: {
          items: { include: { product: true } },
          stock: true,
        },
        orderBy: { id: 'asc' },
      });
      return res.status(200).json(groups);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao buscar grupos de produtos.' });
    }
  });

  app.post('/api/product-groups', async (req, res) => {
    try {
      const prismaAny = prisma as any;
      if (!prismaAny.productGroup) return res.status(500).json({ message: 'Model ProductGroup não disponível.' });
      const { name, productIds } = req.body ?? {};
      const nameStr = typeof name === 'string' ? name.trim() : '';
      const ids = Array.isArray(productIds) ? productIds.map((x: unknown) => parseInt(String(x), 10)).filter((n: number) => Number.isInteger(n) && n > 0) : [];
      if (!nameStr) return res.status(400).json({ message: 'Nome do grupo é obrigatório.' });
      if (ids.length < 2) return res.status(400).json({ message: 'Selecione pelo menos 2 produtos para formar um grupo.' });
      const group = await prismaAny.productGroup.create({
        data: { name: nameStr },
      });
      for (const pid of ids) {
        await prismaAny.productGroupItem.create({ data: { productGroupId: group.id, productId: pid } });
      }
      const created = await prismaAny.productGroup.findUnique({
        where: { id: group.id },
        include: { items: { include: { product: true } }, stock: true },
      });
      return res.status(201).json(created);
    } catch (e: any) {
      if (e?.code === 'P2002') return res.status(400).json({ message: 'Um dos produtos já pertence a outro grupo.' });
      console.error(e);
      return res.status(500).json({ message: 'Erro ao criar grupo.' });
    }
  });

  app.patch('/api/product-groups/:id', async (req, res) => {
    try {
      const prismaAny = prisma as any;
      const gid = parseInt(req.params.id, 10);
      if (!Number.isInteger(gid) || gid <= 0) return res.status(400).json({ message: 'ID do grupo inválido.' });
      const { name, productIds } = req.body ?? {};
      const updates: { name?: string; items?: { deleteMany: {}; create: { productGroupId: number; productId: number }[] } } = {};
      if (typeof name === 'string' && name.trim()) updates.name = name.trim();
      if (Array.isArray(productIds)) {
        const ids = productIds.map((x: unknown) => parseInt(String(x), 10)).filter((n: number) => Number.isInteger(n) && n > 0);
        if (ids.length >= 2) {
          await prismaAny.productGroupItem.deleteMany({ where: { productGroupId: gid } });
          for (const pid of ids) {
            await prismaAny.productGroupItem.create({ data: { productGroupId: gid, productId: pid } });
          }
        }
      }
      if (Object.keys(updates).length === 0) {
        const g = await prismaAny.productGroup.findUnique({ where: { id: gid }, include: { items: { include: { product: true } }, stock: true } });
        return res.status(200).json(g);
      }
      if (updates.name) await prismaAny.productGroup.update({ where: { id: gid }, data: { name: updates.name } });
      const updated = await prismaAny.productGroup.findUnique({
        where: { id: gid },
        include: { items: { include: { product: true } }, stock: true },
      });
      return res.status(200).json(updated);
    } catch (e: any) {
      if (e?.code === 'P2002') return res.status(400).json({ message: 'Um dos produtos já pertence a outro grupo.' });
      console.error(e);
      return res.status(500).json({ message: 'Erro ao atualizar grupo.' });
    }
  });

  app.delete('/api/product-groups/:id', async (req, res) => {
    try {
      const prismaAny = prisma as any;
      const gid = parseInt(req.params.id, 10);
      if (!Number.isInteger(gid) || gid <= 0) return res.status(400).json({ message: 'ID do grupo inválido.' });
      await prismaAny.productGroup.delete({ where: { id: gid } });
      return res.status(204).send();
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao excluir grupo.' });
    }
  });

  app.put('/api/product-group-stock', async (req, res) => {
    try {
      const prismaAny = prisma as any;
      const { productGroupId, quantity } = req.body ?? {};
      const gid = productGroupId != null ? parseInt(String(productGroupId), 10) : NaN;
      const qty = quantity != null ? parseInt(String(quantity), 10) : 0;
      if (!Number.isInteger(gid) || gid <= 0) return res.status(400).json({ message: 'productGroupId inválido.' });
      const row = await prismaAny.productGroupStock.upsert({
        where: { productGroupId: gid },
        update: { quantity: qty },
        create: { productGroupId: gid, quantity: qty },
      });
      return res.status(200).json(row);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao salvar estoque do grupo.' });
    }
  });

  app.get('/api/product-stock', async (_req, res) => {
    try {
      const rows = await prismaAny.productStock.findMany({
        include: { product: true },
        orderBy: { productId: 'asc' },
      });
      return res.status(200).json(rows);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao buscar estoque por produto.' });
    }
  });

  app.put('/api/product-stock', async (req, res) => {
    try {
      const { productId, quantity } = req.body ?? {};
      const pid = productId != null ? parseInt(String(productId), 10) : NaN;
      const qty = quantity != null ? parseInt(String(quantity), 10) : 0;
      if (!Number.isInteger(pid) || pid <= 0) return res.status(400).json({ message: 'productId inválido.' });
      const row = await prismaAny.productStock.upsert({
        where: { productId: pid },
        update: { quantity: qty },
        create: { productId: pid, quantity: qty },
      });
      return res.status(200).json(row);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao salvar estoque do produto.' });
    }
  });

  function isOrderValidForStock(o: any): boolean {
    const st = String(o.status || '').toLowerCase();
    if (st.includes('cancelado')) return false;
    if (st.includes('não pago') || st.includes('nao pago')) return false;
    return true;
  }

  app.get('/api/stock-current', async (_req, res) => {
    try {
      const config = await prismaAny.inventoryConfig.findFirst({ orderBy: { id: 'desc' } });
      const stockStartDate = config ? new Date(config.stockStartDate) : null;

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

      const result: any[] = [];
      const productIdsInGroup = new Set<number>();

      if (prismaAny.productGroup) {
        const allGroupItems = await prismaAny.productGroupItem.findMany({
          include: { productGroup: true, product: true },
        });
        allGroupItems.forEach((gi: any) => productIdsInGroup.add(gi.productId));

        const groupStockRows = await prismaAny.productGroupStock.findMany({
          include: {
            productGroup: {
              include: { items: { include: { product: true } } },
            },
          },
          orderBy: { productGroupId: 'asc' },
        });
        for (const gs of groupStockRows) {
          const group = gs.productGroup;
          const productIds = (group?.items ?? []).map((i: any) => i.productId);
          const sold = productIds.reduce((sum: number, pid: number) => sum + (soldByProduct.get(pid) || 0), 0);
          const opening = gs.quantity || 0;
          const current = Math.max(0, opening - sold);
          const firstProduct = group?.items?.[0]?.product;
          result.push({
            type: 'group',
            productGroupId: gs.productGroupId,
            productId: null,
            code: null,
            name: group?.name ?? 'Grupo',
            opening,
            sold,
            current,
            costPrice: firstProduct?.costPrice ?? null,
            productNames: (group?.items ?? []).map((i: any) => i.product?.name).filter(Boolean),
          });
        }
      }

      const stockRows = await prismaAny.productStock.findMany({
        include: { product: true },
        orderBy: { productId: 'asc' },
      });
      for (const r of stockRows) {
        if (productIdsInGroup.has(r.productId)) continue;
        const opening = r.quantity || 0;
        const sold = soldByProduct.get(r.productId) || 0;
        const current = Math.max(0, opening - sold);
        result.push({
          type: 'product',
          productGroupId: null,
          productId: r.productId,
          code: r.product?.code,
          name: r.product?.name,
          opening,
          sold,
          current,
          costPrice: r.product?.costPrice,
        });
      }

      result.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      return res.status(200).json({
        stockStartDate: stockStartDate ? stockStartDate.toISOString().slice(0, 10) : null,
        items: result,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao calcular estoque atual.' });
    }
  });

    // --- Contas a pagar (Bills) ---
  const updateBillStatus = async (billId: number) => {
    const prismaAny = prisma as any;
    const bill = await prismaAny.bill.findUnique({
      where: { id: billId },
      include: { payments: true },
    });
    if (!bill) return;
    const totalPaid = (bill.payments || []).reduce(
      (s: number, p: any) => s + (p.paidAt != null ? (p.amount || 0) : 0),
      0
    );
    let status = 'pending';
    if (totalPaid >= bill.totalAmount) status = 'paid';
    else if (totalPaid > 0) status = 'partial';
    await prismaAny.bill.update({
      where: { id: billId },
      data: { status },
    });
  };

  app.get('/api/bills', async (req, res) => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status.trim() : undefined;
      const prismaAny = prisma as any;
      const where: any = status ? { status } : {};
      const bills = await prismaAny.bill.findMany({
        where,
        include: { payments: { orderBy: { dueDate: 'asc' } } },
        orderBy: { createdAt: 'desc' },
      });
      return res.status(200).json(bills);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao buscar contas a pagar.' });
    }
  });

  app.get('/api/bills/:id', async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ message: 'ID inválido.' });
      const prismaAny = prisma as any;
      const bill = await prismaAny.bill.findUnique({
        where: { id },
        include: { payments: { orderBy: { dueDate: 'asc' } } },
      });
      if (!bill) return res.status(404).json({ message: 'Conta não encontrada.' });
      return res.status(200).json(bill);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao buscar conta.' });
    }
  });

  app.post('/api/bills', async (req, res) => {
    try {
      const description = String(req.body?.description ?? '').trim();
      const invoiceNumber = req.body?.invoiceNumber != null ? String(req.body.invoiceNumber).trim() || null : null;
      const totalAmount = parseBrNumber(req.body?.totalAmount);
      const dueDateStr = req.body?.dueDate ? String(req.body.dueDate).trim() : null;
      if (!description) return res.status(400).json({ message: 'Descrição obrigatória.' });
      if (totalAmount <= 0) return res.status(400).json({ message: 'Valor total deve ser maior que zero.' });

      const dueDate = parseDateOnlyAsNoonUTC(dueDateStr);

      const prismaAny = prisma as any;
      const bill = await prismaAny.bill.create({
        data: { description, invoiceNumber, totalAmount, dueDate, status: 'pending' },
      });
      return res.status(200).json(bill);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao criar conta a pagar.' });
    }
  });

  app.patch('/api/bills/:id', async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ message: 'ID inválido.' });
      const description = req.body?.description != null ? String(req.body.description).trim() : undefined;
      const invoiceNumber = req.body?.invoiceNumber !== undefined ? (req.body.invoiceNumber ? String(req.body.invoiceNumber).trim() || null : null) : undefined;
      const totalAmount = req.body?.totalAmount != null ? parseBrNumber(req.body.totalAmount) : undefined;
      const dueDateStr = req.body?.dueDate;

      let dueDate: Date | null | undefined = undefined;
      if (dueDateStr !== undefined) {
        dueDate = dueDateStr === null || dueDateStr === '' ? null : parseDateOnlyAsNoonUTC(dueDateStr) ?? undefined;
      }

      const prismaAny = prisma as any;
      const data: any = {};
      if (description !== undefined) data.description = description;
      if (invoiceNumber !== undefined) data.invoiceNumber = invoiceNumber;
      if (totalAmount !== undefined) data.totalAmount = totalAmount;
      if (dueDate !== undefined) data.dueDate = dueDate;
      const bill = await prismaAny.bill.update({ where: { id }, data });
      await updateBillStatus(id);
      const updated = await prismaAny.bill.findUnique({
        where: { id },
        include: { payments: { orderBy: { dueDate: 'asc' } } },
      });
      return res.status(200).json(updated);
    } catch (e: any) {
      if (String(e?.code) === 'P2025') return res.status(404).json({ message: 'Conta não encontrada.' });
      console.error(e);
      return res.status(500).json({ message: 'Erro ao atualizar conta.' });
    }
  });

  app.delete('/api/bills/:id', async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ message: 'ID inválido.' });
      const prismaAny = prisma as any;
      await prismaAny.bill.delete({ where: { id } });
      return res.status(200).json({ message: 'Removido com sucesso.' });
    } catch (e: any) {
      if (String(e?.code) === 'P2025') return res.status(404).json({ message: 'Conta não encontrada.' });
      console.error(e);
      return res.status(500).json({ message: 'Erro ao remover conta.' });
    }
  });

  app.post('/api/bills/:id/payments', async (req, res) => {
    try {
      const billId = parseInt(String(req.params.id), 10);
      if (isNaN(billId)) return res.status(400).json({ message: 'ID da conta inválido.' });
      const amount = parseBrNumber(req.body?.amount);
      const dueDateStr = String(req.body?.dueDate ?? '').trim();
      const paidAtStr = req.body?.paidAt ? String(req.body.paidAt).trim() : null;
      const notes = String(req.body?.notes ?? '').trim();
      if (amount <= 0) return res.status(400).json({ message: 'Valor da parcela deve ser maior que zero.' });
      const dueDate = parseDateOnlyAsNoonUTC(dueDateStr);
      if (!dueDate) return res.status(400).json({ message: 'Data de vencimento inválida (use YYYY-MM-DD).' });
      const paidAt = parseDateOnlyAsNoonUTC(paidAtStr);


      const prismaAny = prisma as any;
      await prismaAny.billPayment.create({
        data: { billId, amount, dueDate, paidAt, notes },
      });
      await updateBillStatus(billId);
      const bill = await prismaAny.bill.findUnique({
        where: { id: billId },
        include: { payments: { orderBy: { dueDate: 'asc' } } },
      });
      return res.status(200).json(bill);
    } catch (e: any) {
      if (String(e?.code) === 'P2003') return res.status(404).json({ message: 'Conta não encontrada.' });
      console.error(e);
      return res.status(500).json({ message: 'Erro ao registrar parcela.' });
    }
  });

  // Gerar parcelas (até 4 ou mais vencimentos): body { installments: [ { dueDate, amount }, ... ] }
  app.post('/api/bills/:id/installments', async (req, res) => {
    try {
      const billId = parseInt(String(req.params.id), 10);
      if (isNaN(billId)) return res.status(400).json({ message: 'ID da conta inválido.' });
      const installments = req.body?.installments;
      if (!Array.isArray(installments) || installments.length === 0) {
        return res.status(400).json({ message: 'Envie installments: [ { dueDate, amount }, ... ] com ao menos uma parcela.' });
      }

      const prismaAny = prisma as any;
      const bill = await prismaAny.bill.findUnique({ where: { id: billId } });
      if (!bill) return res.status(404).json({ message: 'Conta não encontrada.' });

      for (const item of installments) {
        const dueDateStr = String(item?.dueDate ?? '').trim();
        const amount = parseBrNumber(item?.amount);
        if (amount <= 0) continue;
        const dueDate = parseDateOnlyAsNoonUTC(dueDateStr);
        if (!dueDate) continue;
        await prismaAny.billPayment.create({
          data: { billId, amount, dueDate, paidAt: null, notes: '' },
        });
      }
      await updateBillStatus(billId);
      const updated = await prismaAny.bill.findUnique({
        where: { id: billId },
        include: { payments: { orderBy: { dueDate: 'asc' } } },
      });
      return res.status(200).json(updated);
    } catch (e: any) {
      if (String(e?.code) === 'P2003') return res.status(404).json({ message: 'Conta não encontrada.' });
      console.error(e);
      return res.status(500).json({ message: 'Erro ao gerar parcelas.' });
    }
  });

  app.patch('/api/bills/:id/payments/:paymentId', async (req, res) => {
    try {
      const billId = parseInt(String(req.params.id), 10);
      const paymentId = parseInt(String(req.params.paymentId), 10);
      if (isNaN(billId) || isNaN(paymentId)) return res.status(400).json({ message: 'IDs inválidos.' });
      const amount = req.body?.amount != null ? parseBrNumber(req.body.amount) : undefined;
      const dueDateStr = req.body?.dueDate;
      const paidAtStr = req.body?.paidAt;
      const notes = req.body?.notes !== undefined ? String(req.body.notes).trim() : undefined;
      let dueDate: Date | undefined;
      if (dueDateStr != null) {
        const d = parseDateOnlyAsNoonUTC(dueDateStr);
        if (d) dueDate = d;
      }
      let paidAt: Date | null | undefined = undefined;
      if (paidAtStr !== undefined) {
        paidAt = paidAtStr === null || paidAtStr === '' ? null : parseDateOnlyAsNoonUTC(paidAtStr) ?? undefined;
      }

      const prismaAny = prisma as any;
      const data: any = {};
      if (amount !== undefined) data.amount = amount;
      if (dueDate !== undefined) data.dueDate = dueDate;
      if (paidAt !== undefined) data.paidAt = paidAt;
      if (notes !== undefined) data.notes = notes;
      await prismaAny.billPayment.updateMany({
        where: { id: paymentId, billId },
        data,
      });
      await updateBillStatus(billId);
      const bill = await prismaAny.bill.findUnique({
        where: { id: billId },
        include: { payments: { orderBy: { dueDate: 'asc' } } },
      });
      return res.status(200).json(bill);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao atualizar parcela.' });
    }
  });

  app.delete('/api/bills/:id/payments/:paymentId', async (req, res) => {
    try {
      const billId = parseInt(String(req.params.id), 10);
      const paymentId = parseInt(String(req.params.paymentId), 10);
      if (isNaN(billId) || isNaN(paymentId)) return res.status(400).json({ message: 'IDs inválidos.' });
      const prismaAny = prisma as any;
      await prismaAny.billPayment.deleteMany({ where: { id: paymentId, billId } });
      await updateBillStatus(billId);
      const bill = await prismaAny.bill.findUnique({
        where: { id: billId },
        include: { payments: { orderBy: { dueDate: 'asc' } } },
      });
      return res.status(200).json(bill);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao remover parcela.' });
    }
  });

  app.get('/api/stock-projection', async (_req, res) => {
    try {
      const config = await prismaAny.inventoryConfig.findFirst({ orderBy: { id: 'desc' } });
      const stockStartDate = config ? new Date(config.stockStartDate) : null;

      const orderItems = await prisma.orderItem.findMany({
        where: { productId: { not: null } },
        select: { productId: true, unitPrice: true },
      });
      const avgPriceByProduct = new Map<number, number>();
      const countByProduct = new Map<number, number>();
      for (const i of orderItems) {
        const pid = i.productId!;
        const prevSum = avgPriceByProduct.get(pid) || 0;
        const prevCount = countByProduct.get(pid) || 0;
        avgPriceByProduct.set(pid, prevSum + (i.unitPrice || 0));
        countByProduct.set(pid, prevCount + 1);
      }
      for (const [pid, sum] of avgPriceByProduct) {
        const c = countByProduct.get(pid) || 1;
        avgPriceByProduct.set(pid, c > 0 ? sum / c : 0);
      }

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

      let projectedRevenue = 0;
      let projectedCost = 0;
      const details: any[] = [];
      const productIdsInGroup = new Set<number>();

      if (prismaAny.productGroupItem) {
        const allGroupItems = await prismaAny.productGroupItem.findMany({});
        allGroupItems.forEach((gi: any) => productIdsInGroup.add(gi.productId));
      }
      if (prismaAny.productGroupStock) {
        const groupStockRows = await prismaAny.productGroupStock.findMany({
          include: {
            productGroup: {
              include: { items: { include: { product: true } } },
            },
          },
        });
        for (const gs of groupStockRows) {
          const group = gs.productGroup;
          const productIds = (group?.items ?? []).map((i: any) => i.productId);
          const sold = productIds.reduce((sum: number, pid: number) => sum + (soldByProduct.get(pid) || 0), 0);
          const opening = gs.quantity || 0;
          const current = Math.max(0, opening - sold);
          const items = group?.items ?? [];
          const avgUnitPrice =
            items.length > 0
              ? items.reduce((s: number, i: any) => s + (avgPriceByProduct.get(i.productId) ?? i.product?.costPrice ?? 0), 0) / items.length
              : 0;
          const costPrice = items[0]?.product?.costPrice ?? 0;
          const unitPrice = avgUnitPrice || costPrice || 0;
          projectedRevenue += current * unitPrice;
          projectedCost += current * costPrice;
          details.push({
            type: 'group',
            productGroupId: gs.productGroupId,
            productId: null,
            name: group?.name ?? 'Grupo',
            current,
            unitPrice,
            revenue: Math.round(current * unitPrice * 100) / 100,
          });
        }
      }

      const stockRows = await prismaAny.productStock.findMany({
        include: { product: true },
      });
      for (const r of stockRows) {
        if (productIdsInGroup.has(r.productId)) continue;
        const opening = r.quantity || 0;
        const sold = soldByProduct.get(r.productId) || 0;
        const current = Math.max(0, opening - sold);
        const costPrice = r.product?.costPrice ?? 0;
        const avgUnitPrice = avgPriceByProduct.get(r.productId) ?? costPrice ?? 0;
        const unitPrice = avgUnitPrice || costPrice || 0;
        projectedRevenue += current * unitPrice;
        projectedCost += current * costPrice;
        details.push({
          type: 'product',
          productGroupId: null,
          productId: r.productId,
          name: r.product?.name,
          current,
          unitPrice,
          revenue: Math.round(current * unitPrice * 100) / 100,
        });
      }

      return res.status(200).json({
        stockStartDate: stockStartDate ? stockStartDate.toISOString().slice(0, 10) : null,
        projectedRevenue: Math.round(projectedRevenue * 100) / 100,
        projectedCost: Math.round(projectedCost * 100) / 100,
        details,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao calcular projeção.' });
    }
  });

  // Simulação P&L por mês e canal
  // GET /api/simulation?month=2026-01&channel=shopee|tiktok|tray|all&fixedCost=2459&cardPixPercent=3.63
  app.get('/api/simulation', async (req, res) => {
    try {
      const monthStr = String(req.query.month ?? '').trim();
      const channel = String(req.query.channel ?? 'all').trim().toLowerCase();
      const fixedCost = parseBrNumber(req.query.fixedCost ?? 0);
      const cardPixPercent = parseBrNumber(req.query.cardPixPercent ?? 3.63);
      const taxPercent = 5;

      const monthStart = monthStartFromYYYYMM(monthStr);
      if (!monthStart) return res.status(400).json({ message: 'Parâmetro month inválido (use YYYY-MM).' });

      const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
      const orderWhere: any = {
        orderDate: { gte: monthStart, lt: monthEnd },
        NOT: [
          { status: { contains: 'ancelado', mode: 'insensitive' } },
          { status: { contains: 'Não pago', mode: 'insensitive' } },
        ],
      };
      if (channel !== 'all') orderWhere.source = channel;

      const orders = await prisma.order.findMany({
        where: orderWhere,
        include: { items: { include: { product: true } } },
      });

      const totalRevenue = orders.reduce((s, o) => s + (o.totalPrice || 0), 0);

      const shopeeFees = channel === 'tray' || channel === 'tiktok' ? 0 : orders
        .filter((o) => o.source === 'shopee')
        .reduce((s, o) => s + (o.commissionFee || 0) + (o.serviceFee || 0), 0);

      const tiktokFees = channel === 'tray' || channel === 'shopee' ? 0 : orders
        .filter((o) => o.source === 'tiktok')
        .reduce((s, o) => s + (o.commissionFee || 0) + (o.serviceFee || 0), 0);

      const trayOrders = orders.filter((o) => o.source === 'tray');
      const trayRevenue = channel === 'tray' ? totalRevenue : (channel === 'all' ? trayOrders.reduce((s, o) => s + (o.totalPrice || 0), 0) : 0);
      let cardPix = 0;
      if (channel === 'tray' || channel === 'all') {
        const prismaAny = prisma as any;
        const feeRows = await prismaAny.paymentTypeFee.findMany({
          where: { month: monthStart, channel: 'tray' },
        });
        const feeMap = new Map<string, number>();
        for (const r of feeRows) feeMap.set(String(r.paymentType || '').trim(), Number(r.percent || 0));
        for (const o of trayOrders) {
          const pt = String((o as any).paymentType || '').trim();
          const pct = feeMap.get(pt) ?? cardPixPercent;
          cardPix += (o.totalPrice || 0) * (pct / 100);
        }
      }

      const freight = (channel === 'tray' || channel === 'all')
        ? orders
            .filter((o) => o.source === 'tray')
            .reduce((s, o) => s + ((o as any).freight || 0), 0)
        : 0;

      const productionCost = orders.reduce((s, o) => {
        for (const item of o.items) {
          const cost = (item.product?.costPrice ?? 0) * (item.quantity || 0);
          s += cost;
        }
        return s;
      }, 0);

      const prismaAny = prisma as any;
      const adSpendRows = await prismaAny.adSpend.findMany({
        where: {
          month: { gte: monthStart, lt: monthEnd },
          ...(channel !== 'all' ? { channel } : {}),
        },
      });
      const adsSpend = adSpendRows.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

      const allOrdersForProportion = channel !== 'all'
        ? await prisma.order.findMany({
            where: {
              orderDate: { gte: monthStart, lt: monthEnd },
              NOT: [
                { status: { contains: 'ancelado', mode: 'insensitive' } },
                { status: { contains: 'Não pago', mode: 'insensitive' } },
              ],
            },
          })
        : orders;
      const totalRevenueAll = allOrdersForProportion.reduce((s, o) => s + (o.totalPrice || 0), 0);
      const fixedCostProportional = totalRevenueAll > 0 && channel !== 'all'
        ? fixedCost * (totalRevenue / totalRevenueAll)
        : fixedCost;

      const tax = totalRevenue * (taxPercent / 100);
      const profit = totalRevenue - adsSpend - shopeeFees - tiktokFees - cardPix - freight - productionCost - fixedCostProportional - tax;
      const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

      return res.status(200).json({
        month: monthStr,
        channel,
        faturamentoBruto: Number(totalRevenue.toFixed(2)),
        adsInvestimento: Number(adsSpend.toFixed(2)),
        adsPercent: totalRevenue > 0 ? Number((adsSpend / totalRevenue * 100).toFixed(2)) : 0,
        taxasShopee: Number(shopeeFees.toFixed(2)),
        taxasShopeePercent: totalRevenue > 0 ? Number((shopeeFees / totalRevenue * 100).toFixed(2)) : 0,
        taxasTiktok: Number(tiktokFees.toFixed(2)),
        taxasTiktokPercent: totalRevenue > 0 ? Number((tiktokFees / totalRevenue * 100).toFixed(2)) : 0,
        taxasCartaoPix: Number(cardPix.toFixed(2)),
        taxasCartaoPixPercent: totalRevenue > 0 ? Number((cardPix / totalRevenue * 100).toFixed(2)) : 0,
        frete: Number(freight.toFixed(2)),
        fretePercent: totalRevenue > 0 ? Number((freight / totalRevenue * 100).toFixed(2)) : 0,
        custoProducao: Number(productionCost.toFixed(2)),
        custoProducaoPercent: totalRevenue > 0 ? Number((productionCost / totalRevenue * 100).toFixed(2)) : 0,
        custoFixo: Number(fixedCostProportional.toFixed(2)),
        custoFixoPercent: totalRevenue > 0 ? Number((fixedCostProportional / totalRevenue * 100).toFixed(2)) : 0,
        imposto: Number(tax.toFixed(2)),
        impostoPercent: taxPercent,
        lucroLiquido: Number(profit.toFixed(2)),
        margemLucro: Number(margin.toFixed(2)),
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao calcular simulação.' });
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
        const status = String(o.status || '').toLowerCase();
        if (status.includes('cancelado')) continue;
        if (status.includes('não pago') || status.includes('nao pago')) continue;
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
        NOT: [
          { status: { contains: 'Cancelado' } },
          { status: { contains: 'Não pago' } }
        ]
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
          shopee: 0, tiktok: 0, tray: 0, total: 0, 
          shopeeCount: 0, tiktokCount: 0, trayCount: 0, totalCount: 0 
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
      if (source === 'tray') {
        salesByMonth[monthYear].tray += amount;
        salesByMonth[monthYear].trayCount += 1;
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

  // Vendas por dia por canal: GET /api/sales-by-day?month=2026-02
  app.get('/api/sales-by-day', async (req, res) => {
    try {
      const monthStr = String(req.query.month ?? '').trim();
      const monthStart = monthStr ? monthStartFromYYYYMM(monthStr) : null;
      const start = monthStart || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);

      const orders = await prisma.order.findMany({
        where: {
          orderDate: { gte: start, lt: end },
          NOT: [
            { status: { contains: 'ancelado', mode: 'insensitive' } },
            { status: { contains: 'Não pago', mode: 'insensitive' } },
          ],
        },
        select: { orderDate: true, source: true, totalPrice: true },
      });

      const byDay: Record<string, { shopee: number; tiktok: number; tray: number; total: number }> = {};
      const dayKeys: string[] = [];
      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        byDay[key] = { shopee: 0, tiktok: 0, tray: 0, total: 0 };
        dayKeys.push(key);
      }

      for (const o of orders) {
        const d = new Date(o.orderDate);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!byDay[key]) {
          byDay[key] = { shopee: 0, tiktok: 0, tray: 0, total: 0 };
          dayKeys.push(key);
          dayKeys.sort();
        }
        const amt = o.totalPrice || 0;
        byDay[key].total += amt;
        if (o.source === 'shopee') byDay[key].shopee += amt;
        else if (o.source === 'tiktok') byDay[key].tiktok += amt;
        else if (o.source === 'tray') byDay[key].tray += amt;
      }

      const rows = dayKeys.map((k) => ({
        date: k,
        name: new Date(k + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        ...byDay[k],
      }));

      return res.status(200).json(rows);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: 'Erro ao buscar vendas por dia.' });
    }
  });

  app.listen(APP_PORT, () => console.log(`Rodando em ${APP_PORT}`));
}



main().catch(console.error);