import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(projects);
}

export async function POST(request: Request) {
  const body = await request.json();
  const project = await prisma.project.create({
    data: {
      name: body.name,
      key: body.key ? String(body.key).toUpperCase() : null,
      description: body.description ?? null,
      color: body.color ?? "#6366f1",
    },
  });
  return NextResponse.json(project, { status: 201 });
}
