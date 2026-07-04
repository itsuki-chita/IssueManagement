import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await ctx.params;
  const taskId = parseInt(rawId);
  const activities = await prisma.taskActivity.findMany({
    where: { taskId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(activities);
}
