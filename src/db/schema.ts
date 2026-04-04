import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const drivers = sqliteTable("Driver", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  num: integer("num").notNull(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  spz: text("spz").notNull(),
  firm: text("firm").notNull(),
  order: text("order"),
  type: text("type").notNull(),
  lang: text("lang").notNull(),
  status: text("status").notNull().default("wait"),
  ramp: text("ramp"),
  rampTime: text("rampTime"),
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

export type Driver = typeof drivers.$inferSelect;
export type SmsLogRow = typeof smsLogs.$inferSelect;
