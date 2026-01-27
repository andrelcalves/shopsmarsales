// src/index.ts
import express from 'express';
import cors from 'cors';
import formidable from 'formidable';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import util from 'util';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const xlsx = require('xlsx');
const APP_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
const prismaClientPath = path.join(process.cwd(), 'node_modules', '.prisma', 'client');
function prettyInspect(obj) {
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
const parseCurrency = (value) => {
    if (typeof value === 'number')
        return value;
    if (typeof value === 'string') {
        const cleanValue = value.replace(/BRL/g, '').trim().replace(/\./g, '').replace(',', '.');
        return parseFloat(cleanValue) || 0;
    }
    return 0;
};
const standardizeData = (row, source) => {
    try {
        if (source === 'shopee') {
            return {
                orderId: String(row['ID do Pedido'] ?? ''),
                orderDate: new Date(String(row['Data de Criação do Pedido'] ?? '')),
                productName: String(row['Nome do Produto'] ?? ''),
                quantity: parseInt(String(row['Quantidade'] ?? '0'), 10) || 0,
                totalPrice: parseFloat(String(row['Preço Final Total'] ?? '0')) || 0,
                source: 'shopee',
            };
        }
        if (source === 'tiktok') {
            if (!row['Order ID'])
                return null;
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
    }
    catch (e) {
        console.error('Erro ao padronizar linha:', prettyInspect({ row, source, e }));
        return null;
    }
};
function first(v) {
    if (!v)
        return undefined;
    return Array.isArray(v) ? v[0] : v;
}
function getFileFromFormidable(files) {
    const filesObj = files;
    const keys = Object.keys(filesObj || {});
    if (keys.length === 0)
        return { key: undefined, file: undefined };
    const key = keys[0];
    const uploaded = filesObj[key];
    const file = Array.isArray(uploaded) ? uploaded[0] : uploaded;
    return { key, file };
}
function getFilePath(file) {
    if (!file)
        return undefined;
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
        form.parse(req, async (err, fields, files) => {
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
                        filesKeys: Object.keys(files),
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
                const sourceRaw = fields.source;
                const source = first(sourceRaw);
                if (!source || (source !== 'shopee' && source !== 'tiktok')) {
                    return res.status(400).json({
                        message: 'Campo "source" obrigatório e deve ser "shopee" ou "tiktok".',
                        received: sourceRaw,
                    });
                }
                const workbook = xlsx.readFile(filepath);
                const sheetName = workbook.SheetNames[0];
                const jsonData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
                const standardizedSales = jsonData
                    .map((row) => standardizeData(row, source))
                    .filter((sale) => sale !== null);
                const result = await prisma.order.createMany({
                    data: standardizedSales,
                    skipDuplicates: true,
                });
                return res.status(200).json({
                    message: 'Arquivo processado e salvo com sucesso!',
                    count: result.count,
                    fileKeyUsed: fileKey,
                });
            }
            catch (e) {
                console.error('Erro ao ler/processar planilha ou gravar no DB:', prettyInspect(e));
                return res.status(500).json({ message: 'Erro ao ler ou processar a planilha.' });
            }
        });
    });
    app.get('/api/sales', async (_req, res) => {
        try {
            const sales = await prisma.order.findMany({ orderBy: { orderDate: 'desc' } });
            return res.status(200).json(sales);
        }
        catch (e) {
            console.error('Erro ao buscar vendas:', prettyInspect(e));
            return res.status(500).json({ message: 'Erro ao buscar vendas.' });
        }
    });
    const server = app.listen(APP_PORT, () => {
        console.log(`🚀 Servidor rodando em http://localhost:${APP_PORT}`);
    });
    const shutdown = async (signal) => {
        console.log(`\nReceived ${signal}. Shutting down...`);
        server.close(() => console.log('HTTP server closed.'));
        try {
            await prisma.$disconnect();
            console.log('Prisma disconnected.');
        }
        catch (e) {
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
