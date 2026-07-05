import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const STATUS_LABEL: Record<string, string> = {
  open: "オープン", in_progress: "着手", resolved: "解決済み", on_hold: "保留", closed: "クローズ",
};
const STATUS_COLOR: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  resolved: "bg-green-100 text-green-700",
  on_hold: "bg-gray-100 text-gray-600",
  closed: "bg-red-100 text-red-600",
};
const PRIORITY_LABEL: Record<string, string> = { low: "低", medium: "中", high: "高" };
const PRIORITY_COLOR: Record<string, string> = {
  low: "bg-gray-100 text-gray-500",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-red-100 text-red-600",
};

function taskKey(projectKey: string | null | undefined, taskNumber: number | null | undefined) {
  if (!projectKey || taskNumber == null) return null;
  return `${projectKey}-${taskNumber}`;
}

function formatDateTime(d: Date) {
  return d.toLocaleString("ja-JP", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function MarkdownContent({ body }: { body: string }) {
  return (
    <div className="text-sm text-gray-800 space-y-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="text-xl font-bold mt-4 mb-1 text-gray-900">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-bold mt-3 mb-1 text-gray-900">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1 text-gray-900">{children}</h3>,
          p: ({ children }) => <p className="text-sm text-gray-700 leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="list-disc ml-4 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal ml-4 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="text-sm text-gray-700">{children}</li>,
          blockquote: ({ children }) => <blockquote className="border-l-4 border-gray-300 pl-3 text-gray-500 italic my-1">{children}</blockquote>,
          pre: ({ children }) => <pre className="bg-gray-100 rounded-lg p-3 overflow-x-auto text-xs font-mono">{children}</pre>,
          code: ({ className, children }) => className
            ? <code className={className}>{children}</code>
            : <code className="bg-gray-100 text-indigo-700 px-1 py-0.5 rounded text-xs font-mono">{children}</code>,
          strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline hover:text-indigo-800 break-all">{children}</a>,
          hr: () => <hr className="border-gray-200 my-2" />,
          img: ({ src, alt }) => <img src={src} alt={alt ?? ""} className="max-w-full rounded-lg border border-gray-200 my-1" />,
          table: ({ children }) => <div className="overflow-x-auto"><table className="border-collapse text-sm w-auto">{children}</table></div>,
          th: ({ children }) => <th className="border border-gray-300 px-3 py-1 bg-gray-50 font-semibold text-left text-xs">{children}</th>,
          td: ({ children }) => <td className="border border-gray-300 px-3 py-1 text-xs">{children}</td>,
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const task = await prisma.task.findUnique({
    where: { id: parseInt(rawId) },
    select: { title: true, taskNumber: true, project: { select: { key: true } } },
  });
  if (!task) return { title: "課題が見つかりません" };
  const key = taskKey(task.project?.key, task.taskNumber);
  return { title: key ? `${key} ${task.title}` : task.title };
}

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = parseInt(rawId);
  if (isNaN(id)) notFound();

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      project: true,
      sprint: { select: { id: true, name: true } },
      epic: { select: { id: true, title: true } },
      parent: {
        select: {
          id: true, title: true, taskNumber: true,
          project: { select: { key: true } },
        },
      },
      subtasks: {
        include: { project: { select: { key: true } } },
        orderBy: { order: "asc" },
      },
      comments: { orderBy: { createdAt: "asc" } },
      attachments: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!task) notFound();

  const key = taskKey(task.project?.key, task.taskNumber);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-8 py-6">
        {/* パンくず */}
        <div className="flex items-center gap-2 mb-6 text-sm text-gray-500">
          <Link href="/" className="flex items-center gap-1.5 hover:text-gray-700 transition-colors">
            <svg viewBox="0 0 12 12" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7.5 2L3 6l4.5 4" />
            </svg>
            アプリに戻る
          </Link>
          {task.parent && (
            <>
              <span className="text-gray-300">/</span>
              <Link
                href={`/tasks/${task.parent.id}`}
                className="hover:text-gray-700 transition-colors truncate max-w-[200px]"
              >
                {taskKey(task.parent.project?.key, task.parent.taskNumber) ?? task.parent.title}
              </Link>
              <span className="text-gray-300">/</span>
            </>
          )}
          <span className="font-mono text-gray-400">{key ?? `#${task.id}`}</span>
        </div>

        {/* メインレイアウト */}
        <div className="flex gap-8 items-start">
          {/* 左：コンテンツ */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* タイトル */}
            <h1 className={`text-2xl font-bold pb-2 border-b-2 border-gray-200 ${task.done ? "line-through text-gray-400" : "text-gray-900"}`}>
              {task.title}
            </h1>

            {/* 説明 */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">説明</label>
              <div className="min-h-[7rem] rounded-xl border border-gray-200 bg-white px-4 py-3">
                {task.description
                  ? <MarkdownContent body={task.description} />
                  : <p className="text-sm text-gray-300">説明なし</p>
                }
              </div>
            </div>

            {/* サブタスク */}
            {task.subtasks.length > 0 && (
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">サブタスク</h3>
                  <span className="text-xs text-gray-400">
                    {task.subtasks.filter((s) => s.done).length}/{task.subtasks.length}
                  </span>
                </div>
                <ul className="space-y-2">
                  {task.subtasks.map((st) => {
                    const stKey = taskKey(st.project?.key, st.taskNumber);
                    return (
                      <li key={st.id}>
                        <Link
                          href={`/tasks/${st.id}`}
                          className="flex items-center gap-2.5 p-3 rounded-xl border border-gray-200 hover:border-indigo-200 transition-colors bg-white group"
                        >
                          <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${st.done ? "bg-indigo-600 border-indigo-600" : "border-gray-300"}`}>
                            {st.done && (
                              <svg viewBox="0 0 12 12" fill="none" className="w-full h-full p-0.5">
                                <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                          <span className={`text-sm flex-1 min-w-0 truncate group-hover:text-indigo-600 transition-colors ${st.done ? "line-through text-gray-400" : "text-gray-700"}`}>
                            {stKey && <span className="font-mono text-xs text-gray-400 mr-2">{stKey}</span>}
                            {st.title}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_COLOR[st.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {STATUS_LABEL[st.status] ?? st.status}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* 添付ファイル */}
            {task.attachments.length > 0 && (
              <div className="border-t border-gray-100 pt-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  添付ファイル <span className="text-gray-400 font-normal">({task.attachments.length})</span>
                </h3>
                <ul className="space-y-1.5">
                  {task.attachments.map((att) => {
                    const isImage = att.mimetype.startsWith("image/");
                    const sizeLabel = att.size < 1024 * 1024
                      ? `${Math.round(att.size / 1024)} KB`
                      : `${(att.size / 1024 / 1024).toFixed(1)} MB`;
                    return (
                      <li key={att.id} className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 bg-white hover:border-indigo-200 transition-colors">
                        {isImage
                          ? <img src={att.filepath} alt={att.filename} className="w-8 h-8 rounded object-cover flex-shrink-0 border border-gray-100" />
                          : (
                            <div className="w-8 h-8 rounded flex items-center justify-center bg-gray-100 flex-shrink-0">
                              <svg viewBox="0 0 16 16" className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6L9 2z" /><path d="M9 2v4h4" />
                              </svg>
                            </div>
                          )
                        }
                        <a href={att.filepath} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 hover:text-indigo-600 transition-colors">
                          <p className="text-sm text-gray-800 truncate">{att.filename}</p>
                          <p className="text-xs text-gray-400">{sizeLabel}</p>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* コメント */}
            {task.comments.length > 0 && (
              <div className="border-t border-gray-100 pt-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  コメント <span className="text-gray-400 font-normal">({task.comments.length})</span>
                </h3>
                <div className="space-y-3">
                  {task.comments.map((comment) => (
                    <div key={comment.id} className="bg-white rounded-xl border border-gray-200 p-4">
                      <MarkdownContent body={comment.body} />
                      <p className="mt-2 text-xs text-gray-400">{formatDateTime(comment.createdAt)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 右：メタデータサイドバー */}
          <div className="w-56 flex-shrink-0 sticky top-6 self-start space-y-4 bg-white rounded-2xl border border-gray-200 p-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">ステータス</label>
              <span className={`inline-block text-sm px-2.5 py-1 rounded-lg font-medium ${STATUS_COLOR[task.status] ?? "bg-gray-100 text-gray-600"}`}>
                {STATUS_LABEL[task.status] ?? task.status}
              </span>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">優先度</label>
              <span className={`inline-block text-sm px-2.5 py-1 rounded-lg font-medium ${PRIORITY_COLOR[task.priority] ?? "bg-gray-100 text-gray-600"}`}>
                {PRIORITY_LABEL[task.priority] ?? task.priority}
              </span>
            </div>
            {task.project && (
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">プロジェクト</label>
                <p className="text-sm text-gray-700">{task.project.name}</p>
              </div>
            )}
            {task.sprint && (
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">スプリント</label>
                <p className="text-sm text-gray-700">{task.sprint.name}</p>
              </div>
            )}
            {task.epic && (
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">エピック</label>
                <p className="text-sm text-gray-700">{task.epic.title}</p>
              </div>
            )}
            {task.dueDate && (
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">期限</label>
                <p className="text-sm text-gray-700">
                  {task.dueDate.toLocaleDateString("ja-JP")}
                </p>
              </div>
            )}
            <div className="pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-400">作成: {formatDateTime(task.createdAt)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
