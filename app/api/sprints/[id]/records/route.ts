import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await ctx.params;
  const sprintId = parseInt(rawId);
  const records = await prisma.sprintTaskRecord.findMany({
    where: { sprintId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(records);
}
