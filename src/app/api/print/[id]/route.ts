import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { drivers } from "@/db/schema";
import { eq } from "drizzle-orm";

// Public endpoint — serves driver data for print page (no sensitive info)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = await getDb();
  const [driver] = await db.select().from(drivers).where(eq(drivers.id, Number(id)));

  if (!driver) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: driver.id,
    num: driver.num,
    name: driver.name,
    firm: driver.firm,
    spz: driver.spz,
    spzTrailer: driver.spzTrailer,
    vehicleType: driver.vehicleType,
    ramp: driver.ramp,
    verifyToken: driver.verifyToken,
  });
}
