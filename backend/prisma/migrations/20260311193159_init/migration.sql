-- CreateTable
CREATE TABLE "Order" (
    "id" SERIAL NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT '',
    "commissionFee" DOUBLE PRECISION,
    "serviceFee" DOUBLE PRECISION,
    "freight" DOUBLE PRECISION,
    "paymentType" TEXT DEFAULT '',

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderReturn" (
    "id" SERIAL NOT NULL,
    "orderId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "returnDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" SERIAL NOT NULL,
    "orderId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "discount" DOUBLE PRECISION DEFAULT 0,
    "quantity" INTEGER NOT NULL,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "productId" INTEGER,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "variationName" TEXT,
    "parentCode" TEXT,
    "costPrice" DOUBLE PRECISION,
    "source" TEXT DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductGroup" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductGroupItem" (
    "id" SERIAL NOT NULL,
    "productGroupId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,

    CONSTRAINT "ProductGroupItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductGroupStock" (
    "id" SERIAL NOT NULL,
    "productGroupId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductGroupStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryConfig" (
    "id" SERIAL NOT NULL,
    "stockStartDate" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductStock" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdSpend" (
    "id" SERIAL NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "channel" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdSpend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTypeFee" (
    "id" SERIAL NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "channel" TEXT NOT NULL,
    "paymentType" TEXT NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTypeFee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopeeIntegration" (
    "id" SERIAL NOT NULL,
    "partnerId" TEXT NOT NULL,
    "partnerKey" TEXT NOT NULL,
    "shopId" TEXT,
    "shopName" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "refreshExpiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopeeIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bill" (
    "id" SERIAL NOT NULL,
    "description" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "isFixedCost" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillPayment" (
    "id" SERIAL NOT NULL,
    "billId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderId_source_key" ON "Order"("orderId", "source");

-- CreateIndex
CREATE INDEX "OrderReturn_returnDate_idx" ON "OrderReturn"("returnDate");

-- CreateIndex
CREATE UNIQUE INDEX "OrderReturn_orderId_source_key" ON "OrderReturn"("orderId", "source");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_source_idx" ON "OrderItem"("orderId", "source");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_orderId_source_productCode_key" ON "OrderItem"("orderId", "source", "productCode");

-- CreateIndex
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");

-- CreateIndex
CREATE INDEX "Product_sku_idx" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_parentCode_idx" ON "Product"("parentCode");

-- CreateIndex
CREATE UNIQUE INDEX "ProductGroupItem_productId_key" ON "ProductGroupItem"("productId");

-- CreateIndex
CREATE INDEX "ProductGroupItem_productGroupId_idx" ON "ProductGroupItem"("productGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductGroupStock_productGroupId_key" ON "ProductGroupStock"("productGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductStock_productId_key" ON "ProductStock"("productId");

-- CreateIndex
CREATE INDEX "AdSpend_month_idx" ON "AdSpend"("month");

-- CreateIndex
CREATE UNIQUE INDEX "AdSpend_month_channel_key" ON "AdSpend"("month", "channel");

-- CreateIndex
CREATE INDEX "PaymentTypeFee_month_channel_idx" ON "PaymentTypeFee"("month", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTypeFee_month_channel_paymentType_key" ON "PaymentTypeFee"("month", "channel", "paymentType");

-- CreateIndex
CREATE INDEX "BillPayment_billId_idx" ON "BillPayment"("billId");

-- AddForeignKey
ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_orderId_source_fkey" FOREIGN KEY ("orderId", "source") REFERENCES "Order"("orderId", "source") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_source_fkey" FOREIGN KEY ("orderId", "source") REFERENCES "Order"("orderId", "source") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductGroupItem" ADD CONSTRAINT "ProductGroupItem_productGroupId_fkey" FOREIGN KEY ("productGroupId") REFERENCES "ProductGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductGroupItem" ADD CONSTRAINT "ProductGroupItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductGroupStock" ADD CONSTRAINT "ProductGroupStock_productGroupId_fkey" FOREIGN KEY ("productGroupId") REFERENCES "ProductGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStock" ADD CONSTRAINT "ProductStock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillPayment" ADD CONSTRAINT "BillPayment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

