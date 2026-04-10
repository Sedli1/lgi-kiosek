import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Constant-time string comparison — prevents timing attacks
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

// Per-isolate auth rate limiter: max 10 failed attempts per IP per minute
// (Cloudflare Workers are stateless across isolates — this is best-effort protection)
const authFailMap = new Map<string, { count: number; blockedUntil: number }>();

function checkAuthRateLimit(ip: string, success: boolean): boolean {
  const now = Date.now();
  const entry = authFailMap.get(ip);

  if (entry && entry.blockedUntil > now) return false; // blocked

  if (success) {
    authFailMap.delete(ip);
    return true;
  }

  const count = (entry?.count ?? 0) + 1;
  const blockedUntil = count >= 10 ? now + 60_000 : 0;
  authFailMap.set(ip, { count, blockedUntil });
  return true; // not yet blocked (this attempt still processed)
}

export async function requireOperator(req: NextRequest): Promise<NextResponse | null> {
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "unknown";

  const { env } = await getCloudflareContext({ async: true });
  const expected = env.OPERATOR_PASSWORD ?? "";

  const provided =
    req.headers.get("x-operator-pass") ??
    req.nextUrl.searchParams.get("pass") ??
    "";

  const ok = expected.length > 0 && timingSafeEqual(provided, expected);

  if (!checkAuthRateLimit(ip, ok)) {
    return NextResponse.json({ error: "Too many failed attempts" }, { status: 429 });
  }

  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
