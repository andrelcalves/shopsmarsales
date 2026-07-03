/**
 * Remove pedidos por source e intervalo de orderDate (mês inclusive).
 *
 * Uso (na pasta backend, com DATABASE_URL no .env ou variável de ambiente):
 *   node scripts/delete-orders-by-filter.cjs --source tray_atacado --from 2026-06 --to 2026-06 --dry-run
 *   node scripts/delete-orders-by-filter.cjs --source tray_atacado --from 2026-06 --to 2026-06
 */
const { PrismaClient } = require('@prisma/client');

function parseArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx < 0 || idx >= process.argv.length - 1) return '';
  return String(process.argv[idx + 1]).trim();
}

function monthStartFromYYYYMM(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || '').trim());
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  if (mo < 1 || mo > 12) return null;
  return new Date(y, mo - 1, 1);
}

function buildDateRange(fromStr, toStr) {
  const from = monthStartFromYYYYMM(fromStr);
  const to = monthStartFromYYYYMM(toStr);
  if (!from || !to) return null;
  const start = from.getTime() <= to.getTime() ? from : to;
  const endInclusive = from.getTime() <= to.getTime() ? to : from;
  const endExclusive = new Date(endInclusive.getFullYear(), endInclusive.getMonth() + 1, 1);
  return { gte: start, lt: endExclusive };
}

const dryRun = process.argv.includes('--dry-run');
const source = parseArg('--source');
const fromStr = parseArg('--from');
const toStr = parseArg('--to') || fromStr;

async function main() {
  if (!source) {
    console.error('Informe --source (ex.: tray_atacado).');
    process.exit(1);
  }
  if (!fromStr) {
    console.error('Informe --from YYYY-MM (e opcionalmente --to YYYY-MM).');
    process.exit(1);
  }

  const orderDate = buildDateRange(fromStr, toStr);
  if (!orderDate) {
    console.error('Datas inválidas. Use YYYY-MM em --from e --to.');
    process.exit(1);
  }

  const where = { source, orderDate };
  const prisma = new PrismaClient();

  try {
    const orders = await prisma.order.findMany({
      where,
      select: { id: true, orderId: true, orderDate: true, totalPrice: true },
      orderBy: [{ orderDate: 'asc' }, { orderId: 'asc' }],
    });

    const totalRevenue = orders.reduce((s, o) => s + (o.totalPrice || 0), 0);
    const roundedRevenue = Math.round(totalRevenue * 100) / 100;

    console.log(`Filtro: source=${source}, orderDate >= ${orderDate.gte.toISOString()} e < ${orderDate.lt.toISOString()}`);
    console.log(`Encontrados ${orders.length} pedido(s), faturamento R$ ${roundedRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);

    if (orders.length === 0) {
      console.log('Nada a remover.');
      return;
    }

    const orderIds = orders.map((o) => o.orderId);
    console.log('orderIds:', orderIds.join(', '));

    if (dryRun) {
      console.log('Dry-run: nenhum registro removido.');
      return;
    }

    const result = await prisma.order.deleteMany({ where });
    console.log(`Removidos ${result.count} pedido(s). Itens e devoluções apagados em cascata.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
