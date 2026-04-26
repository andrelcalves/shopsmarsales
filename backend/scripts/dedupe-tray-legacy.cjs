/**
 * Remove pedidos com source = "tray" (legado) quando já existe o mesmo orderId
 * em tray_atacado ou tray_varejo — evita contagem dupla após migração de importação.
 *
 * Uso (na pasta backend, com DATABASE_URL no .env):
 *   node scripts/dedupe-tray-legacy.cjs
 *   node scripts/dedupe-tray-legacy.cjs --dry-run
 */
const { PrismaClient } = require('@prisma/client');

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRaw`
      SELECT o.id, o."orderId"
      FROM "Order" o
      WHERE o.source = 'tray'
        AND EXISTS (
          SELECT 1 FROM "Order" o2
          WHERE o2."orderId" = o."orderId"
            AND o2.source IN ('tray_atacado', 'tray_varejo')
        )
    `;
    const cross = await prisma.$queryRaw`
      SELECT o."orderId"
      FROM "Order" o
      INNER JOIN "Order" o2 ON o."orderId" = o2."orderId"
      WHERE o.source = 'tray_atacado' AND o2.source = 'tray_varejo'
    `;
    if (cross.length) {
      const uniq = [...new Set(cross.map((r) => r.orderId))];
      console.warn(
        `Atenção: ${uniq.length} código(s) de pedido aparecem em atacado e varejo ao mesmo tempo (revisar manualmente):`,
        uniq.slice(0, 15).join(', '),
        uniq.length > 15 ? '...' : ''
      );
    }

    if (!rows.length) {
      console.log('Nenhum pedido duplicado (tray legado x atacado/varejo).');
      return;
    }
    console.log(`Encontrados ${rows.length} pedido(s) legado "tray" com o mesmo código em atacado/varejo.`);
    if (dryRun) {
      const sample = rows.slice(0, 20).map((r) => r.orderId);
      console.log('Dry-run: amostra de orderId:', sample.join(', '), rows.length > 20 ? '...' : '');
      return;
    }
    const ids = rows.map((r) => r.id);
    const result = await prisma.order.deleteMany({ where: { id: { in: ids } } });
    console.log(`Removidos ${result.count} registro(s). Itens/devoluções ligados foram apagados em cascata.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
