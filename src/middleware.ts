import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  // Remove Next.js diagnostic headers that reveal internal stack info
  res.headers.delete("x-nextjs-cache");
  res.headers.delete("x-nextjs-prerender");
  return res;
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
