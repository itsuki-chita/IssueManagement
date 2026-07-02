import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const sprints = await prisma.sprint.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(sprints);
}

export async function POST(request: Request) {
  const body = await request.json();
  const count = await prisma.sprint.count();
  const sprint = await prisma.sprint.create({
    data: {
      name: body.name,
      startDate: body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate ? new Date(body.endDate) : null,
      status: body.status ?? "planning",
      order: count,
    },
  });
  return NextResponse.json(sprint, { status: 201 });
}
