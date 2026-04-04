import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { buildRampSms, sendSms, Lang } from "@/lib/sms";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json()) as Record<string, string>;
  const { ramp } = body;

  if (!ramp) {
    return NextResponse.json({ error: "Missing ramp" }, { status: 400 });
  }

  const prisma = await getPrisma();
  const driver = await prisma.driver.findUnique({ where: { id: Number(id) } });
  if (!driver) {
    return NextResponse.json({ error: "Driver not found" }, { status: 404 });
  }

  const rampTime = new Date().toLocaleTimeString("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const updated = await prisma.driver.update({
    where: { id: Number(id) },
    data: { ramp: String(ramp), rampTime, status: "ramp" },
  });

  const message = buildRampSms(driver.lang as Lang, driver.name, String(ramp), rampTime);

  sendSms(driver.phone, message)
    .then(() =>
      prisma.smsLog.create({
        data: { driverId: driver.id, type: "ramp", phone: driver.phone, message },
      })
    )
    .catch((err) => console.error("SMS send failed:", err));

  return NextResponse.json({ ...updated, rampSms: message });
}
