import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { drivers, smsLogs } from "@/db/schema";
import { buildRampSms, sendSms, Lang } from "@/lib/sms";
import { requireOperator } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireOperator(req);
  if (denied) return denied;

  const { id } = await params;
  const body = (await req.json()) as Record<string, string>;
  const { ramp, rampTime: operatorTime } = body;

  if (!ramp) {
    return NextResponse.json({ error: "Missing ramp" }, { status: 400 });
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

  const [updated] = await db
    .update(drivers)
    .set({ ramp: String(ramp), rampTime, status: "ramp" })
    .where(eq(drivers.id, Number(id)))
    .returning();

  const message = buildRampSms(driver.lang as Lang, driver.name, String(ramp), rampTime);

  sendSms(driver.phone, message)
    .then(() =>
      db.insert(smsLogs).values({
        driverId: driver.id,
        type: "ramp",
        phone: driver.phone,
        message,
      })
    )
    .catch((err) => console.error("SMS send failed:", err));

  return NextResponse.json({ ...updated, rampSms: message });
}
