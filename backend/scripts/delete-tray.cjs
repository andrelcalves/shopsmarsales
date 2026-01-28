const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await prisma.order.deleteMany({ where: { source: "tray" } });
    console.log(`deleted ${result.count} records (source=tray)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

