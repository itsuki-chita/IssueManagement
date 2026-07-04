import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const truncate = (s: string, n = 80) => s.length > n ? s.slice(0, n) + "…" : s;

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
  const [comment] = await prisma.$transaction([
    prisma.comment.create({ data: { body: body.body, taskId } }),
    prisma.taskActivity.create({
      data: { taskId, field: "コメントを追加", oldValue: null, newValue: truncate(body.body) },
    }),
  ]);
  return NextResponse.json(comment, { status: 201 });
}
