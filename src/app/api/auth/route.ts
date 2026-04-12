import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/lib/db";
import { sessions, authAttempts, operators } from "@/db/schema";
import { eq, lt } from "drizzle-orm";
import { hashPassword, verifyPassword } from "@/lib/password";

const COOKIE_NAME = "op_token";
const COOKIE_OPTS = "HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800";

// GET /api/auth — ověří session cookie, vrátí info o operátorovi
export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value ?? "";
  if (!token || token.length !== 64) return NextResponse.json({ authed: false });
  const db = await getDb();
  const [session] = await db.select().from(sessions).where(eq(sessions.token, token));
  if (!session || new Date(session.expiresAt) < new Date()) {
    if (session) await db.delete(sessions).where(eq(sessions.token, token));
    const res = NextResponse.json({ authed: false });
    res.headers.set("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
    return res;
  }
  return NextResponse.json({
    authed: true,
    operator: {
      id: session.operatorId,
      username: session.operatorUsername,
      role: session.operatorRole ?? "operator",
    },
  });
}

// POST /api/auth — přihlášení username + password
export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
  const db = await getDb();

  // D1-based rate limiting
  const now = new Date().toISOString();
  const windowStart = new Date(Date.now() - 60_000).toISOString();
  const [attempt] = await db.select().from(authAttempts).where(eq(authAttempts.ip, ip));
  if (attempt && attempt.windowStart > windowStart && attempt.count >= 10) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }

  let body: { username?: string; password?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const username = (body.username ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  if (!username || !password) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  // Najít operátora v DB
  const [op] = await db.select().from(operators).where(eq(operators.username, username));

  let operatorRecord = op;

  // Bootstrap: pokud žádní operátoři neexistují, přijmout username="admin" s OPERATOR_PASSWORD
  if (!operatorRecord) {
    const allOps = await db.select().from(operators);
    if (allOps.length === 0 && username === "admin") {
      const { env } = await getCloudflareContext({ async: true });
      const bootstrapPass = env.OPERATOR_PASSWORD ?? "";
      if (!bootstrapPass || password !== bootstrapPass) {
        await recordFailedAttempt(db, ip, attempt, windowStart, now);
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
      }
      // Vytvořit prvního admina
      const passwordHash = await hashPassword(password);
      const [newOp] = await db.insert(operators).values({ username: "admin", passwordHash, role: "admin" }).returning();
      operatorRecord = newOp;
    }
  }

  if (!operatorRecord || operatorRecord.active === 0) {
    await recordFailedAttempt(db, ip, attempt, windowStart, now);
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const valid = await verifyPassword(password, operatorRecord.passwordHash);
  if (!valid) {
    await recordFailedAttempt(db, ip, attempt, windowStart, now);
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // Resetovat počítadlo pokusů
  await db.insert(authAttempts).values({ ip, count: 0, windowStart: now })
    .onConflictDoUpdate({ target: authAttempts.ip, set: { count: 0, windowStart: now } });

  // Vygenerovat token
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const token = [...tokenBytes].map(b => b.toString(16).padStart(2, "0")).join("");
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();

  await db.insert(sessions).values({
    token,
    expiresAt,
    operatorId: operatorRecord.id,
    operatorUsername: operatorRecord.username,
    operatorRole: operatorRecord.role,
  });

  db.delete(sessions).where(lt(sessions.expiresAt, new Date().toISOString())).catch(() => {});

  const res = NextResponse.json({
    ok: true,
    operator: { id: operatorRecord.id, username: operatorRecord.username, role: operatorRecord.role },
  });
  res.headers.set("Set-Cookie", `${COOKIE_NAME}=${token}; ${COOKIE_OPTS}`);
  return res;
}

// DELETE /api/auth — odhlášení
export async function DELETE(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value ?? "";
  if (token) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.token, token));
  }
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
  return res;
}

async function recordFailedAttempt(
  db: Awaited<ReturnType<typeof getDb>>,
  ip: string,
  attempt: { count: number; windowStart: string } | undefined,
  windowStart: string,
  now: string
) {
  if (!attempt || attempt.windowStart <= windowStart) {
    await db.insert(authAttempts).values({ ip, count: 1, windowStart: now })
      .onConflictDoUpdate({ target: authAttempts.ip, set: { count: 1, windowStart: now } });
  } else {
    await db.update(authAttempts).set({ count: attempt.count + 1 }).where(eq(authAttempts.ip, ip));
  }
}
