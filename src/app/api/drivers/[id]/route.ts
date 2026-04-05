import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { drivers, auditLogs } from "@/db/schema";
import { requireOperator } from "@/lib/auth";
import { eq } from "drizzle-orm";

const VALID_TYPES = new Set(["vyklada", "naklada", "obe"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireOperator(req);
  if (denied) return denied;

  const { id } = await params;
  const operatorName = req.headers.get("x-operator-name") ?? null;
  const body = (await req.json()) as Record<string, string>;
  const { name, spz, firm, phone, type, order, note } = body;

  if (type && !VALID_TYPES.has(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }
  if (
    (name && name.length > 100) ||
    (spz && spz.length > 20) ||
    (firm && firm.length > 100) ||
    (phone && phone.length > 30) ||
    (order && order.length > 100) ||
    (note && note.length > 500)
  ) {
    return NextResponse.json({ error: "Field too long" }, { status: 400 });
  }

  const updates: Partial<{ name: string; spz: string; firm: string; phone: string; type: string; order: string | null; note: string | null }> = {};
  if (name !== undefined) updates.name = name.trim();
  if (spz !== undefined) updates.spz = spz.trim().toUpperCase();
  if (firm !== undefined) updates.firm = firm.trim();
  if (phone !== undefined) updates.phone = phone.trim();
  if (type !== undefined) updates.type = type;
  if (order !== undefined) updates.order = order.trim() || null;
  if (note !== undefined) updates.note = note.trim() || null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const db = await getDb();
  const [updated] = await db
    .update(drivers)
    .set(updates)
    .where(eq(drivers.id, Number(id)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Driver not found" }, { status: 404 });
  }

  // Log note changes separately
  if (note !== undefined) {
    db.insert(auditLogs)
      .values({ driverId: Number(id), action: "note_added", ramp: null, note: note.trim() || null, operatorName })
      .catch((err) => console.error("Audit log failed:", err));
  }

  return NextResponse.json(updated);
}
