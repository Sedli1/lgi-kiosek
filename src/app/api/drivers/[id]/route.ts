import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { drivers, auditLogs } from "@/db/schema";
import { requireOperator } from "@/lib/auth";
import { eq } from "drizzle-orm";

const VALID_TYPES = new Set(["vyklada", "naklada", "obe"]);

function sanitize(s: string): string {
  return s.replace(/<[^>]*>/g, "").trim();
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireOperator(req);
  if (denied) return denied;

  const { id } = await params;
  const operatorName = req.headers.get("x-operator-name") ?? null;
  const body = (await req.json()) as Record<string, unknown>;
  const { name, spz, firm, phone, type, order, note } = body as Record<string, string | null | undefined>;

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

  const db = await getDb();
  const [current] = await db.select().from(drivers).where(eq(drivers.id, Number(id)));
  if (!current) {
    return NextResponse.json({ error: "Driver not found" }, { status: 404 });
  }

  const updates: Partial<{ name: string; spz: string; firm: string; phone: string; type: string; order: string | null; note: string | null }> = {};
  if (name !== undefined) updates.name = name ? sanitize(name) : "";
  if (spz !== undefined) updates.spz = spz ? sanitize(spz).toUpperCase() : "";
  if (firm !== undefined) updates.firm = firm ? sanitize(firm) : "";
  if (phone !== undefined) updates.phone = phone ? sanitize(phone) : "";
  if (type !== undefined) updates.type = type ?? current.type;
  if (order !== undefined) updates.order = order ? sanitize(order) || null : null;
  if (note !== undefined) updates.note = note ? sanitize(note) || null : null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const [updated] = await db
    .update(drivers)
    .set(updates)
    .where(eq(drivers.id, Number(id)))
    .returning();

  // Build detailed audit note listing every changed field
  const fieldLabels: Record<string, string> = {
    name: "Jméno", spz: "SPZ", firm: "Firma", phone: "Telefon",
    type: "Typ", order: "Zakázka", note: "Poznámka",
  };
  const changes: string[] = [];
  for (const [key, newVal] of Object.entries(updates)) {
    const oldVal = (current as Record<string, unknown>)[key];
    const oldStr = oldVal == null ? "—" : String(oldVal);
    const newStr = newVal == null ? "—" : String(newVal);
    if (oldStr !== newStr) {
      changes.push(`${fieldLabels[key] ?? key}: „${oldStr}" → „${newStr}"`);
    }
  }

  if (changes.length > 0) {
    db.insert(auditLogs)
      .values({
        driverId: Number(id),
        action: "edited",
        ramp: null,
        note: changes.join("; "),
        operatorName,
      })
      .catch((err) => console.error("Audit log failed:", err));
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireOperator(req);
  if (denied) return denied;

  const { id } = await params;
  const operatorName = req.headers.get("x-operator-name") ?? null;
  const db = await getDb();

  const [driver] = await db.select().from(drivers).where(eq(drivers.id, Number(id)));
  if (!driver) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (driver.status !== "wait") {
    return NextResponse.json({ error: "Pouze čekající řidiči mohou být zrušeni" }, { status: 400 });
  }

  await db
    .update(drivers)
    .set({ status: "done", doneAt: new Date().toISOString(), note: "Zrušeno operátorem" })
    .where(eq(drivers.id, Number(id)));

  db.insert(auditLogs)
    .values({ driverId: Number(id), action: "cancelled", ramp: null, note: "Zrušeno operátorem", operatorName })
    .catch((err) => console.error("Audit cancel failed:", err));

  return NextResponse.json({ ok: true });
}
