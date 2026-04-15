import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { drivers, loadingPhotos } from "@/db/schema";
import { eq } from "drizzle-orm";

const MAX_PHOTOS = 5;
const MAX_SIZE_BYTES = 150_000; // 150KB base64 per photo

// POST /api/drivers/[id]/photos — warehouse uploads loading photo
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const driverId = Number(id);

  const body = (await req.json()) as { token: string; photoData: string };
  if (!body.token || !body.photoData) {
    return NextResponse.json({ error: "Missing token or photoData" }, { status: 400 });
  }

  if (body.photoData.length > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "Photo too large" }, { status: 400 });
  }

  const db = await getDb();
  const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId));

  if (!driver) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (driver.verifyToken !== body.token) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  // Count existing photos
  const existing = await db.select({ id: loadingPhotos.id }).from(loadingPhotos).where(eq(loadingPhotos.driverId, driverId));
  if (existing.length >= MAX_PHOTOS) {
    return NextResponse.json({ error: "Max 5 fotek" }, { status: 400 });
  }

  await db.insert(loadingPhotos).values({ driverId, photoData: body.photoData });

  return NextResponse.json({ ok: true, count: existing.length + 1 });
}

// GET /api/drivers/[id]/photos — operator views photos
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Allow by token (warehouse) or operator session
  const token = req.nextUrl.searchParams.get("token");
  const db = await getDb();

  if (token) {
    const [driver] = await db.select({ verifyToken: drivers.verifyToken }).from(drivers).where(eq(drivers.id, Number(id)));
    if (!driver || driver.verifyToken !== token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
  } else {
    // Require operator session
    const { requireOperator } = await import("@/lib/auth");
    const auth = await requireOperator(req);
    if ("denied" in auth) return auth.denied;
  }

  const photos = await db.select({ id: loadingPhotos.id, photoData: loadingPhotos.photoData, createdAt: loadingPhotos.createdAt })
    .from(loadingPhotos).where(eq(loadingPhotos.driverId, Number(id)));

  return NextResponse.json(photos);
}
