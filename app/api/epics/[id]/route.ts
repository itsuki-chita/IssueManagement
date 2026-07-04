import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await ctx.params;
  const id = parseInt(rawId);
  const body = await request.json();
  const epic = await prisma.epic.update({
    where: { id },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.color !== undefined && { color: body.color }),
      ...(body.projectId !== undefined && { projectId: body.projectId }),
    },
  });
  return NextResponse.json(epic);
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await ctx.params;
  const id = parseInt(rawId);
  // エピック削除時はストーリーの epicId を null にする
  await prisma.task.updateMany({ where: { epicId: id }, data: { epicId: null } });
  await prisma.epic.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
