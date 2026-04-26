const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  try {
    const traySources = ["tray", "tray_atacado", "tray_varejo"];
    let total = 0;
    for (const source of traySources) {
      const result = await prisma.order.deleteMany({ where: { source } });
      total += result.count;
      console.log(`deleted ${result.count} orders (source=${source})`);
    }
    console.log(`total ${total} Tray orders removed`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

