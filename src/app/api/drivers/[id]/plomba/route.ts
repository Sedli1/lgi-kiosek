import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { drivers, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";

// POST /api/drivers/[id]/plomba
// Auth options:
//   1. Operator session (from /plomba page or admin)
//   2. verifyToken + plombaPin (from /skladnik tablet)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const driverId = Number(id);

  const body = (await req.json()) as {
    token?: string;       // verifyToken from QR scan
    pin?: string;         // plomba PIN (warehouse flow)
    plombaNum?: string;   // seal number entered by user
    plombaType?: string;  // only used from /plomba page; warehouse reads it from DB
  };

  const db = await getDb();
  const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId));
  if (!driver) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let operatorName = "plombovačka";

  if (body.token) {
    // Warehouse tablet flow: token + PIN
    if (driver.verifyToken !== body.token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    const expectedPin = process.env.PLOMBA_PIN ?? "1234";
    if (!body.pin || body.pin !== expectedPin) {
      return NextResponse.json({ error: "Nesprávný PIN" }, { status: 403 });
    }
  } else {
    // Operator session flow (/plomba page)
    const { requireOperator } = await import("@/lib/auth");
    const auth = await requireOperator(req);
    if ("denied" in auth) return auth.denied;
    operatorName = auth.operator.username;
  }

  // plombaType: prefer what's already in DB (set by operator); fallback to body
  const plombaType = driver.plombaType ?? body.plombaType;
  if (!plombaType || !["bezna", "celni"].includes(plombaType)) {
    return NextResponse.json({ error: "Typ plomby není nastaven" }, { status: 400 });
  }
  if (plombaType === "celni" && !body.plombaNum?.trim()) {
    return NextResponse.json({ error: "Celní plomba vyžaduje číslo" }, { status: 400 });
  }

  const now = new Date().toISOString();
  await db.update(drivers)
    .set({
      plombaType,
      plombaNum: body.plombaNum?.trim() ?? driver.plombaNum ?? null,
      plombaConfirmedAt: now,
      updatedAt: now,
    })
    .where(eq(drivers.id, driverId));

  await db.insert(auditLogs).values({
    driverId,
    action: "plomba",
    ramp: driver.ramp,
    note: plombaType === "celni"
      ? `Celní plomba č. ${body.plombaNum?.trim() ?? driver.plombaNum} — ${driver.spz}`
      : `Běžná plomba — ${driver.spz}`,
    operatorName,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
