import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await ctx.params;
  const sprintId = parseInt(rawId);
  const { moveToSprintId } = await request.json();

  const sprintTasks = await prisma.task.findMany({
    where: { sprintId, parentId: null },
    select: { id: true, title: true, done: true, status: true },
  });

  let movedToSprintName: string | null = null;
  if (moveToSprintId) {
    const target = await prisma.sprint.findUnique({
      where: { id: moveToSprintId },
      select: { name: true },
    });
    movedToSprintName = target?.name ?? null;
  }

  await prisma.$transaction([
    // closed ステータスのタスクは移動しない
    prisma.task.updateMany({
      where: { sprintId, done: false, status: { not: "closed" } },
      data: { sprintId: moveToSprintId ?? null },
    }),
    prisma.sprintTaskRecord.createMany({
      data: sprintTasks.map((t) => {
        const isFinished = t.done || t.status === "closed";
        return {
          sprintId,
          taskId: t.id,
          taskTitle: t.title,
          wasDone: isFinished,
          movedToSprintId: isFinished ? null : (moveToSprintId ?? null),
          movedToSprintName: isFinished ? null : movedToSprintName,
        };
      }),
    }),
    prisma.sprint.update({
      where: { id: sprintId },
      data: { status: "completed", closedAt: new Date() },
    }),
  ]);

  return new NextResponse(null, { status: 204 });
}
