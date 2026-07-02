import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params;
  const id = parseInt(rawId);
  const body = await request.json();
  const comment = await prisma.comment.update({
    where: { id },
    data: { body: body.body },
  });
  return NextResponse.json(comment);
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params;
  const id = parseInt(rawId);
  await prisma.comment.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
