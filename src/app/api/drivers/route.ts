import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { drivers, smsLogs } from "@/db/schema";
import { buildConfirmSms, sendSms, Lang } from "@/lib/sms";
import { requireOperator } from "@/lib/auth";
import { desc, eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const denied = await requireOperator(req);
  if (denied) return denied;

  const db = await getDb();
  const rows = await db.select().from(drivers).orderBy(desc(drivers.createdAt));

  const logs = await db.select().from(smsLogs);
  const logsByDriver: Record<number, typeof logs> = {};
  for (const log of logs) {
    (logsByDriver[log.driverId] ??= []).push(log);
  }

  const result = rows.map((d) => ({
    ...d,
    smsLogs: (logsByDriver[d.id] ?? []).sort(
      (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()
    ),
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Record<string, string>;
  const { name, phone, spz, firm, order, type, lang } = body;

  if (!name || !phone || !spz || !firm || !type || !lang) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const db = await getDb();
  const count = await db.$count(drivers);
  const num = count + 1;

  const [driver] = await db
    .insert(drivers)
    .values({ num, name, phone, spz, firm, order: order || null, type, lang })
    .returning();

  const message = buildConfirmSms(lang as Lang, num);

  sendSms(phone, message)
    .then(() =>
      db.insert(smsLogs).values({
        driverId: driver.id,
        type: "confirm",
        phone,
        message,
      })
    )
    .catch((err) => console.error("SMS send failed:", err));

  return NextResponse.json({ ...driver, confirmSms: message }, { status: 201 });
}
