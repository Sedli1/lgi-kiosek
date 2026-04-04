import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function requireOperator(req: NextRequest): Promise<NextResponse | null> {
  const { env } = await getCloudflareContext({ async: true });
  const expected = env.OPERATOR_PASSWORD;
  if (!expected) return null; // no password configured = open

  const provided =
    req.headers.get("x-operator-pass") ??
    req.nextUrl.searchParams.get("pass");

  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
