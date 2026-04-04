import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const prisma = await getPrisma();

  const updated = await prisma.driver.update({
    where: { id: Number(id) },
    data: { status: "done" },
  });

  return NextResponse.json(updated);
}
