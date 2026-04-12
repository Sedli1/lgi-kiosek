import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { operators, auditLogs } from "@/db/schema";
import { requireOperator } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { eq } from "drizzle-orm";

// GET /api/operators — seznam operátorů (admin only)
export async function GET(req: NextRequest) {
  const auth = await requireOperator(req);
  if ("denied" in auth) return auth.denied;
  if (auth.operator.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = await getDb();
  const rows = await db.select({
    id: operators.id,
    username: operators.username,
    role: operators.role,
    createdAt: operators.createdAt,
    active: operators.active,
  }).from(operators).orderBy(operators.createdAt);

  return NextResponse.json(rows);
}

// POST /api/operators — vytvoření nového operátora (admin only)
export async function POST(req: NextRequest) {
  const auth = await requireOperator(req);
  if ("denied" in auth) return auth.denied;
  if (auth.operator.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { username?: string; password?: string; role?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const username = (body.username ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const role = body.role === "admin" ? "admin" : "operator";

  if (!username || username.length < 3 || username.length > 50) {
    return NextResponse.json({ error: "Uživatelské jméno musí mít 3–50 znaků" }, { status: 400 });
  }
  if (!/^[a-z0-9._-]+$/.test(username)) {
    return NextResponse.json({ error: "Uživatelské jméno smí obsahovat pouze a-z, 0-9, tečku, pomlčku, podtržítko" }, { status: 400 });
  }
  if (!password || password.length < 6) {
    return NextResponse.json({ error: "Heslo musí mít alespoň 6 znaků" }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  const db = await getDb();

  try {
    const [op] = await db.insert(operators).values({ username, passwordHash, role }).returning();
    db.insert(auditLogs).values({
      driverId: null, action: "user_created", ramp: null,
      note: `Vytvořen: ${username} (${role})`, operatorName: auth.operator.username,
    }).catch(() => {});
    return NextResponse.json({ id: op.id, username: op.username, role: op.role, createdAt: op.createdAt, active: op.active }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Uživatelské jméno je již obsazeno" }, { status: 409 });
  }
}
