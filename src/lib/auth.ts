import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sessions } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function requireOperator(req: NextRequest): Promise<NextResponse | null> {
  const token = req.cookies.get("op_token")?.value ?? "";

  if (!token || token.length !== 64) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  const [session] = await db.select().from(sessions).where(eq(sessions.token, token));

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (new Date(session.expiresAt) < new Date()) {
    await db.delete(sessions).where(eq(sessions.token, token));
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  return null;
}
