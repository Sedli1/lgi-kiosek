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

export async function requireOperator(req: NextRequest): Promise<NextResponse | null> {
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
