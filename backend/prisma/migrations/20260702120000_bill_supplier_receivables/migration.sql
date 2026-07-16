-- AlterTable Bill: supplier + externalId
ALTER TABLE "Bill" ADD COLUMN "supplier" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Bill" ADD COLUMN "externalId" TEXT;

-- CreateTable Receivable
CREATE TABLE "Receivable" (
    "id" SERIAL NOT NULL,
    "supplier" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Receivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable ReceivableReceipt
CREATE TABLE "ReceivableReceipt" (
    "id" SERIAL NOT NULL,
    "receivableId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceivableReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Bill_externalId_key" ON "Bill"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Receivable_externalId_key" ON "Receivable"("externalId");

-- CreateIndex
CREATE INDEX "ReceivableReceipt_receivableId_idx" ON "ReceivableReceipt"("receivableId");

-- AddForeignKey
ALTER TABLE "ReceivableReceipt" ADD CONSTRAINT "ReceivableReceipt_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "Receivable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
