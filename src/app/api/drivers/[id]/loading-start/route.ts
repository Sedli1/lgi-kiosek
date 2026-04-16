import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { drivers, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const driverId = Number(id);

  const body = (await req.json()) as { token: string };
  if (!body.token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const db = await getDb();
  const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId));

  if (!driver) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (driver.verifyToken !== body.token) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  if (driver.status !== "ramp") return NextResponse.json({ error: "Řidič není na rampě" }, { status: 400 });
  if (driver.loadingStartedAt) return NextResponse.json({ loadingStartedAt: driver.loadingStartedAt });

  const now = new Date().toISOString();
  await db.update(drivers).set({ loadingStartedAt: now, updatedAt: now }).where(eq(drivers.id, driverId));

  await db.insert(auditLogs).values({
    driverId,
    action: "loading_started",
    ramp: driver.ramp,
    note: `Nakládka zahájena — ${driver.spz}`,
    operatorName: "skladník",
  }).catch(() => {});

  return NextResponse.json({ loadingStartedAt: now });
}
