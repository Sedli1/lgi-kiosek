import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { requireOperator } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireOperator(req);
  if (denied) return denied;

  const { id } = await params;
  const prisma = await getPrisma();

  const updated = await prisma.driver.update({
    where: { id: Number(id) },
    data: { status: "done" },
  });

  return NextResponse.json(updated);
}
