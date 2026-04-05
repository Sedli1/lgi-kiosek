import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { drivers, auditLogs } from "@/db/schema";
import { requireOperator } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireOperator(req);
  if (denied) return denied;

  const { id } = await params;
  const operatorName = req.headers.get("x-operator-name") ?? null;
  const db = await getDb();
  const doneAt = new Date().toISOString();

  const [updated] = await db
    .update(drivers)
    .set({ status: "done", doneAt })
    .where(eq(drivers.id, Number(id)))
    .returning();

  db.insert(auditLogs)
    .values({ driverId: Number(id), action: "done", ramp: updated?.ramp ?? null, note: null, operatorName })
    .catch((err) => console.error("Audit log failed:", err));

  return NextResponse.json(updated);
}
