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
  const s = String(v).trim();
  if (!s) return 0;
  // remove moeda e espaços, remove milhar ".", troca "," por "."
  const clean = s.replace(/R\$\s?/g, '').replace(/BRL\s?/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(clean);
  return Number.isFinite(n) ? n : 0;
}

function parseDateFlexible(v: unknown): Date | null {
  if (v === null || v === undefined) return null;

  // Se vier como Date já
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  // Se vier como número do Excel (serial date)
  if (typeof v === 'number') {
    // Excel serial -> JS Date (base 1899-12-30)
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }

  const s = String(v).trim();
  if (!s) return null;

  // tenta Date padrão
  let d = new Date(s);
  if (!isNaN(d.getTime())) return d;

  // tenta dd/mm/yyyy ou dd/mm/yyyy hh:mm
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

process.on('uncaughtException', (err) => {
  console.error('--- uncaughtException ---');
  console.error(prettyInspect(err));
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('--- unhandledRejection ---');
  console.error(prettyInspect(reason));
  process.exit(1);
});

interface StandardizedSale {
  orderId: string;
  orderDate: Date;
  productName: string;
  quantity: number;
  totalPrice: number;
  source: string;
}

const parseCurrency = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const cleanValue = value.replace(/BRL/g, '').trim().replace(/\./g, '').replace(',', '.');
    return parseFloat(cleanValue) || 0;
  }
  return 0;
};

const standardizeData = (row: Record<string, unknown>, source: string): StandardizedSale | null => {
  try {
    if (source === 'shopee') {
      const orderIdVal = pick(row, [
        'ID do pedido',
        'ID do Pedido',
        'ID do Pedido (Order ID)',
        'Order ID',
        'ID Pedido',
      ]);

      const orderDateVal = pick(row, [
        'Data de criação do pedido',
        'Data de Criação do Pedido',
        'Data do pedido',
        'Data',
        'Created Time',
      ]);

      const productNameVal = pick(row, [
        'Nome do Produto',
        'Nome do produto',
        'Produto',
        'Product Name',
        'Nome',
      ]);

      const qtyVal = pick(row, [
        'Quantidade',
        'Qty',
        'Quantity',
        'Quantidade do produto',
      ]);

      const priceVal = pick(row, [
        'Subtotal do produto',     // total do item
        'Subtotal do Produto',
        'Valor Total',             // total do pedido (às vezes repetido)
        'Total global',
        'Preço Final Total',
        'Valor',
      ]);

      const orderId = orderIdVal ? String(orderIdVal).trim() : '';
      const orderDate = parseDateFlexible(orderDateVal);
      const productName = productNameVal ? String(productNameVal).trim() : '';
      const quantity = qtyVal ? parseInt(String(qtyVal), 10) || 0 : 0;
      const totalPrice = parseBrNumber(priceVal);

      // Se faltar coisa essencial, ignora a linha (evita quebrar o Prisma)
      if (!orderId || !orderDate || isNaN(orderDate.getTime())) return null;

      return {
        orderId,
        orderDate,
        productName,
        quantity,
        totalPrice,
        source: 'shopee',
      };
    }

    if (source === 'tiktok') {
      if (!row['Order ID']) return null;

      return {
        orderId: String(row['Order ID']),
        orderDate: new Date(String(row['Created Time'] ?? '')),
        productName: String(row['Product Name'] ?? ''),
        quantity: parseInt(String(row['Quantity'] ?? '0'), 10) || 0,
        totalPrice: parseCurrency(row['Order Amount']),
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
  console.log('CWD:', process.cwd());
  console.log('Checking Prisma client folder exists:', prismaClientPath);
  console.log('DATABASE_URL present?', !!process.env.DATABASE_URL);

  if (!fs.existsSync(prismaClientPath)) {
    console.warn('Warning: Prisma client folder not found at', prismaClientPath);
    console.warn('→ Execute: npx prisma generate  (and confirm there were no errors).');
  }

  const prisma = new PrismaClient();
  await prisma.$connect();
  console.log('prisma.$connect() OK');

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.post('/api/upload', (req, res) => {
    const form = formidable({
      multiples: false,
      keepExtensions: true,
    });

    form.parse(req, async (err: unknown, fields: FormFields, files: FormFields) => {
      // DEBUG - sempre mostra o que chegou
      console.log('--- /api/upload called ---');
      console.log('FIELDS:', prettyInspect(fields));
      console.log('FILES:', prettyInspect(files));

      if (err) {
        console.error('form.parse erro:', prettyInspect(err));
        return res.status(500).json({ message: 'Erro ao processar o formulário.' });
      }

      try {
        const { key: fileKey, file } = getFileFromFormidable(files);

        if (!file) {
          return res.status(400).json({
            message: 'Nenhum arquivo recebido. Envie multipart/form-data com um campo do tipo File.',
            filesKeys: Object.keys(files as unknown as Record<string, any>),
          });
        }

        const filepath = getFilePath(file);

        if (!filepath) {
          console.error('Arquivo recebido mas sem filepath/path:', prettyInspect(file));
          return res.status(400).json({
            message: 'Arquivo recebido, mas sem filepath/path. Verifique o envio do form-data.',
            fileKeyUsed: fileKey,
            fileDump: file,
          });
        }

        const sourceRaw = (fields as any).source;
        const source = first(sourceRaw) as string | undefined;

        if (!source || (source !== 'shopee' && source !== 'tiktok')) {
          return res.status(400).json({
            message: 'Campo "source" obrigatório e deve ser "shopee" ou "tiktok".',
            received: sourceRaw,
          });
        }

        const workbook = xlsx.readFile(filepath);
        const sheetName = workbook.SheetNames[0];
        const jsonData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
          defval: '',   // células vazias viram ''
          raw: true,    // mantém número do Excel para data (a gente converte)
        }) as Record<string, unknown>[];

        const standardizedSales = jsonData
          .map((row: Record<string, unknown>) => standardizeData(row, source))
          .filter((sale: StandardizedSale | null): sale is StandardizedSale => sale !== null);

        const result = await prisma.order.createMany({
          data: standardizedSales,
          skipDuplicates: true,
        });

        return res.status(200).json({
          message: 'Arquivo processado e salvo com sucesso!',
          count: result.count,
          fileKeyUsed: fileKey,
        });
      } catch (e) {
        console.error('Erro ao ler/processar planilha ou gravar no DB:', prettyInspect(e));
        return res.status(500).json({ message: 'Erro ao ler ou processar a planilha.' });
      }
    });
  });

  app.get('/api/sales', async (_req, res) => {
    try {
      const sales = await prisma.order.findMany({ orderBy: { orderDate: 'desc' } });
      return res.status(200).json(sales);
    } catch (e) {
      console.error('Erro ao buscar vendas:', prettyInspect(e));
      return res.status(500).json({ message: 'Erro ao buscar vendas.' });
    }
  });

  const server = app.listen(APP_PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${APP_PORT}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}. Shutting down...`);
    server.close(() => console.log('HTTP server closed.'));
    try {
      await prisma.$disconnect();
      console.log('Prisma disconnected.');
    } catch (e) {
      console.error('Erro ao desconectar Prisma:', prettyInspect(e));
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((e) => {
  console.error('main() threw:', prettyInspect(e));
  process.exit(1);
});
