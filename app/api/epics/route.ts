import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const epics = await prisma.epic.findMany({ orderBy: { order: "asc" } });
  return NextResponse.json(epics);
}

export async function POST(request: Request) {
  const body = await request.json();
  const maxOrder = await prisma.epic.aggregate({ _max: { order: true } });
  const epic = await prisma.epic.create({
    data: {
      title: body.title,
      description: body.description ?? null,
      status: body.status ?? "open",
      color: body.color ?? "#818cf8",
      projectId: body.projectId ?? null,
      order: (maxOrder._max.order ?? -1) + 1,
    },
  });
  return NextResponse.json(epic, { status: 201 });
}
