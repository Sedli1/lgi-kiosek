-- Add new columns to Driver table
ALTER TABLE Driver ADD COLUMN rampAssignedAt TEXT;
ALTER TABLE Driver ADD COLUMN doneAt TEXT;

-- Ramp status table (operator-managed)
CREATE TABLE IF NOT EXISTS Ramp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'available',
  note TEXT
);

-- Audit log table
CREATE TABLE IF NOT EXISTS AuditLog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  driverId INTEGER REFERENCES Driver(id),
  action TEXT NOT NULL,
  ramp TEXT,
  note TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed ramps 1–10
INSERT OR IGNORE INTO Ramp (name) VALUES
  ('1'), ('2'), ('3'), ('4'), ('5'),
  ('6'), ('7'), ('8'), ('9'), ('10');
