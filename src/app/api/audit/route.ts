import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { auditLogs, drivers } from "@/db/schema";
import { requireOperator } from "@/lib/auth";
import { and, desc, eq, gte, inArray } from "drizzle-orm";

function toSqliteDate(d: Date): string {
  return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

export async function GET(req: NextRequest) {
  const auth = await requireOperator(req);
  if ("denied" in auth) return auth.denied;
  if (auth.operator.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = req.nextUrl;
  const fromParam = url.searchParams.get("from");
  const operatorParam = url.searchParams.get("operator");
  const actionParam = url.searchParams.get("action");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "500"), 1000);

  const db = await getDb();
  const conditions = [];

  if (fromParam) {
    const d = new Date(fromParam);
    if (!isNaN(d.getTime())) conditions.push(gte(auditLogs.createdAt, toSqliteDate(d)));
  }
  if (operatorParam && operatorParam !== "all") {
    conditions.push(eq(auditLogs.operatorName, operatorParam));
  }
  if (actionParam && actionParam !== "all") {
    conditions.push(eq(auditLogs.action, actionParam));
  }

  const rows = await db.select().from(auditLogs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);

  // Připojit info o řidiči pro záznamy vázané na řidiče
  const driverIds = [...new Set(rows.filter(r => r.driverId !== null).map(r => r.driverId!))];
  const driverMap = new Map<number, { name: string; spz: string; num: number }>();
  if (driverIds.length > 0) {
    const driverRows = await db
      .select({ id: drivers.id, name: drivers.name, spz: drivers.spz, num: drivers.num })
      .from(drivers)
      .where(inArray(drivers.id, driverIds));
    for (const d of driverRows) driverMap.set(d.id, { name: d.name, spz: d.spz, num: d.num });
  }

  return NextResponse.json(rows.map(r => ({
    ...r,
    driver: r.driverId ? (driverMap.get(r.driverId) ?? null) : null,
  })));
}
