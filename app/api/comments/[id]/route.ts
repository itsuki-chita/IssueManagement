import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const truncate = (s: string, n = 80) => s.length > n ? s.slice(0, n) + "…" : s;

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params;
  const id = parseInt(rawId);
  const body = await request.json();
  const current = await prisma.comment.findUnique({
    where: { id },
    select: { taskId: true, body: true },
  });
  const comment = await prisma.comment.update({ where: { id }, data: { body: body.body } });
  if (current) {
    await prisma.taskActivity.create({
      data: {
        taskId: current.taskId,
        field: "コメントを編集",
        oldValue: truncate(current.body),
        newValue: truncate(body.body),
      },
    });
  }
  return NextResponse.json(comment);
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params;
  const id = parseInt(rawId);
  const current = await prisma.comment.findUnique({
    where: { id },
    select: { taskId: true, body: true },
  });
  await prisma.comment.delete({ where: { id } });
  if (current) {
    await prisma.taskActivity.create({
      data: {
        taskId: current.taskId,
        field: "コメントを削除",
        oldValue: truncate(current.body),
        newValue: null,
      },
    });
  }
  return new NextResponse(null, { status: 204 });
}
