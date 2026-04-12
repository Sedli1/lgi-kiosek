import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { drivers, smsLogs, auditLogs } from "@/db/schema";
import { buildRampSms, sendSms, Lang } from "@/lib/sms";
import { requireOperator } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOperator(req);
  if ("denied" in auth) return auth.denied;

  const { id } = await params;
  const operatorName = auth.operator.username;
  const body = (await req.json()) as { ramp: string; rampTime?: string; skipSms?: boolean };
  const { ramp, rampTime: operatorTime, skipSms } = body;

  if (!ramp || !/^\d{1,2}$/.test(String(ramp))) {
    return NextResponse.json({ error: "Invalid ramp" }, { status: 400 });
  }

  const db = await getDb();
  const [driver] = await db.select().from(drivers).where(eq(drivers.id, Number(id)));
  if (!driver) {
    return NextResponse.json({ error: "Driver not found" }, { status: 404 });
  }

  const rampTime = operatorTime || new Date().toLocaleTimeString("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const rampAssignedAt = new Date().toISOString();

  const [updated] = await db
    .update(drivers)
    .set({ ramp: String(ramp), rampTime, rampAssignedAt, status: "ramp" })
    .where(eq(drivers.id, Number(id)))
    .returning();

  const auditNote = skipSms
    ? `Rampa ${ramp}, čas: ${rampTime} — SMS neposlána`
    : `Rampa ${ramp}, čas: ${rampTime}`;

  db.insert(auditLogs)
    .values({ driverId: driver.id, action: "ramp_assigned", ramp: String(ramp), note: auditNote, operatorName })
    .catch((err) => console.error("Audit log failed:", err));

  if (!skipSms) {
    const message = buildRampSms(driver.lang as Lang, driver.name, String(ramp), rampTime);
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { ctx } = await getCloudflareContext({ async: true });
    ctx.waitUntil(
      sendSms(driver.phone, message)
        .then(() =>
          db.insert(smsLogs).values({ driverId: driver.id, type: "ramp", phone: driver.phone, message })
        )
        .catch((err) => console.error("SMS ramp failed:", err))
    );
    return NextResponse.json({ ...updated, rampSms: message });
  }

  return NextResponse.json({ ...updated, rampSms: null });
}
