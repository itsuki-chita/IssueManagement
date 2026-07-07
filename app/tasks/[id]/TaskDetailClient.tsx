"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const STATUS_OPTIONS = [
  { value: "open",        label: "オープン",   color: "bg-blue-100 text-blue-700" },
  { value: "in_progress", label: "着手",       color: "bg-yellow-100 text-yellow-700" },
  { value: "resolved",    label: "解決済み",   color: "bg-green-100 text-green-700" },
  { value: "on_hold",     label: "保留",       color: "bg-gray-100 text-gray-600" },
  { value: "closed",      label: "クローズ",   color: "bg-red-100 text-red-600" },
];

const PRIORITY_OPTIONS = [
  { value: "low",    label: "低", color: "bg-gray-100 text-gray-500" },
  { value: "medium", label: "中", color: "bg-yellow-100 text-yellow-700" },
  { value: "high",   label: "高", color: "bg-red-100 text-red-600" },
];

type SubTask = {
  id: number; title: string; status: string; done: boolean;
  taskNumber: number | null; project: { key: string | null } | null;
};
type Attachment = { id: number; filename: string; filepath: string; mimetype: string; size: number; };
type ParentTask = { id: number; title: string; taskNumber: number | null; project: { key: string | null } | null; };
type CommentItem = { id: number; body: string; createdAt: string; updatedAt: string; };
type Activity = { id: number; field: string; oldValue: string | null; newValue: string | null; createdAt: string; };
type Project = { id: number; name: string; key: string | null; color: string; };
type Sprint  = { id: number; name: string; status: string; };
type Epic    = { id: number; title: string; projectId: number | null; };

export type TaskDetailProps = {
  task: {
    id: number; title: string; description: string | null;
    status: string; done: boolean; priority: string;
    dueDate: string | null; taskNumber: number | null;
    sprintId: number | null; projectId: number | null; epicId: number | null;
    parentId: number | null; createdAt: string;
    project: { key: string | null } | null;
    parent: ParentTask | null;
    subtasks: SubTask[];
    attachments: Attachment[];
    comments: CommentItem[];
  };
  projects: Project[];
  sprints: Sprint[];
  epics: Epic[];
};

function taskKey(k: string | null | undefined, n: number | null | undefined) {
  return k && n != null ? `${k}-${n}` : null;
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString("ja-JP", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatRelativeTime(d: string) {
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 1) return "たった今";
  if (mins < 60) return `${mins}分前`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}時間前`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}日前`;
  return new Date(d).toLocaleDateString("ja-JP");
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
          p:  ({ children }) => <p className="text-sm text-gray-700 leading-relaxed">{children}</p>,
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

export default function TaskDetailClient({ task: initial, projects, sprints, epics }: TaskDetailProps) {
  const [titleDraft, setTitleDraft]     = useState(initial.title);
  const [savedTitle, setSavedTitle]     = useState(initial.title);
  const [descDraft, setDescDraft]       = useState(initial.description ?? "");
  const [savedDesc, setSavedDesc]       = useState(initial.description ?? "");
  const [descTab, setDescTab]           = useState<"edit" | "preview">("preview");
  const [status, setStatus]             = useState(initial.status);
  const [done, setDone]                 = useState(initial.done);
  const [priority, setPriority]         = useState(initial.priority);
  const [dueDate, setDueDate]           = useState(initial.dueDate ? initial.dueDate.slice(0, 10) : "");
  const [projectId, setProjectId]       = useState<number | null>(initial.projectId);
  const [sprintId, setSprintId]         = useState<number | null>(initial.sprintId);
  const [epicId, setEpicId]             = useState<number | null>(initial.epicId);

  const [comments, setComments]                 = useState<CommentItem[]>(initial.comments);
  const [activities, setActivities]             = useState<Activity[]>([]);
  const [activeTab, setActiveTab]               = useState<"comments" | "activities">("comments");
  const [commentBody, setCommentBody]           = useState("");
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingBody, setEditingBody]           = useState("");

  const id = initial.id;
  const key = taskKey(initial.project?.key, initial.taskNumber);
  const availableSprints = sprints.filter((s) => s.status !== "completed");

  const fetchActivities = useCallback(async () => {
    const res = await fetch(`/api/tasks/${id}/activities`);
    if (res.ok) setActivities(await res.json());
  }, [id]);

  useEffect(() => {
    if (activeTab === "activities") fetchActivities();
  }, [activeTab, fetchActivities]);

  async function patch(data: Record<string, unknown>) {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (activeTab === "activities") fetchActivities();
  }

  function handleTitleBlur() {
    if (titleDraft.trim() === savedTitle) return;
    setSavedTitle(titleDraft.trim());
    patch({ title: titleDraft.trim() });
  }

  function handleDescBlur() {
    if (descDraft === savedDesc) return;
    setSavedDesc(descDraft);
    patch({ description: descDraft || null });
  }

  async function submitComment() {
    if (!commentBody.trim()) return;
    const res = await fetch(`/api/tasks/${id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: commentBody }),
    });
    if (!res.ok) return;
    const newComment = await res.json();
    setComments((prev) => [...prev, newComment]);
    setCommentBody("");
  }

  async function saveEditComment(cid: number) {
    const res = await fetch(`/api/comments/${cid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: editingBody }),
    });
    if (!res.ok) return;
    const updated = await res.json();
    setComments((prev) => prev.map((c) => (c.id === cid ? updated : c)));
    setEditingCommentId(null);
  }

  async function deleteComment(cid: number) {
    await fetch(`/api/comments/${cid}`, { method: "DELETE" });
    setComments((prev) => prev.filter((c) => c.id !== cid));
  }

  const statusColor  = STATUS_OPTIONS.find((o) => o.value === status)?.color  ?? "bg-gray-100 text-gray-600";
  const priorityColor = PRIORITY_OPTIONS.find((o) => o.value === priority)?.color ?? "bg-gray-100 text-gray-500";

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
          {initial.parent && (
            <>
              <span className="text-gray-300">/</span>
              <Link href={`/tasks/${initial.parent.id}`} className="hover:text-gray-700 transition-colors truncate max-w-[200px]">
                {taskKey(initial.parent.project?.key, initial.parent.taskNumber) ?? initial.parent.title}
              </Link>
              <span className="text-gray-300">/</span>
            </>
          )}
          <span className="font-mono text-gray-400">{key ?? `#${id}`}</span>
        </div>

        {/* メインレイアウト */}
        <div className="flex gap-8 items-start">

          {/* 左：コンテンツ */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* タイトル */}
            <input
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={handleTitleBlur}
              className={`w-full text-2xl font-bold bg-transparent border-b-2 border-gray-200 pb-2 focus:outline-none focus:border-indigo-400 transition-colors ${done ? "line-through text-gray-400" : "text-gray-900"}`}
            />

            {/* 説明 */}
            <div>
              <div className="flex items-center gap-1 mb-2">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex-1">説明</label>
                {(["preview", "edit"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setDescTab(tab)}
                    className={`text-xs px-2.5 py-1 rounded transition-colors ${descTab === tab ? "bg-white border border-gray-200 text-gray-700 font-medium shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
                  >
                    {tab === "edit" ? "編集" : "プレビュー"}
                  </button>
                ))}
              </div>
              {descTab === "edit" ? (
                <textarea
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  onBlur={handleDescBlur}
                  placeholder="説明を入力（Markdown対応）"
                  className="w-full min-h-[7rem] rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-y"
                />
              ) : (
                <div
                  onClick={() => setDescTab("edit")}
                  className="min-h-[7rem] rounded-xl border border-gray-200 bg-white px-4 py-3 cursor-text"
                >
                  {savedDesc
                    ? <MarkdownContent body={savedDesc} />
                    : <p className="text-sm text-gray-300">説明なし（クリックして編集）</p>
                  }
                </div>
              )}
            </div>

            {/* サブタスク */}
            {initial.subtasks.length > 0 && (
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">サブタスク</h3>
                  <span className="text-xs text-gray-400">
                    {initial.subtasks.filter((s) => s.done).length}/{initial.subtasks.length}
                  </span>
                </div>
                <ul className="space-y-2">
                  {initial.subtasks.map((st) => {
                    const stKey = taskKey(st.project?.key, st.taskNumber);
                    const stColor = STATUS_OPTIONS.find((o) => o.value === st.status)?.color ?? "bg-gray-100 text-gray-600";
                    const stLabel = STATUS_OPTIONS.find((o) => o.value === st.status)?.label ?? st.status;
                    return (
                      <li key={st.id}>
                        <Link href={`/tasks/${st.id}`} className="flex items-center gap-2.5 p-3 rounded-xl border border-gray-200 hover:border-indigo-200 transition-colors bg-white group">
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
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${stColor}`}>{stLabel}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* 添付ファイル */}
            {initial.attachments.length > 0 && (
              <div className="border-t border-gray-100 pt-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  添付ファイル <span className="text-gray-400 font-normal">({initial.attachments.length})</span>
                </h3>
                <ul className="space-y-1.5">
                  {initial.attachments.map((att) => {
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

            {/* コメント / アクティビティ */}
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center gap-1 mb-4">
                <button
                  onClick={() => setActiveTab("comments")}
                  className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${activeTab === "comments" ? "bg-indigo-50 text-indigo-700" : "text-gray-500 hover:text-gray-700"}`}
                >
                  コメント ({comments.length})
                </button>
                <button
                  onClick={() => setActiveTab("activities")}
                  className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${activeTab === "activities" ? "bg-indigo-50 text-indigo-700" : "text-gray-500 hover:text-gray-700"}`}
                >
                  アクティビティ ({activities.length})
                </button>
              </div>

              {activeTab === "comments" && (
                <div className="space-y-3">
                  {comments.map((c) => (
                    <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4 group">
                      {editingCommentId === c.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={editingBody}
                            onChange={(e) => setEditingBody(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-y min-h-[5rem]"
                          />
                          <div className="flex gap-2">
                            <button onClick={() => saveEditComment(c.id)} className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700">保存</button>
                            <button onClick={() => setEditingCommentId(null)} className="text-xs border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50">キャンセル</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <MarkdownContent body={c.body} />
                          <div className="mt-2 flex items-center gap-2">
                            <p className="text-xs text-gray-400 flex-1">{formatDateTime(c.createdAt)}</p>
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                              <button
                                onClick={() => { setEditingCommentId(c.id); setEditingBody(c.body); }}
                                className="text-xs text-gray-400 hover:text-gray-600 px-2 py-0.5 rounded hover:bg-gray-100"
                              >編集</button>
                              <button
                                onClick={() => deleteComment(c.id)}
                                className="text-xs text-gray-400 hover:text-red-500 px-2 py-0.5 rounded hover:bg-red-50"
                              >削除</button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ))}

                  <form onSubmit={(e) => { e.preventDefault(); submitComment(); }} className="space-y-2">
                    <textarea
                      value={commentBody}
                      onChange={(e) => setCommentBody(e.target.value)}
                      onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); submitComment(); } }}
                      placeholder="コメントを入力…（Ctrl+Enter で投稿）"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-y min-h-[4rem] bg-white"
                    />
                    <button
                      type="submit"
                      disabled={!commentBody.trim()}
                      className="text-xs bg-indigo-600 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      投稿
                    </button>
                  </form>
                </div>
              )}

              {activeTab === "activities" && (
                <div className="space-y-1">
                  {activities.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-6">アクティビティがありません</p>
                  )}
                  {activities.map((act) => (
                    <div key={act.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                      <div className="flex-1 min-w-0 text-sm">
                        <span className="font-medium text-gray-700">{act.field}</span>
                        {(act.oldValue || act.newValue) && (
                          <span className="text-gray-500 ml-1">
                            {act.oldValue && act.newValue ? (
                              <><s className="text-gray-400">{act.oldValue}</s>{" → "}{act.newValue}</>
                            ) : act.oldValue ? (
                              <s className="text-gray-400">{act.oldValue}</s>
                            ) : (
                              act.newValue
                            )}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">{formatRelativeTime(act.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 右：メタデータサイドバー（編集可） */}
          <div className="w-56 flex-shrink-0 sticky top-6 self-start space-y-4 bg-white rounded-2xl border border-gray-200 p-4">

            {/* 完了トグル */}
            <button
              onClick={() => { setDone((v) => !v); patch({ done: !done }); }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-sm font-medium ${done ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${done ? "bg-indigo-600 border-indigo-600" : "border-gray-300"}`}>
                {done && (
                  <svg viewBox="0 0 12 12" fill="none" className="w-full h-full p-0.5">
                    <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              {done ? "完了済み" : "完了にする"}
            </button>

            {/* ステータス */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">ステータス</label>
              <select
                value={status}
                onChange={(e) => { setStatus(e.target.value); patch({ status: e.target.value }); }}
                className={`w-full text-sm px-2.5 py-1.5 rounded-lg font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-400 ${statusColor}`}
              >
                {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* 優先度 */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">優先度</label>
              <select
                value={priority}
                onChange={(e) => { setPriority(e.target.value); patch({ priority: e.target.value }); }}
                className={`w-full text-sm px-2.5 py-1.5 rounded-lg font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-400 ${priorityColor}`}
              >
                {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* プロジェクト */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">プロジェクト</label>
              <select
                value={projectId ?? ""}
                onChange={(e) => { const v = e.target.value ? parseInt(e.target.value) : null; setProjectId(v); patch({ projectId: v }); }}
                className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                <option value="">なし</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {/* スプリント */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">スプリント</label>
              <select
                value={sprintId ?? ""}
                onChange={(e) => { const v = e.target.value ? parseInt(e.target.value) : null; setSprintId(v); patch({ sprintId: v }); }}
                className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                <option value="">バックログ</option>
                {availableSprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            {/* エピック */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">エピック</label>
              <select
                value={epicId ?? ""}
                onChange={(e) => { const v = e.target.value ? parseInt(e.target.value) : null; setEpicId(v); patch({ epicId: v }); }}
                className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                <option value="">なし</option>
                {epics.map((ep) => <option key={ep.id} value={ep.id}>{ep.title}</option>)}
              </select>
            </div>

            {/* 期限 */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">期限</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => { setDueDate(e.target.value); patch({ dueDate: e.target.value || null }); }}
                className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>

            <div className="pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-400">作成: {formatDateTime(initial.createdAt)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
