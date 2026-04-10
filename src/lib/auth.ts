import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

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

// Simple per-isolate rate limiter for failed auth attempts
// Resets counter after 60s window
const failMap = new Map<string, { n: number; until: number }>();

function authBlocked(ip: string): boolean {
  const now = Date.now();
  const e = failMap.get(ip);
  if (!e) return false;
  if (now > e.until) { failMap.delete(ip); return false; }
  return e.n >= 10;
}

function recordFail(ip: string): void {
  const now = Date.now();
  const e = failMap.get(ip);
  if (!e || now > e.until) {
    failMap.set(ip, { n: 1, until: now + 60_000 });
  } else {
    e.n++;
  }
}

export async function requireOperator(req: NextRequest): Promise<NextResponse | null> {
  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";

  if (authBlocked(ip)) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }

  const { env } = await getCloudflareContext({ async: true });
  const expected = env.OPERATOR_PASSWORD ?? "";
  if (!expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const provided =
    req.headers.get("x-operator-pass") ??
    req.nextUrl.searchParams.get("pass") ??
    "";

  if (!timingSafeEqual(provided, expected)) {
    recordFail(ip);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Success — clear fail counter
  failMap.delete(ip);
  return null;
}
