import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { drivers, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";

// POST /api/drivers/[id]/plomba — record seal info (token-auth for warehouse, session-auth for operator)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const driverId = Number(id);

  const body = (await req.json()) as { token?: string; plombaType: string; plombaNum?: string };
  const { plombaType, plombaNum } = body;

  if (!["bezna", "celni"].includes(plombaType)) {
    return NextResponse.json({ error: "Neplatný typ plomby" }, { status: 400 });
  }
  if (plombaType === "celni" && !plombaNum) {
    return NextResponse.json({ error: "Celní plomba vyžaduje číslo" }, { status: 400 });
  }

  const db = await getDb();
  const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId));
  if (!driver) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Auth: token (warehouse) or operator session
  let operatorName = "skladník";
  if (body.token) {
    if (driver.verifyToken !== body.token) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  } else {
    const { requireOperator } = await import("@/lib/auth");
    const auth = await requireOperator(req);
    if ("denied" in auth) return auth.denied;
    operatorName = auth.operator.username;
  }

  const now = new Date().toISOString();
  await db.update(drivers)
    .set({ plombaType, plombaNum: plombaNum ?? null, plombaConfirmedAt: now, updatedAt: now })
    .where(eq(drivers.id, driverId));

  await db.insert(auditLogs).values({
    driverId,
    action: "plomba",
    ramp: driver.ramp,
    note: plombaType === "celni"
      ? `Celní plomba č. ${plombaNum} — ${driver.spz}`
      : `Běžná plomba — ${driver.spz}`,
    operatorName,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
