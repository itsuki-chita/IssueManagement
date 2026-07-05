import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params;
  const taskId = parseInt(rawId);
  const attachments = await prisma.taskAttachment.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(attachments);
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params;
  const taskId = parseInt(rawId);

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "ファイルがありません" }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "ファイルサイズは10MB以下にしてください" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(file.name);
  const uniqueName = `${taskId}-${Date.now()}${ext}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.writeFileSync(path.join(uploadDir, uniqueName), buffer);

  const attachment = await prisma.taskAttachment.create({
    data: {
      taskId,
      filename: file.name,
      filepath: `/uploads/${uniqueName}`,
      mimetype: file.type || "application/octet-stream",
      size: file.size,
    },
  });
  return NextResponse.json(attachment, { status: 201 });
}
