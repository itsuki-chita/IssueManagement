import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import TaskDetailClient from "./TaskDetailClient";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const task = await prisma.task.findUnique({
    where: { id: parseInt(rawId) },
    select: { title: true, taskNumber: true, project: { select: { key: true } } },
  });
  if (!task) return { title: "課題が見つかりません" };
  const key = task.project?.key && task.taskNumber != null
    ? `${task.project.key}-${task.taskNumber}` : null;
  return { title: key ? `${key} ${task.title}` : task.title };
}

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = parseInt(rawId);
  if (isNaN(id)) notFound();

  const [task, projects, sprints, epics] = await Promise.all([
    prisma.task.findUnique({
      where: { id },
      include: {
        project: { select: { key: true } },
        parent: { select: { id: true, title: true, taskNumber: true, project: { select: { key: true } } } },
        subtasks: {
          include: { project: { select: { key: true } } },
          orderBy: { order: "asc" },
        },
        comments: { orderBy: { createdAt: "asc" } },
        attachments: { orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.project.findMany({
      where: { status: "active", archivedAt: null },
      select: { id: true, name: true, key: true, color: true },
    }),
    prisma.sprint.findMany({
      where: { status: { not: "completed" } },
      select: { id: true, name: true, status: true },
    }),
    prisma.epic.findMany({
      select: { id: true, title: true, projectId: true },
    }),
  ]);

  if (!task) notFound();

  const serializedTask = {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    done: task.done,
    priority: task.priority,
    dueDate: task.dueDate?.toISOString() ?? null,
    taskNumber: task.taskNumber,
    sprintId: task.sprintId,
    projectId: task.projectId,
    epicId: task.epicId,
    parentId: task.parentId,
    createdAt: task.createdAt.toISOString(),
    project: task.project,
    parent: task.parent,
    subtasks: task.subtasks.map((st) => ({
      id: st.id,
      title: st.title,
      status: st.status,
      done: st.done,
      taskNumber: st.taskNumber,
      project: st.project,
    })),
    attachments: task.attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      filepath: a.filepath,
      mimetype: a.mimetype,
      size: a.size,
    })),
    comments: task.comments.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
  };

  return (
    <TaskDetailClient
      task={serializedTask}
      projects={projects}
      sprints={sprints}
      epics={epics}
    />
  );
}
