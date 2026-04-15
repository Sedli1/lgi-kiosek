import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { drivers } from "@/db/schema";
import { isNull, isNotNull } from "drizzle-orm";

// GET /api/plomba — list drivers awaiting seal (public, for seal lady page)
export async function GET(_req: NextRequest) {
  const db = await getDb();

  // Drivers where loading confirmed but seal not yet recorded
  const pending = await db.select({
    id: drivers.id,
    num: drivers.num,
    name: drivers.name,
    firm: drivers.firm,
    spz: drivers.spz,
    ramp: drivers.ramp,
    vehicleType: drivers.vehicleType,
    warehouseConfirmedAt: drivers.warehouseConfirmedAt,
    plombaType: drivers.plombaType,
    plombaNum: drivers.plombaNum,
    plombaConfirmedAt: drivers.plombaConfirmedAt,
    verifyToken: drivers.verifyToken,
  }).from(drivers)
    .where(isNotNull(drivers.warehouseConfirmedAt));

  // Split into pending and done
  const awaiting = pending.filter(d => !d.plombaConfirmedAt);
  const done = pending.filter(d => d.plombaConfirmedAt).slice(-10); // last 10

  return NextResponse.json({ awaiting, done });
}
