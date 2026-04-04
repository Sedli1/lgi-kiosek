import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { drivers } from "@/db/schema";
import { requireOperator } from "@/lib/auth";
import { and, eq, gte } from "drizzle-orm";

function minutesBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const diff = new Date(to).getTime() - new Date(from).getTime();
  if (diff <= 0) return null;
  return Math.round(diff / 60000);
}

// SQLite stores CURRENT_TIMESTAMP as "YYYY-MM-DD HH:MM:SS" — convert JS Date to that format
function toSqliteDate(d: Date): string {
  return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

export async function GET(req: NextRequest) {
  const denied = await requireOperator(req);
  if (denied) return denied;

  const url = req.nextUrl;
  const fromParam = url.searchParams.get("from"); // ISO string or null

  const db = await getDb();

  const conditions = [eq(drivers.status, "done")];
  if (fromParam) {
    const fromDate = new Date(fromParam);
    if (!isNaN(fromDate.getTime())) {
      conditions.push(gte(drivers.createdAt, toSqliteDate(fromDate)));
    }
  }

  const done = await db
    .select()
    .from(drivers)
    .where(and(...conditions));

  // Per ramp
  const rampMap = new Map<string, number[]>();
  for (const d of done) {
    if (!d.ramp) continue;
    const mins = minutesBetween(d.rampAssignedAt, d.doneAt);
    const arr = rampMap.get(d.ramp) ?? [];
    if (mins !== null) arr.push(mins);
    rampMap.set(d.ramp, arr);
  }

  const perRamp = [...rampMap.entries()]
    .map(([ramp, mins]) => ({
      ramp,
      count: mins.length,
      avgMinutes: mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null,
    }))
    .sort((a, b) => Number(a.ramp) - Number(b.ramp));

  // Per firm
  const firmMap = new Map<string, number[]>();
  for (const d of done) {
    const mins = minutesBetween(d.rampAssignedAt, d.doneAt);
    const arr = firmMap.get(d.firm) ?? [];
    if (mins !== null) arr.push(mins);
    firmMap.set(d.firm, arr);
  }

  const perFirm = [...firmMap.entries()]
    .map(([firm, mins]) => ({
      firm,
      count: mins.length,
      avgMinutes: mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return NextResponse.json({ perRamp, perFirm, totalDone: done.length, rows: done });
}
