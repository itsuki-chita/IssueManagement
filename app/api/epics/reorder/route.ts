import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const { ids } = await request.json() as { ids: number[] };
  await Promise.all(
    ids.map((id, index) => prisma.epic.update({ where: { id }, data: { order: index } }))
  );
  return NextResponse.json({ ok: true });
}
