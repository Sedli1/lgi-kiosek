import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { drivers } from "@/db/schema";
import { requireOperator } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireOperator(req);
  if (denied) return denied;

  const { id } = await params;
  const db = await getDb();

  const [updated] = await db
    .update(drivers)
    .set({ status: "done" })
    .where(eq(drivers.id, Number(id)))
    .returning();

  return NextResponse.json(updated);
}
