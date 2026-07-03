import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const tasks = await prisma.task.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(tasks);
}

export async function POST(request: Request) {
  const body = await request.json();
  const count = await prisma.task.count();

  let taskNumber: number | null = null;
  if (body.projectId) {
    const max = await prisma.task.findFirst({
      where: { projectId: body.projectId },
      orderBy: { taskNumber: "desc" },
      select: { taskNumber: true },
    });
    taskNumber = (max?.taskNumber ?? 0) + 1;
  }

  const task = await prisma.task.create({
    data: {
      title: body.title,
      description: body.description ?? null,
      status: body.status ?? "open",
      priority: body.priority ?? "medium",
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      sprintId: body.sprintId ?? null,
      projectId: body.projectId ?? null,
      epicId: body.epicId ?? null,
      parentId: body.parentId ?? null,
      taskNumber,
      order: count,
    },
  });
  return NextResponse.json(task, { status: 201 });
}
