import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await ctx.params;
  const id = parseInt(rawId);
  const body = await request.json();

  // キーが新たに設定される場合、このプロジェクトの既存タスクに taskNumber をバックフィル
  if (body.key) {
    const current = await prisma.project.findUnique({ where: { id }, select: { key: true } });
    if (!current?.key) {
      const unNumbered = await prisma.task.findMany({
        where: { projectId: id, taskNumber: null },
        orderBy: { createdAt: "asc" },
      });
      const max = await prisma.task.findFirst({
        where: { projectId: id, taskNumber: { not: null } },
        orderBy: { taskNumber: "desc" },
        select: { taskNumber: true },
      });
      let next = (max?.taskNumber ?? 0) + 1;
      for (const task of unNumbered) {
        await prisma.task.update({ where: { id: task.id }, data: { taskNumber: next++ } });
      }
    }
  }

  const project = await prisma.project.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.key !== undefined && { key: body.key ? String(body.key).toUpperCase() : null }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.color !== undefined && { color: body.color }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.archivedAt !== undefined && { archivedAt: body.archivedAt ? new Date(body.archivedAt) : null }),
    },
  });
  return NextResponse.json(project);
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await ctx.params;
  const id = parseInt(rawId);
  await prisma.task.updateMany({
    where: { projectId: id },
    data: { projectId: null, taskNumber: null },
  });
  await prisma.project.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
