const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  try {
    const orders = await prisma.order.deleteMany({ where: { source: "shopee" } });
    console.log(`Deleted ${orders.count} orders (source=shopee)`);

    const products = await prisma.product.deleteMany({
      where: { code: { startsWith: "shopee_" } },
    });
    console.log(`Deleted ${products.count} products (shopee_*)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
