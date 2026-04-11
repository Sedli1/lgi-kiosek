import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/lib/db";
import { sessions, authAttempts } from "@/db/schema";
import { eq, lt } from "drizzle-orm";

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

const COOKIE_NAME = "op_token";
const COOKIE_OPTS = "HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800";

// GET /api/auth — ověří zda je session cookie platná
export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value ?? "";
  if (!token || token.length !== 64) {
    return NextResponse.json({ authed: false });
  }
  const db = await getDb();
  const [session] = await db.select().from(sessions).where(eq(sessions.token, token));
  if (!session || new Date(session.expiresAt) < new Date()) {
    if (session) await db.delete(sessions).where(eq(sessions.token, token));
    const res = NextResponse.json({ authed: false });
    res.headers.set("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
    return res;
  }
  return NextResponse.json({ authed: true });
}

// POST /api/auth — ověří heslo, vydá session token přes HttpOnly cookie
export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
  const db = await getDb();

  // D1-based rate limiting: max 10 pokusů za 60 sekund
  const now = new Date().toISOString();
  const windowStart = new Date(Date.now() - 60_000).toISOString();
  const [attempt] = await db.select().from(authAttempts).where(eq(authAttempts.ip, ip));

  if (attempt && attempt.windowStart > windowStart && attempt.count >= 10) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }

  const { env } = await getCloudflareContext({ async: true });
  const expected = env.OPERATOR_PASSWORD ?? "";

  let body: { password?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const provided = body.password ?? "";
  if (!expected || !timingSafeEqual(provided, expected)) {
    // Zaznamenat neúspěšný pokus
    if (!attempt || attempt.windowStart <= windowStart) {
      await db.insert(authAttempts).values({ ip, count: 1, windowStart: now })
        .onConflictDoUpdate({ target: authAttempts.ip, set: { count: 1, windowStart: now } });
    } else {
      await db.update(authAttempts).set({ count: attempt.count + 1 }).where(eq(authAttempts.ip, ip));
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Úspěšné přihlášení — resetovat počítadlo
  await db.insert(authAttempts).values({ ip, count: 0, windowStart: now })
    .onConflictDoUpdate({ target: authAttempts.ip, set: { count: 0, windowStart: now } });

  // Vygenerovat 256-bit token
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, "0")).join("");

  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(); // 8 hodin

  await db.insert(sessions).values({ token, expiresAt });

  // Vyčistit expirované sessions (best-effort)
  db.delete(sessions).where(lt(sessions.expiresAt, new Date().toISOString())).catch(() => {});

  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", `${COOKIE_NAME}=${token}; ${COOKIE_OPTS}`);
  return res;
}

// DELETE /api/auth — zneplatní session
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
