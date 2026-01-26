// backend/src/index.ts
import express from 'express';
import cors from 'cors';
import formidable from 'formidable';
import * as xlsx from 'xlsx';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();

// Middlewares
app.use(cors()); // Habilita o CORS para todas as rotas
app.use(express.json()); // Permite que o express entenda JSON

// --- Lógica de Padronização (a mesma de antes) ---
interface StandardizedSale {
  orderId: string;
  orderDate: Date;
  productName: string;
  quantity: number;
  totalPrice: number;
  source: string;
}

const standardizeData = (row: any, source: string): StandardizedSale | null => {
  try {
    if (source === 'shopee') {
      return {
        orderId: row['ID do Pedido'],
        orderDate: new Date(row['Data de Criação do Pedido']),
        productName: row['Nome do Produto'],
        quantity: parseInt(row['Quantidade'], 10),
        totalPrice: parseFloat(row['Preço Final Total']),
        source: 'shopee',
      };
    }
    if (source === 'tiktok') {
      // ATENÇÃO: Verifique os nomes exatos das colunas na sua planilha
      return {
        orderId: row['order_id'],
        orderDate: new Date(row['create_time']),
        productName: row['product_name'],
        quantity: parseInt(row['quantity'], 10),
        totalPrice: parseFloat(row['total_amount']),
        source: 'tiktok',
      };
    }
    return null;
  } catch (error) {
    console.error('Erro ao padronizar a linha:', row, error);
    return null;
  }
};
// --- Fim da Lógica de Padronização ---

// Rota de Upload
app.post('/api/upload', (req, res) => {
  const form = new formidable.IncomingForm();

    form.parse(req, async (err: any, fields: any, files: any) => {
    if (err) {
      return res.status(500).json({ message: 'Erro ao processar o formulário.' });
    }

    const file = files.file as any;
    const source = fields.source as string;

    try {
      const workbook = xlsx.readFile(file.filepath);
      const sheetName = workbook.SheetNames[0];
      const jsonData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

      const standardizedSales = jsonData
        .map((row) => standardizeData(row, source))
        .filter((sale): sale is StandardizedSale => sale !== null);

      const result = await prisma.sale.createMany({
        data: standardizedSales,
        skipDuplicates: true,
      });

      res.status(200).json({
        message: 'Arquivo processado e salvo com sucesso!',
        count: result.count,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Erro ao ler ou processar a planilha.' });
    }
  });
});

// Rota para buscar todas as vendas
app.get('/api/sales', async (req, res) => {
  try {
    const sales = await prisma.sale.findMany({
      orderBy: { orderDate: 'desc' },
    });
    res.status(200).json(sales);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar vendas.' });
  }
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta http://localhost:${PORT}`);
});
