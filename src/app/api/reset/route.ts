import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { drivers, smsLogs, auditLogs } from "@/db/schema";
import { requireOperator } from "@/lib/auth";

// Testing only — deletes all driver data
export async function DELETE(req: NextRequest) {
  const auth = await requireOperator(req);
  if ("denied" in auth) return auth.denied;

  if (req.nextUrl.searchParams.get("confirm") !== "yes") {
    return NextResponse.json({ error: "Add ?confirm=yes to proceed" }, { status: 400 });
  }

  const db = await getDb();
  await db.delete(auditLogs);
  await db.delete(smsLogs);
  await db.delete(drivers);

  return NextResponse.json({ ok: true, message: "All data deleted" });
}
