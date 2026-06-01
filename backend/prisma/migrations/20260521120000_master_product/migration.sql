-- CreateTable
CREATE TABLE "MasterProduct" (
    "id" SERIAL NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterProductStock" (
    "id" SERIAL NOT NULL,
    "masterProductId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterProductStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterProductCostHistory" (
    "id" SERIAL NOT NULL,
    "masterProductId" INTEGER NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MasterProductCostHistory_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "masterProductId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "MasterProduct_sku_key" ON "MasterProduct"("sku");
CREATE UNIQUE INDEX "MasterProductStock_masterProductId_key" ON "MasterProductStock"("masterProductId");
CREATE INDEX "MasterProductCostHistory_masterProductId_effectiveDate_idx" ON "MasterProductCostHistory"("masterProductId", "effectiveDate");
CREATE INDEX "Product_masterProductId_idx" ON "Product"("masterProductId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_masterProductId_fkey" FOREIGN KEY ("masterProductId") REFERENCES "MasterProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MasterProductStock" ADD CONSTRAINT "MasterProductStock_masterProductId_fkey" FOREIGN KEY ("masterProductId") REFERENCES "MasterProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MasterProductCostHistory" ADD CONSTRAINT "MasterProductCostHistory_masterProductId_fkey" FOREIGN KEY ("masterProductId") REFERENCES "MasterProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate ProductGroup -> MasterProduct
INSERT INTO "MasterProduct" ("sku", "name", "updatedAt")
SELECT 'GRUPO-' || pg."id", pg."name", CURRENT_TIMESTAMP
FROM "ProductGroup" pg;

UPDATE "Product" p
SET "masterProductId" = mp."id"
FROM "ProductGroupItem" pgi
JOIN "MasterProduct" mp ON mp."sku" = 'GRUPO-' || pgi."productGroupId"
WHERE p."id" = pgi."productId";

INSERT INTO "MasterProductStock" ("masterProductId", "quantity", "updatedAt")
SELECT mp."id", COALESCE(pgs."quantity", 0), CURRENT_TIMESTAMP
FROM "ProductGroup" pg
JOIN "MasterProduct" mp ON mp."sku" = 'GRUPO-' || pg."id"
LEFT JOIN "ProductGroupStock" pgs ON pgs."productGroupId" = pg."id";

-- Standalone ProductStock -> one master per product
INSERT INTO "MasterProduct" ("sku", "name", "updatedAt")
SELECT 'PROD-' || ps."productId", p."name", CURRENT_TIMESTAMP
FROM "ProductStock" ps
JOIN "Product" p ON p."id" = ps."productId"
WHERE p."masterProductId" IS NULL;

UPDATE "Product" p
SET "masterProductId" = mp."id"
FROM "ProductStock" ps
JOIN "MasterProduct" mp ON mp."sku" = 'PROD-' || ps."productId"
WHERE p."id" = ps."productId" AND p."masterProductId" IS NULL;

INSERT INTO "MasterProductStock" ("masterProductId", "quantity", "updatedAt")
SELECT mp."id", ps."quantity", CURRENT_TIMESTAMP
FROM "ProductStock" ps
JOIN "MasterProduct" mp ON mp."sku" = 'PROD-' || ps."productId"
WHERE NOT EXISTS (
  SELECT 1 FROM "MasterProductStock" mps WHERE mps."masterProductId" = mp."id"
);
