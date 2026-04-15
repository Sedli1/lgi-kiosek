-- Driver: vehicle type, trailer SPZ, verify token, warehouse confirmation
ALTER TABLE Driver ADD COLUMN vehicleType TEXT;
ALTER TABLE Driver ADD COLUMN spzTrailer TEXT;
ALTER TABLE Driver ADD COLUMN verifyToken TEXT;
ALTER TABLE Driver ADD COLUMN warehouseConfirmedAt TEXT;

-- Photos taken by warehouse worker after loading
CREATE TABLE IF NOT EXISTS LoadingPhoto (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  driverId INTEGER NOT NULL,
  photoData TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add ramps 11–30
INSERT OR IGNORE INTO Ramp (name, status) VALUES
  ('11','available'),('12','available'),('13','available'),('14','available'),('15','available'),
  ('16','available'),('17','available'),('18','available'),('19','available'),('20','available'),
  ('21','available'),('22','available'),('23','available'),('24','available'),('25','available'),
  ('26','available'),('27','available'),('28','available'),('29','available'),('30','available');
