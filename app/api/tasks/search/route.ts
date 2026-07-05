import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json([]);

  const tasks = await prisma.task.findMany({
    where: {
      OR: [
        { title: { contains: q } },
        { description: { contains: q } },
        { comments: { some: { body: { contains: q } } } },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(tasks);
}
