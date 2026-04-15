import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { drivers } from "@/db/schema";
import { eq } from "drizzle-orm";

// Public endpoint — warehouse worker scans QR → gets driver info
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token || token.length < 8) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const db = await getDb();
  const [driver] = await db.select().from(drivers).where(eq(drivers.verifyToken, token));

  if (!driver) {
    return NextResponse.json({ error: "Nenalezeno" }, { status: 404 });
  }

  // Return only what warehouse needs
  return NextResponse.json({
    id: driver.id,
    name: driver.name,
    firm: driver.firm,
    spz: driver.spz,
    spzTrailer: driver.spzTrailer,
    vehicleType: driver.vehicleType,
    ramp: driver.ramp,
    status: driver.status,
    warehouseConfirmedAt: driver.warehouseConfirmedAt,
    num: driver.num,
    palletCount: driver.palletCount,
    palletArrangement: driver.palletArrangement,
    plombaType: driver.plombaType,
    plombaNum: driver.plombaNum,
    plombaConfirmedAt: driver.plombaConfirmedAt,
  });
}
