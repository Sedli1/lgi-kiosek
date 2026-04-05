import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ramps } from "@/db/schema";
import { requireOperator } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const denied = await requireOperator(req);
  if (denied) return denied;

  const db = await getDb();
  const rows = await db.select().from(ramps).orderBy(ramps.name);
  return NextResponse.json(rows);
}

export async function PATCH(req: NextRequest) {
  const denied = await requireOperator(req);
  if (denied) return denied;

  const body = (await req.json()) as { id: number; status: string; note?: string };
  if (!body.id || !body.status) {
    return NextResponse.json({ error: "Missing id or status" }, { status: 400 });
  }
  if (!["available", "repair", "occupied"].includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const db = await getDb();
  const [updated] = await db
    .update(ramps)
    .set({ status: body.status, note: body.note ?? null })
    .where(eq(ramps.id, body.id))
    .returning();

  return NextResponse.json(updated);
}
