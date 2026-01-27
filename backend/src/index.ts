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
  let d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]) - 1;
    const yyyy = Number(m[3]);
    const hh = Number(m[4] ?? 0);
    const min = Number(m[5] ?? 0);
    const ss = Number(m[6] ?? 0);
    d = new Date(yyyy, mm, dd, hh, min, ss);
    return isNaN(d.getTime()) ? null : d;
  }
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

    return null;
  } catch (e) {
    console.error('Erro ao padronizar linha:', prettyInspect({ row, source, e }));
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

        if (!source || (source !== 'shopee' && source !== 'tiktok')) {
          return res.status(400).json({ message: 'Source inválido.' });
        }

        const workbook = xlsx.readFile(filepath);
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

  app.get('/api/sales', async (_req, res) => {
    try {
      const sales = await prisma.order.findMany({ orderBy: { orderDate: 'desc' } });
      return res.status(200).json(sales);
    } catch (e) {
      return res.status(500).json({ message: 'Erro ao buscar vendas.' });
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