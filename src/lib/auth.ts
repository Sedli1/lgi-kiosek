import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sessions } from "@/db/schema";
import { eq } from "drizzle-orm";

export type OperatorInfo = { id: number; username: string; role: string };
export type AuthResult = { denied: NextResponse } | { operator: OperatorInfo };

export async function requireOperator(req: NextRequest): Promise<AuthResult> {
  const token = req.cookies.get("op_token")?.value ?? "";
  if (!token || token.length !== 64) {
    return { denied: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const db = await getDb();
  const [session] = await db.select().from(sessions).where(eq(sessions.token, token));
  if (!session) {
    return { denied: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (new Date(session.expiresAt) < new Date()) {
    await db.delete(sessions).where(eq(sessions.token, token));
    return { denied: NextResponse.json({ error: "Session expired" }, { status: 401 }) };
  }
  return {
    operator: {
      id: session.operatorId ?? 0,
      username: session.operatorUsername ?? "unknown",
      role: session.operatorRole ?? "operator",
    },
  };
}
