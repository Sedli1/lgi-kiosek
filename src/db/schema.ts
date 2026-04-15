import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const drivers = sqliteTable("Driver", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  num: integer("num").notNull(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  spz: text("spz").notNull(),
  spzTrailer: text("spzTrailer"),
  firm: text("firm").notNull(),
  order: text("order"),
  type: text("type").notNull(),
  vehicleType: text("vehicleType"),
  lang: text("lang").notNull(),
  status: text("status").notNull().default("wait"),
  ramp: text("ramp"),
  rampTime: text("rampTime"),
  rampAssignedAt: text("rampAssignedAt"),
  doneAt: text("doneAt"),
  warehouseConfirmedAt: text("warehouseConfirmedAt"),
  verifyToken: text("verifyToken"),
  palletCount: integer("palletCount"),
  palletArrangement: text("palletArrangement"),
  palletGrid: text("palletGrid"),
  plombaType: text("plombaType"),
  plombaNum: text("plombaNum"),
  plombaConfirmedAt: text("plombaConfirmedAt"),
  note: text("note"),
  createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updatedAt").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const smsLogs = sqliteTable("SmsLog", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  driverId: integer("driverId").notNull().references(() => drivers.id),
  type: text("type").notNull(),
  phone: text("phone").notNull(),
  message: text("message").notNull(),
  sentAt: text("sentAt").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const ramps = sqliteTable("Ramp", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  status: text("status").notNull().default("available"), // available | repair
  note: text("note"),
});

export const auditLogs = sqliteTable("AuditLog", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  driverId: integer("driverId").references(() => drivers.id),
  action: text("action").notNull(), // ramp_assigned | done | created | note_added | edited | cancelled
  ramp: text("ramp"),
  note: text("note"),
  operatorName: text("operatorName"),
  createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const sessions = sqliteTable("Session", {
  token: text("token").primaryKey(),
  expiresAt: text("expiresAt").notNull(),
  operatorId: integer("operatorId"),
  operatorUsername: text("operatorUsername"),
  operatorRole: text("operatorRole").default("operator"),
});

export const authAttempts = sqliteTable("AuthAttempt", {
  ip: text("ip").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: text("windowStart").notNull(),
});

export const operators = sqliteTable("Operator", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("passwordHash").notNull(),
  role: text("role").notNull().default("operator"), // 'admin' | 'operator'
  createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
  active: integer("active").notNull().default(1),
});

export const loadingPhotos = sqliteTable("LoadingPhoto", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  driverId: integer("driverId").notNull().references(() => drivers.id),
  photoData: text("photoData").notNull(),
  createdAt: text("createdAt").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type Driver = typeof drivers.$inferSelect;
export type SmsLogRow = typeof smsLogs.$inferSelect;
export type Ramp = typeof ramps.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type Operator = typeof operators.$inferSelect;
export type LoadingPhoto = typeof loadingPhotos.$inferSelect;
