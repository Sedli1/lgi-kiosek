import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ramps, auditLogs } from "@/db/schema";
import { requireOperator } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const auth = await requireOperator(req);
  if ("denied" in auth) return auth.denied;

  const db = await getDb();
  const rows = await db.select().from(ramps).orderBy(ramps.name);
  return NextResponse.json(rows);
}

export async function PATCH(req: NextRequest) {
  const auth = await requireOperator(req);
  if ("denied" in auth) return auth.denied;

  const body = (await req.json()) as { id: number; status: string; note?: string };
  if (!body.id || !body.status) {
    return NextResponse.json({ error: "Missing id or status" }, { status: 400 });
  }
  if (!["available", "repair", "occupied"].includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const db = await getDb();
  const [current] = await db.select().from(ramps).where(eq(ramps.id, body.id));

  const [updated] = await db
    .update(ramps)
    .set({ status: body.status, note: body.note ?? null })
    .where(eq(ramps.id, body.id))
    .returning();

  if (current && current.status !== body.status) {
    await db.insert(auditLogs).values({
      driverId: null, action: "ramp_repair", ramp: current.name,
      note: `Rampa ${current.name}: ${current.status} → ${body.status}`,
      operatorName: auth.operator.username,
    }).catch(() => {});
  }

  return NextResponse.json(updated);
}
