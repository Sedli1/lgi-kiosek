-- Vyčistit staré sessions (nemají operator info)
DELETE FROM Session;

-- Přidat operator info do sessions
ALTER TABLE Session ADD COLUMN operatorId INTEGER;
ALTER TABLE Session ADD COLUMN operatorUsername TEXT;
ALTER TABLE Session ADD COLUMN operatorRole TEXT DEFAULT 'operator';

-- Tabulka operátorů
CREATE TABLE IF NOT EXISTS Operator (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  passwordHash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator',
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  active INTEGER NOT NULL DEFAULT 1
);
