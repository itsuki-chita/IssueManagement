import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params;
  const taskId = parseInt(rawId);
  const comments = await prisma.comment.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(comments);
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params;
  const taskId = parseInt(rawId);
  const body = await request.json();
  const comment = await prisma.comment.create({
    data: { body: body.body, taskId },
  });
  return NextResponse.json(comment, { status: 201 });
}
