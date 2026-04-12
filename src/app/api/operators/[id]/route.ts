import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { operators, sessions, auditLogs } from "@/db/schema";
import { requireOperator } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { eq, and, ne } from "drizzle-orm";

// PATCH /api/operators/[id] — změna role nebo hesla (admin only, nebo vlastní heslo)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOperator(req);
  if ("denied" in auth) return auth.denied;

  const { id } = await params;
  const targetId = Number(id);

  // Admin může měnit cokoliv; operátor může měnit jen vlastní heslo
  const isSelf = auth.operator.id === targetId;
  const isAdmin = auth.operator.role === "admin";

  if (!isAdmin && !isSelf) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { role?: string; password?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const db = await getDb();
  const [target] = await db.select().from(operators).where(eq(operators.id, targetId));
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updates: Partial<{ role: string; passwordHash: string }> = {};

  if (body.role !== undefined && isAdmin) {
    if (!["admin", "operator"].includes(body.role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    // Nesmí odebrat roli poslednímu adminovi
    if (body.role !== "admin" && target.role === "admin") {
      const adminOps = await db.select().from(operators)
        .where(and(eq(operators.role, "admin"), ne(operators.id, targetId)));
      if (adminOps.length === 0) return NextResponse.json({ error: "Nelze odebrat roli poslednímu adminovi" }, { status: 400 });
    }
    updates.role = body.role;
  }

  if (body.password !== undefined) {
    if (!body.password || body.password.length < 6) {
      return NextResponse.json({ error: "Heslo musí mít alespoň 6 znaků" }, { status: 400 });
    }
    updates.passwordHash = await hashPassword(body.password);
    // Invalidovat existující sessions tohoto uživatele při změně hesla
    await db.delete(sessions).where(eq(sessions.operatorId, targetId));
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nic k aktualizaci" }, { status: 400 });
  }

  const [updated] = await db.update(operators).set(updates).where(eq(operators.id, targetId)).returning();

  // Audit log
  if (updates.role !== undefined) {
    db.insert(auditLogs).values({
      driverId: null, action: "role_changed", ramp: null,
      note: `${target.username}: ${target.role} → ${updates.role}`, operatorName: auth.operator.username,
    }).catch(() => {});
  }
  if (updates.passwordHash !== undefined) {
    db.insert(auditLogs).values({
      driverId: null, action: "password_changed", ramp: null,
      note: `Změna hesla: ${target.username}`, operatorName: auth.operator.username,
    }).catch(() => {});
  }

  return NextResponse.json({ id: updated.id, username: updated.username, role: updated.role });
}

// DELETE /api/operators/[id] — smazání operátora (admin only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOperator(req);
  if ("denied" in auth) return auth.denied;
  if (auth.operator.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const targetId = Number(id);

  if (auth.operator.id === targetId) {
    return NextResponse.json({ error: "Nemůžete smazat vlastní účet" }, { status: 400 });
  }

  const db = await getDb();
  const [target] = await db.select().from(operators).where(eq(operators.id, targetId));
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Nesmí smazat posledního admina
  if (target.role === "admin") {
    const adminOps = await db.select().from(operators)
      .where(and(eq(operators.role, "admin"), ne(operators.id, targetId)));
    if (adminOps.length === 0) return NextResponse.json({ error: "Nelze smazat posledního admina" }, { status: 400 });
  }

  // Audit log před smazáním
  db.insert(auditLogs).values({
    driverId: null, action: "user_deleted", ramp: null,
    note: `Smazán: ${target.username} (${target.role})`, operatorName: auth.operator.username,
  }).catch(() => {});

  // Invalidovat sessions a smazat
  await db.delete(sessions).where(eq(sessions.operatorId, targetId));
  await db.delete(operators).where(eq(operators.id, targetId));

  return NextResponse.json({ ok: true });
}
