import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/lib/db";
import { sessions } from "@/db/schema";
import { eq } from "drizzle-orm";

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

// Rate limit: max 10 failed login attempts per IP per minute
const failMap = new Map<string, { n: number; until: number }>();
function loginBlocked(ip: string): boolean {
  const now = Date.now();
  const e = failMap.get(ip);
  if (!e || now > e.until) return false;
  return e.n >= 10;
}
function recordFail(ip: string): void {
  const now = Date.now();
  const e = failMap.get(ip);
  if (!e || now > e.until) { failMap.set(ip, { n: 1, until: now + 60_000 }); }
  else { e.n++; }
}

// POST /api/auth — validate password, issue session token
export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
  if (loginBlocked(ip)) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }

  const { env } = await getCloudflareContext({ async: true });
  const expected = env.OPERATOR_PASSWORD ?? "";

  let body: { password?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const provided = body.password ?? "";
  if (!expected || !timingSafeEqual(provided, expected)) {
    recordFail(ip);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Generate 32-byte (256-bit) session token
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, "0")).join("");

  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(); // 8 hours

  const db = await getDb();
  await db.insert(sessions).values({ token, expiresAt });

  // Clean up expired sessions periodically (best-effort)
  db.delete(sessions).where(eq(sessions.expiresAt, new Date(0).toISOString())).catch(() => {});

  return NextResponse.json({ token });
}

// DELETE /api/auth — invalidate session token
export async function DELETE(req: NextRequest) {
  const token = req.headers.get("x-session-token") ?? "";
  if (!token) return NextResponse.json({ ok: true });

  const db = await getDb();
  await db.delete(sessions).where(eq(sessions.token, token));

  return NextResponse.json({ ok: true });
}
