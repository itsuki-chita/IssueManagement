import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json([]);

  const words = q.split(/\s+/).filter(Boolean);

  const tasks = await prisma.task.findMany({
    where: {
      AND: words.map((word) => ({
        OR: [
          { title: { contains: word } },
          { description: { contains: word } },
          { comments: { some: { body: { contains: word } } } },
        ],
      })),
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(tasks);
}
