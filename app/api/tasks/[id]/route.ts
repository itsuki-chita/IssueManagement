import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const STATUS_LABEL: Record<string, string> = {
  open: "オープン", in_progress: "着手", resolved: "解決済み", on_hold: "保留", closed: "クローズ",
};
const PRIORITY_LABEL: Record<string, string> = { low: "低", medium: "中", high: "高" };

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await ctx.params;
  const id = parseInt(rawId);
  const body = await request.json();

  const current = await prisma.task.findUnique({
    where: { id },
    select: {
      title: true, description: true, status: true, done: true, priority: true,
      dueDate: true, sprintId: true, projectId: true, epicId: true, taskNumber: true,
      sprint: { select: { name: true } },
      project: { select: { name: true } },
      epic: { select: { title: true } },
    },
  });

  // taskNumber の採番
  let taskNumberUpdate: { taskNumber?: number | null } = {};
  if (body.projectId !== undefined) {
    if (body.projectId === null) {
      taskNumberUpdate = { taskNumber: null };
    } else if (current && (current.projectId !== body.projectId || current.taskNumber == null)) {
      const max = await prisma.task.findFirst({
        where: { projectId: body.projectId },
        orderBy: { taskNumber: "desc" },
        select: { taskNumber: true },
      });
      taskNumberUpdate = { taskNumber: (max?.taskNumber ?? 0) + 1 };
    }
  } else if (current?.projectId && current.taskNumber == null) {
    const max = await prisma.task.findFirst({
      where: { projectId: current.projectId },
      orderBy: { taskNumber: "desc" },
      select: { taskNumber: true },
    });
    taskNumberUpdate = { taskNumber: (max?.taskNumber ?? 0) + 1 };
  }

  // アクティビティ記録
  const activityData: { taskId: number; field: string; oldValue: string | null; newValue: string | null }[] = [];
  if (current) {
    if (body.title !== undefined && body.title !== current.title) {
      activityData.push({ taskId: id, field: "タイトル", oldValue: current.title, newValue: body.title });
    }
    if (body.description !== undefined && (body.description ?? "") !== (current.description ?? "")) {
      activityData.push({ taskId: id, field: "説明", oldValue: current.description ? "あり" : null, newValue: body.description ? "更新" : null });
    }
    if (body.status !== undefined && body.status !== current.status) {
      activityData.push({ taskId: id, field: "ステータス", oldValue: STATUS_LABEL[current.status] ?? current.status, newValue: STATUS_LABEL[body.status] ?? body.status });
    }
    if (body.done !== undefined && body.done !== current.done) {
      activityData.push({ taskId: id, field: "完了", oldValue: current.done ? "完了" : "未完了", newValue: body.done ? "完了" : "未完了" });
    }
    if (body.priority !== undefined && body.priority !== current.priority) {
      activityData.push({ taskId: id, field: "優先度", oldValue: PRIORITY_LABEL[current.priority] ?? current.priority, newValue: PRIORITY_LABEL[body.priority] ?? body.priority });
    }
    if (body.dueDate !== undefined) {
      const oldDate = current.dueDate ? current.dueDate.toISOString().split("T")[0] : null;
      const newDate = body.dueDate ? new Date(body.dueDate).toISOString().split("T")[0] : null;
      if (oldDate !== newDate) {
        activityData.push({ taskId: id, field: "期限", oldValue: oldDate, newValue: newDate });
      }
    }
    if (body.sprintId !== undefined && body.sprintId !== current.sprintId) {
      let newSprintName: string | null = null;
      if (body.sprintId) {
        const sprint = await prisma.sprint.findUnique({ where: { id: body.sprintId }, select: { name: true } });
        newSprintName = sprint?.name ?? null;
      }
      activityData.push({ taskId: id, field: "スプリント", oldValue: current.sprint?.name ?? null, newValue: newSprintName });
    }
    if (body.projectId !== undefined && body.projectId !== current.projectId) {
      let newProjectName: string | null = null;
      if (body.projectId) {
        const project = await prisma.project.findUnique({ where: { id: body.projectId }, select: { name: true } });
        newProjectName = project?.name ?? null;
      }
      activityData.push({ taskId: id, field: "プロジェクト", oldValue: current.project?.name ?? null, newValue: newProjectName });
    }
    if (body.epicId !== undefined && body.epicId !== current.epicId) {
      let newEpicTitle: string | null = null;
      if (body.epicId) {
        const epic = await prisma.epic.findUnique({ where: { id: body.epicId }, select: { title: true } });
        newEpicTitle = epic?.title ?? null;
      }
      activityData.push({ taskId: id, field: "エピック", oldValue: current.epic?.title ?? null, newValue: newEpicTitle });
    }
  }

  const task = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.done !== undefined && { done: body.done }),
        ...(body.priority !== undefined && { priority: body.priority }),
        ...(body.dueDate !== undefined && { dueDate: body.dueDate ? new Date(body.dueDate) : null }),
        ...(body.sprintId !== undefined && { sprintId: body.sprintId }),
        ...(body.projectId !== undefined && { projectId: body.projectId }),
        ...(body.epicId !== undefined && { epicId: body.epicId }),
        ...(body.parentId !== undefined && { parentId: body.parentId }),
        ...taskNumberUpdate,
      },
    });
    if (activityData.length > 0) {
      await tx.taskActivity.createMany({ data: activityData });
    }
    return updated;
  });

  return NextResponse.json(task);
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await ctx.params;
  const id = parseInt(rawId);
  const task = await prisma.task.findUnique({
    where: { id },
    select: { title: true, parentId: true },
  });
  await prisma.task.delete({ where: { id } });
  if (task?.parentId) {
    await prisma.taskActivity.create({
      data: { taskId: task.parentId, field: "サブタスクを削除", oldValue: task.title, newValue: null },
    });
  }
  return new NextResponse(null, { status: 204 });
}
