import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { buildConfirmSms, sendSms, Lang } from "@/lib/sms";
import { requireOperator } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const denied = await requireOperator(req);
  if (denied) return denied;

  const prisma = await getPrisma();
  const drivers = await prisma.driver.findMany({
    orderBy: { createdAt: "desc" },
    include: { smsLogs: { orderBy: { sentAt: "desc" } } },
  });
  return NextResponse.json(drivers);
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Record<string, string>;
  const { name, phone, spz, firm, order, type, lang } = body;

  if (!name || !phone || !spz || !firm || !type || !lang) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const prisma = await getPrisma();
  const count = await prisma.driver.count();
  const num = count + 1;

  const driver = await prisma.driver.create({
    data: { num, name, phone, spz, firm, order: order || null, type, lang },
  });

  const message = buildConfirmSms(lang as Lang, num);

  sendSms(phone, message)
    .then(() =>
      prisma.smsLog.create({
        data: { driverId: driver.id, type: "confirm", phone, message },
      })
    )
    .catch((err) => console.error("SMS send failed:", err));

  return NextResponse.json({ ...driver, confirmSms: message }, { status: 201 });
}
