-- Session table pro server-side tokeny
CREATE TABLE IF NOT EXISTS Session (
  token TEXT PRIMARY KEY,
  expiresAt TEXT NOT NULL
);

-- AuthAttempt table pro D1-based rate limiting
CREATE TABLE IF NOT EXISTS AuthAttempt (
  ip TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  windowStart TEXT NOT NULL
);

-- Přidat operatorName do AuditLog (pokud ještě neexistuje)
ALTER TABLE AuditLog ADD COLUMN operatorName TEXT;
