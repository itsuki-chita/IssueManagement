import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await ctx.params;
  const id = parseInt(rawId);
  const body = await request.json();
  const sprint = await prisma.sprint.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.startDate !== undefined && {
        startDate: body.startDate ? new Date(body.startDate) : null,
      }),
      ...(body.endDate !== undefined && {
        endDate: body.endDate ? new Date(body.endDate) : null,
      }),
    },
  });
  return NextResponse.json(sprint);
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await ctx.params;
  const id = parseInt(rawId);
  await prisma.task.updateMany({
    where: { sprintId: id },
    data: { sprintId: null },
  });
  await prisma.sprint.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
