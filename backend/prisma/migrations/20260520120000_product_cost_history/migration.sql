-- CreateTable
CREATE TABLE "ProductCostHistory" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCostHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductCostHistory_productId_effectiveDate_idx" ON "ProductCostHistory"("productId", "effectiveDate");

-- AddForeignKey
ALTER TABLE "ProductCostHistory" ADD CONSTRAINT "ProductCostHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed existing costPrice values
INSERT INTO "ProductCostHistory" ("productId", "unitCost", "effectiveDate", "notes")
SELECT
    p."id",
    p."costPrice",
    COALESCE(
        (SELECT ic."stockStartDate" FROM "InventoryConfig" ic ORDER BY ic."id" DESC LIMIT 1),
        p."createdAt"
    ),
    'migration'
FROM "Product" p
WHERE p."costPrice" IS NOT NULL AND p."costPrice" > 0;
