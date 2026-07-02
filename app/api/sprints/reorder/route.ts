import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const { ids }: { ids: number[] } = await request.json();
  await Promise.all(
    ids.map((id, index) =>
      prisma.sprint.update({ where: { id }, data: { order: index } })
    )
  );
  return new NextResponse(null, { status: 204 });
}
