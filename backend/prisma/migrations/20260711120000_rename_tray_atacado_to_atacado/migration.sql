-- Rename channel tray_atacado → atacado (nova plataforma Nuvemshop / Atacado)
UPDATE "Order" SET source = 'atacado' WHERE source = 'tray_atacado';
UPDATE "OrderItem" SET source = 'atacado' WHERE source = 'tray_atacado';
UPDATE "OrderReturn" SET source = 'atacado' WHERE source = 'tray_atacado';

UPDATE "AdSpend" SET channel = 'atacado' WHERE channel = 'tray_atacado';
UPDATE "PaymentTypeFee" SET channel = 'atacado' WHERE channel = 'tray_atacado';
