import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { drivers } from "@/db/schema";
import { requireOperator } from "@/lib/auth";
import { eq } from "drizzle-orm";

interface RampStat {
  ramp: string;
  count: number;
  avgMinutes: number | null;
}

interface FirmStat {
  firm: string;
  count: number;
  avgMinutes: number | null;
}

function minutesBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const diff = new Date(to).getTime() - new Date(from).getTime();
  if (diff <= 0) return null;
  return Math.round(diff / 60000);
}

export async function GET(req: NextRequest) {
  const denied = await requireOperator(req);
  if (denied) return denied;

  const db = await getDb();
  const done = await db
    .select()
    .from(drivers)
    .where(eq(drivers.status, "done"));

  // Per ramp
  const rampMap = new Map<string, number[]>();
  for (const d of done) {
    if (!d.ramp) continue;
    const mins = minutesBetween(d.rampAssignedAt, d.doneAt);
    const arr = rampMap.get(d.ramp) ?? [];
    if (mins !== null) arr.push(mins);
    rampMap.set(d.ramp, arr);
  }

  const perRamp: RampStat[] = [...rampMap.entries()]
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

  const perFirm: FirmStat[] = [...firmMap.entries()]
    .map(([firm, mins]) => ({
      firm,
      count: mins.length,
      avgMinutes: mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return NextResponse.json({ perRamp, perFirm, totalDone: done.length });
}
