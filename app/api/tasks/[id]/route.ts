import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await ctx.params;
  const id = parseInt(rawId);
  const body = await request.json();

  let taskNumberUpdate: { taskNumber?: number | null } = {};
  if (body.projectId !== undefined) {
    if (body.projectId === null) {
      taskNumberUpdate = { taskNumber: null };
    } else {
      const current = await prisma.task.findUnique({
        where: { id },
        select: { projectId: true, taskNumber: true },
      });
      // プロジェクトが変わった場合、または taskNumber が未設定の場合に採番
      if (current && (current.projectId !== body.projectId || current.taskNumber == null)) {
        const max = await prisma.task.findFirst({
          where: { projectId: body.projectId },
          orderBy: { taskNumber: "desc" },
          select: { taskNumber: true },
        });
        taskNumberUpdate = { taskNumber: (max?.taskNumber ?? 0) + 1 };
      }
    }
  } else {
    // projectId 変更なしでも taskNumber が null なら採番
    const current = await prisma.task.findUnique({
      where: { id },
      select: { projectId: true, taskNumber: true },
    });
    if (current?.projectId && current.taskNumber == null) {
      const max = await prisma.task.findFirst({
        where: { projectId: current.projectId },
        orderBy: { taskNumber: "desc" },
        select: { taskNumber: true },
      });
      taskNumberUpdate = { taskNumber: (max?.taskNumber ?? 0) + 1 };
    }
  }

  const task = await prisma.task.update({
    where: { id },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.done !== undefined && { done: body.done }),
      ...(body.priority !== undefined && { priority: body.priority }),
      ...(body.dueDate !== undefined && {
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
      }),
      ...(body.sprintId !== undefined && { sprintId: body.sprintId }),
      ...(body.projectId !== undefined && { projectId: body.projectId }),
      ...(body.epicId !== undefined && { epicId: body.epicId }),
      ...(body.parentId !== undefined && { parentId: body.parentId }),
      ...taskNumberUpdate,
    },
  });
  return NextResponse.json(task);
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await ctx.params;
  const id = parseInt(rawId);
  await prisma.task.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
