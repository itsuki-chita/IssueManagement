import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params;
  const id = parseInt(rawId);

  const attachment = await prisma.taskAttachment.findUnique({ where: { id } });
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const filePath = path.join(process.cwd(), "public", attachment.filepath);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  await prisma.taskAttachment.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
