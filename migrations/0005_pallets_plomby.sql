-- Pallet arrangement from driver
ALTER TABLE Driver ADD COLUMN palletCount INTEGER;
ALTER TABLE Driver ADD COLUMN palletArrangement TEXT;
ALTER TABLE Driver ADD COLUMN palletGrid TEXT;

-- Seal (plomba) info
ALTER TABLE Driver ADD COLUMN plombaType TEXT;
ALTER TABLE Driver ADD COLUMN plombaNum TEXT;
ALTER TABLE Driver ADD COLUMN plombaConfirmedAt TEXT;
