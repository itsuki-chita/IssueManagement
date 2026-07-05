"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Priority = "low" | "medium" | "high";
type TaskStatus = "open" | "in_progress" | "resolved" | "on_hold" | "closed";
type SprintStatus = "planning" | "active" | "completed";
type PanelMode = "empty" | "edit" | "create";
type ViewState =
  | "all-sprints"
  | "all-epics"
  | { kind: "task"; id: number }
  | { kind: "search"; query: string };

type Project = {
  id: number;
  name: string;
  key: string | null;
  description: string | null;
  color: string;
  createdAt: string;
};

type Sprint = {
  id: number;
  name: string;
  startDate: string | null;
  endDate: string | null;
  status: SprintStatus;
  order: number;
  closedAt: string | null;
  createdAt: string;
};

type SprintTaskRecord = {
  id: number;
  sprintId: number;
  taskId: number;
  taskTitle: string;
  wasDone: boolean;
  movedToSprintId: number | null;
  movedToSprintName: string | null;
  createdAt: string;
};

type Epic = {
  id: number;
  title: string;
  description: string | null;
  status: string;
  color: string;
  projectId: number | null;
  order: number;
  createdAt: string;
};

type Task = {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  done: boolean;
  priority: Priority;
  dueDate: string | null;
  sprintId: number | null;
  projectId: number | null;
  epicId: number | null;
  taskNumber: number | null;
  parentId: number | null;
  createdAt: string;
};

const PRIORITY_LABEL: Record<Priority, string> = { low: "低", medium: "中", high: "高" };
const PRIORITY_COLOR: Record<Priority, string> = {
  low: "bg-blue-100 text-blue-700",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-red-100 text-red-700",
};
const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  open: "オープン",
  in_progress: "着手",
  resolved: "解決済み",
  on_hold: "保留",
  closed: "クローズ",
};
const TASK_STATUS_COLOR: Record<TaskStatus, string> = {
  open: "bg-green-100 text-green-700",
  in_progress: "bg-blue-100 text-blue-700",
  resolved: "bg-green-100 text-green-700",
  on_hold: "bg-amber-100 text-amber-700",
  closed: "bg-gray-100 text-gray-500",
};
const SPRINT_STATUS_LABEL: Record<SprintStatus, string> = {
  planning: "計画中",
  active: "アクティブ",
  completed: "完了",
};
const SPRINT_STATUS_ORDER: Record<SprintStatus, number> = { planning: 0, active: 1, completed: 2 };
function sortSprints(sprints: Sprint[]): Sprint[] {
  return [...sprints].sort((a, b) => {
    const diff = (SPRINT_STATUS_ORDER[a.status as SprintStatus] ?? 3) - (SPRINT_STATUS_ORDER[b.status as SprintStatus] ?? 3);
    if (diff !== 0) return diff;
    if (a.status === "completed" && b.status === "completed") {
      if (!a.closedAt && !b.closedAt) return 0;
      if (!a.closedAt) return 1;
      if (!b.closedAt) return -1;
      return new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime();
    }
    return 0;
  });
}
const SPRINT_STATUS_COLOR: Record<SprintStatus, string> = {
  planning: "bg-gray-100 text-gray-600",
  active: "bg-green-100 text-green-700",
  completed: "bg-purple-100 text-purple-700",
};
type Comment = {
  id: number;
  body: string;
  taskId: number;
  createdAt: string;
  updatedAt: string;
};
type TaskAttachment = {
  id: number;
  taskId: number;
  filename: string;
  filepath: string;
  mimetype: string;
  size: number;
  createdAt: string;
};
type TaskActivity = {
  id: number;
  taskId: number;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
};

const PROJECT_COLORS = [
  "#6366f1", "#3b82f6", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#8b5cf6", "#14b8a6",
];

const EPIC_COLORS = [
  "#818cf8", "#60a5fa", "#34d399", "#fbbf24",
  "#f87171", "#f472b6", "#a78bfa", "#2dd4bf",
];

const EMPTY_EPIC_FORM = { title: "", description: "", color: "#818cf8", projectId: null as number | null };

function isTaskView(v: ViewState): v is { kind: "task"; id: number } {
  return typeof v === "object" && v.kind === "task";
}

function isSearchView(v: ViewState): v is { kind: "search"; query: string } {
  return typeof v === "object" && v.kind === "search";
}

const URL_REGEX = /https?:\/\/[^\s<>"]+/g;

function CommentBody({ body }: { body: string }) {
  const parts: { text: string; isUrl: boolean }[] = [];
  let last = 0;
  for (const m of body.matchAll(URL_REGEX)) {
    if (m.index! > last) parts.push({ text: body.slice(last, m.index), isUrl: false });
    parts.push({ text: m[0], isUrl: true });
    last = m.index! + m[0].length;
  }
  if (last < body.length) parts.push({ text: body.slice(last), isUrl: false });
  return (
    <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">
      {parts.map((p, i) =>
        p.isUrl ? (
          <a key={i} href={p.text} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline hover:text-indigo-800 break-all" onClick={(e) => e.stopPropagation()}>
            {p.text}
          </a>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </p>
  );
}

function MarkdownPreview({ body }: { body: string }) {
  return (
    <div className="text-sm text-gray-800 space-y-2 min-h-[1.5rem]">
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
          table: ({ children }) => <div className="overflow-x-auto"><table className="border-collapse text-sm w-auto">{children}</table></div>,
          thead: ({ children }) => <thead>{children}</thead>,
          th: ({ children }) => <th className="border border-gray-300 px-3 py-1 bg-gray-50 font-semibold text-left text-xs">{children}</th>,
          td: ({ children }) => <td className="border border-gray-300 px-3 py-1 text-xs">{children}</td>,
          del: ({ children }) => <del className="line-through text-gray-400">{children}</del>,
          img: ({ src, alt }) => <img src={src} alt={alt ?? ""} className="max-w-full rounded-lg border border-gray-200 my-1" />,
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}

function MarkdownEditor({
  value, onChange, rows = 6, placeholder, onBlur,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  onBlur?: () => void;
}) {
  const [preview, setPreview] = useState(false);
  return (
    <div>
      <div className="flex items-center gap-1 mb-1.5">
        <button
          type="button"
          onClick={() => setPreview(false)}
          className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
            !preview ? "bg-gray-200 text-gray-800 font-medium" : "text-gray-400 hover:text-gray-600"
          }`}
        >
          編集
        </button>
        <button
          type="button"
          onClick={() => setPreview(true)}
          className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
            preview ? "bg-gray-200 text-gray-800 font-medium" : "text-gray-400 hover:text-gray-600"
          }`}
        >
          プレビュー
        </button>
      </div>
      {preview ? (
        <div
          className={`w-full border border-gray-200 rounded-xl px-4 py-3 bg-white overflow-auto`}
          style={{ minHeight: `${rows * 1.75}rem` }}
        >
          {value.trim() ? (
            <MarkdownPreview body={value} />
          ) : (
            <span className="text-sm text-gray-300">{placeholder}</span>
          )}
        </div>
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none bg-white"
          placeholder={placeholder}
          rows={rows}
        />
      )}
    </div>
  );
}

function DescriptionEditor({
  value, onChange, onBlur, onPaste, rows = 6, placeholder = "説明を追加...",
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  rows?: number;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);

  function handleBlur() {
    setEditing(false);
    onBlur?.();
  }

  if (editing) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={handleBlur}
        onPaste={onPaste}
        className="w-full border border-indigo-300 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none bg-white"
        rows={rows}
        placeholder={placeholder}
        autoFocus
      />
    );
  }

  return (
    <div
      className="relative group w-full border border-gray-200 rounded-xl px-4 py-3 bg-white cursor-text"
      style={{ minHeight: `${rows * 1.75}rem` }}
      onClick={() => setEditing(true)}
    >
      {value.trim() ? (
        <MarkdownPreview body={value} />
      ) : (
        <span className="text-sm text-gray-300">{placeholder}</span>
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-1 text-xs bg-white border border-gray-200 rounded-lg text-gray-500 hover:text-gray-700 transition-all shadow-sm"
      >
        <svg viewBox="0 0 14 14" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.5 1.5l3 3L4 13H1v-3L9.5 1.5z" />
        </svg>
        編集
      </button>
    </div>
  );
}

function getTaskKey(task: Task, projects: Project[]): string | null {
  if (!task.projectId || task.taskNumber == null) return null;
  const project = projects.find((p) => p.id === task.projectId);
  if (!project?.key) return null;
  return `${project.key}-${task.taskNumber}`;
}

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("ja-JP");
}
function formatRelativeTime(dateStr: string): string {
  const diff = new Date().getTime() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}日前`;
  return formatDateTime(dateStr);
}
function formatShortDate(dateStr: string | null) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

const EMPTY_TASK_FORM = {
  title: "",
  description: "",
  status: "open" as TaskStatus,
  priority: "medium" as Priority,
  dueDate: "",
  sprintId: null as number | null,
  projectId: null as number | null,
  epicId: null as number | null,
};
const EMPTY_SPRINT_FORM = { name: "", startDate: "", endDate: "", status: "planning" as SprintStatus };
const EMPTY_PROJECT_FORM = { name: "", key: "", color: "#6366f1" };

const taskAwareCollision: CollisionDetection = (args) => {
  if (typeof args.active.id === "string" && args.active.id.startsWith("task-")) {
    const hits = pointerWithin(args);
    if (hits.length > 0) return hits;
    return closestCenter(args);
  }
  return closestCenter(args);
};

function GripIcon() {
  return (
    <svg viewBox="0 0 8 14" className="w-2 h-3.5" fill="currentColor">
      <circle cx="2" cy="2" r="1.2" />
      <circle cx="2" cy="7" r="1.2" />
      <circle cx="2" cy="12" r="1.2" />
      <circle cx="6" cy="2" r="1.2" />
      <circle cx="6" cy="7" r="1.2" />
      <circle cx="6" cy="12" r="1.2" />
    </svg>
  );
}


function SortableSprintSection({
  sprint, sprintTasks, selectedTaskId, projects, sprints, epics, allTasks,
  isTaskOver,
  onSelectTask, onToggleDone, onChangeSprint, onShowOnly, onEdit, onDelete, onNavigate, onComplete,
}: {
  sprint: Sprint;
  sprintTasks: Task[];
  selectedTaskId: number | null;
  projects: Project[];
  sprints: Sprint[];
  epics: Epic[];
  allTasks: Task[];
  isTaskOver: boolean;
  onSelectTask: (task: Task) => void;
  onToggleDone: (task: Task, e: React.MouseEvent) => void;
  onChangeSprint: (taskId: number, sprintId: number | null) => void;
  onShowOnly: (task: Task) => void;
  onEdit: () => void;
  onDelete: () => void;
  onNavigate: () => void;
  onComplete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: sprint.id });
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={`bg-white rounded-xl border overflow-hidden transition-all ${isTaskOver ? "border-2 border-dashed border-indigo-400" : "border-gray-200"}`}
    >
      {/* ヘッダー全体がドラッグハンドル。クリックでスプリントビューへ遷移 */}
      <div
        {...attributes}
        {...listeners}
        onClick={onNavigate}
        className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/60 cursor-grab active:cursor-grabbing select-none"
      >
        <span className="text-gray-300 flex-shrink-0"><GripIcon /></span>
        <h3 className="text-sm font-semibold text-gray-700 truncate">{sprint.name}</h3>
        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${SPRINT_STATUS_COLOR[sprint.status as SprintStatus]}`}>
          {SPRINT_STATUS_LABEL[sprint.status as SprintStatus]}
        </span>
        {(sprint.startDate || sprint.endDate) && (
          <span className="text-xs text-gray-400 flex-shrink-0">
            {formatShortDate(sprint.startDate)}〜{formatShortDate(sprint.endDate)}
          </span>
        )}
        <span className="text-xs text-gray-400 ml-auto flex-shrink-0">{sprintTasks.length} 件</span>
        {/* 以下のボタンは onPointerDown で伝播を止め、ドラッグ開始・ナビゲーションを阻止 */}
        <button
          onClick={(e) => { e.stopPropagation(); setCollapsed((v) => !v); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors flex-shrink-0"
          title={collapsed ? "タスクを展開" : "タスクを折りたたむ"}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-3.5 h-3.5 transition-transform ${collapsed ? "-rotate-90" : ""}`}>
            <polyline points="3 6 8 11 13 6" />
          </svg>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onComplete(); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="p-1 text-gray-400 hover:text-green-600 rounded transition-colors flex-shrink-0"
          title="スプリントを完了"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="p-1 text-gray-400 hover:text-indigo-600 rounded transition-colors flex-shrink-0"
          title="編集"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
          </svg>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors flex-shrink-0"
          title="削除"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
      {!collapsed && (
        sprintTasks.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">タスクなし</p>
        ) : (
          <div className="p-2">
            <SortableContext items={sprintTasks.map((t) => `task-${t.id}`)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-1.5">
                {sprintTasks.map((task) => (
                  <DraggableTaskCard
                    key={task.id}
                    task={task}
                    isSelected={selectedTaskId === task.id}
                    onSelect={() => onSelectTask(task)}
                    onToggleDone={(e) => onToggleDone(task, e)}
                    projects={projects}
                    sprints={sprints}
                    epics={epics}
                    onChangeSprint={onChangeSprint}
                    allTasks={allTasks}
                    onShowOnly={onShowOnly}
                  />
                ))}
              </ul>
            </SortableContext>
          </div>
        )
      )}
    </div>
  );
}

function DraggableTaskCard({
  task, isSelected, onSelect, onToggleDone, projects, sprints, epics, onChangeSprint, allTasks, onShowOnly,
}: {
  task: Task;
  isSelected: boolean;
  onSelect: () => void;
  onToggleDone: (e: React.MouseEvent) => void;
  projects: Project[];
  sprints: Sprint[];
  epics: Epic[];
  onChangeSprint: (taskId: number, sprintId: number | null) => void;
  allTasks: Task[];
  onShowOnly: (task: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `task-${task.id}` });
  const project = task.projectId ? projects.find((p) => p.id === task.projectId) : null;
  const taskKey = getTaskKey(task, projects);
  const currentSprint = task.sprintId ? sprints.find((s) => s.id === task.sprintId) : null;
  const epic = task.epicId ? epics.find((e) => e.id === task.epicId) : null;
  const subtasks = allTasks.filter((t) => t.parentId === task.id);
  const [showSprintMenu, setShowSprintMenu] = useState(false);
  const sprintMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showSprintMenu) return;
    const handler = (e: MouseEvent) => {
      if (sprintMenuRef.current && !sprintMenuRef.current.contains(e.target as Node)) {
        setShowSprintMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSprintMenu]);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={onSelect}
      {...attributes}
      {...listeners}
      className={`bg-white rounded-lg border px-3 py-2 flex gap-2 cursor-grab active:cursor-grabbing select-none transition-colors ${
        isDragging ? "opacity-30 shadow-lg" : ""
      } ${isSelected ? "border-indigo-400 ring-1 ring-indigo-400" : "border-gray-200 hover:border-indigo-200"}`}
    >
      <span className="text-gray-300 flex-shrink-0 self-center">
        <GripIcon />
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onToggleDone(e); }}
        onPointerDown={(e) => e.stopPropagation()}
        className={`w-4 h-4 rounded-full border-2 flex-shrink-0 self-center transition-colors cursor-pointer ${
          task.done ? "bg-indigo-600 border-indigo-600" : "border-gray-300 hover:border-indigo-400"
        }`}
      >
        {task.done && (
          <svg viewBox="0 0 12 12" fill="none" className="w-full h-full p-0.5">
            <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
        {/* 課題キー：固定幅で揃える */}
        <div className="w-20 flex-shrink-0">
          {taskKey ? (
            <span
              onClick={(e) => { e.stopPropagation(); onShowOnly(task); }}
              onPointerDown={(e) => e.stopPropagation()}
              className="text-xs font-mono text-gray-400 bg-gray-100 hover:bg-indigo-100 hover:text-indigo-600 px-1.5 py-0.5 rounded cursor-pointer transition-colors block truncate"
              title="この課題のみを表示"
            >
              {taskKey}
            </span>
          ) : (
            <span className="block w-full" />
          )}
        </div>
        {/* タイトル */}
        <span className={`font-medium text-sm truncate min-w-0 flex-1 ${task.done ? "line-through text-gray-400" : "text-gray-800"}`}>
          {task.title}
        </span>
        {/* バッジ類：右寄せ・縮まない */}
        <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${TASK_STATUS_COLOR[task.status as TaskStatus]}`}>
            {TASK_STATUS_LABEL[task.status as TaskStatus]}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${PRIORITY_COLOR[task.priority as Priority]}`}>
            {PRIORITY_LABEL[task.priority as Priority]}
          </span>
          {epic && (
            <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: epic.color + "22", color: epic.color }}>
              <span className="max-w-[56px] truncate">{epic.title}</span>
            </span>
          )}
          {project && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
              <span className="text-xs text-gray-500 max-w-[64px] truncate">{project.name}</span>
            </span>
          )}
          {subtasks.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 flex items-center gap-1">
              <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 1.5v6a1.5 1.5 0 0 0 1.5 1.5H9" />
                <path d="M6.5 6.5L9 9l-2.5 2.5" />
              </svg>
              {subtasks.filter((s) => s.done).length}/{subtasks.length}
            </span>
          )}
          {task.dueDate && (
            <span className="text-xs text-gray-400">期限: {formatDate(task.dueDate)}</span>
          )}
        </div>
        {/* スプリント選択 */}
        <div
          ref={sprintMenuRef}
          className="relative flex-shrink-0"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
            <button
              onClick={() => setShowSprintMenu((v) => !v)}
              className={`text-xs px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors ${
                currentSprint
                  ? "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                  : "bg-gray-100 text-gray-400 hover:bg-gray-200"
              }`}
            >
              <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="6" cy="6" r="5" />
                <path d="M6 3v3l2 1" />
              </svg>
              <span className="max-w-[80px] truncate">{currentSprint ? currentSprint.name : "バックログ"}</span>
            </button>
            {showSprintMenu && (
              <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px]">
                <button
                  onClick={() => { onChangeSprint(task.id, null); setShowSprintMenu(false); }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${!task.sprintId ? "text-indigo-600 font-medium" : "text-gray-700"}`}
                >
                  バックログ
                </button>
                {sprints.filter((s) => s.status !== "completed").map((sprint) => (
                  <button
                    key={sprint.id}
                    onClick={() => { onChangeSprint(task.id, sprint.id); setShowSprintMenu(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 truncate ${task.sprintId === sprint.id ? "text-indigo-600 font-medium" : "text-gray-700"}`}
                  >
                    {sprint.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
    </li>
  );
}

function SwimlaneCard({
  task, isSelected, onSelect, projects, allTasks, onShowOnly,
}: {
  task: Task;
  isSelected: boolean;
  onSelect: () => void;
  projects: Project[];
  allTasks: Task[];
  onShowOnly: (task: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `task-${task.id}` });
  const project = task.projectId ? projects.find((p) => p.id === task.projectId) : null;
  const taskKey = getTaskKey(task, projects);
  const subtasks = allTasks.filter((t) => t.parentId === task.id);
  return (
    <div
      ref={setNodeRef}
      onClick={onSelect}
      {...attributes}
      {...listeners}
      className={`bg-white rounded-lg border p-3 cursor-grab active:cursor-grabbing select-none touch-none transition-all ${isDragging ? "opacity-20" : ""} ${
        isSelected ? "border-indigo-400 ring-1 ring-indigo-400" : "border-gray-200 hover:border-indigo-200"
      }`}
    >
      <div className="flex items-start gap-1.5">
        <span className="mt-0.5 text-gray-300 flex-shrink-0">
          <GripIcon />
        </span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium leading-snug ${task.done ? "line-through text-gray-400" : "text-gray-800"}`}>
            {task.title}
          </p>
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            {taskKey && (
              <span
                onClick={(e) => { e.stopPropagation(); onShowOnly(task); }}
                onPointerDown={(e) => e.stopPropagation()}
                className="text-xs font-mono text-gray-400 bg-gray-100 hover:bg-indigo-100 hover:text-indigo-600 px-1.5 py-0.5 rounded flex-shrink-0 cursor-pointer transition-colors"
                title="この課題のみを表示"
              >
                {taskKey}
              </span>
            )}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${PRIORITY_COLOR[task.priority as Priority]}`}>
              {PRIORITY_LABEL[task.priority as Priority]}
            </span>
            {project && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
                <span className="text-xs text-gray-400 truncate max-w-[60px]">{project.name}</span>
              </span>
            )}
            {subtasks.length > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 flex items-center gap-1 flex-shrink-0">
                <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 1.5v6a1.5 1.5 0 0 0 1.5 1.5H9" />
                  <path d="M6.5 6.5L9 9l-2.5 2.5" />
                </svg>
                {subtasks.filter((s) => s.done).length}/{subtasks.length}
              </span>
            )}
          </div>
          {task.dueDate && (
            <p className="text-xs text-gray-400 mt-1">期限: {formatDate(task.dueDate)}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SwimlaneColumn({
  status, tasks, isOver, onSelectTask, selectedTaskId, projects, allTasks, onShowOnly,
}: {
  status: TaskStatus;
  tasks: Task[];
  isOver: boolean;
  onSelectTask: (task: Task) => void;
  selectedTaskId: number | null;
  projects: Project[];
  allTasks: Task[];
  onShowOnly: (task: Task) => void;
}) {
  const { setNodeRef } = useDroppable({ id: `col-${status}` });
  return (
    <div className="flex flex-col min-w-[200px] flex-1">
      <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-t-xl">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TASK_STATUS_COLOR[status]}`}>
          {TASK_STATUS_LABEL[status]}
        </span>
        <span className="text-xs text-gray-400 ml-auto font-medium">{tasks.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-64 p-2 space-y-2 border-x border-b border-gray-200 rounded-b-xl transition-colors ${
          isOver ? "bg-indigo-50 ring-2 ring-inset ring-indigo-200" : "bg-gray-50"
        }`}
      >
        {tasks.map((task) => (
          <SwimlaneCard
            key={task.id}
            task={task}
            isSelected={selectedTaskId === task.id}
            onSelect={() => onSelectTask(task)}
            projects={projects}
            allTasks={allTasks}
            onShowOnly={onShowOnly}
          />
        ))}
      </div>
    </div>
  );
}

function DroppableProjectItem({
  project, isSelected, taskCount, onSelect, onEdit, onDelete, isTaskOver,
}: {
  project: Project;
  isSelected: boolean;
  taskCount: number;
  onSelect: () => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  isTaskOver: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: `project-${project.id}` });
  return (
    <div
      ref={setNodeRef}
      onClick={onSelect}
      className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all ${
        isTaskOver ? "ring-2 ring-indigo-400 bg-indigo-50"
          : isSelected ? "bg-indigo-50 text-indigo-700"
          : "text-gray-700 hover:bg-gray-50"
      }`}
    >
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
      <span className="text-sm font-medium flex-1 truncate">{project.name}</span>
      {project.key && (
        <span className="text-xs font-mono text-gray-400 flex-shrink-0">{project.key}</span>
      )}
      <span className="text-xs text-gray-400 flex-shrink-0 opacity-0 group-hover:opacity-0">{taskCount}</span>
      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 flex-shrink-0 transition-opacity">
        <span className="text-xs text-gray-400">{taskCount}</span>
        <button
          onClick={onEdit}
          className="text-gray-400 hover:text-indigo-500 p-0.5 rounded"
          title="編集"
        >
          <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z" />
          </svg>
        </button>
        <button
          onClick={onDelete}
          className="text-gray-400 hover:text-red-500 p-0.5 rounded"
          title="削除"
        >
          <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function SprintTableRow({
  sprint, taskCount, doneCount, onComplete, onDelete, onSave,
}: {
  sprint: Sprint;
  taskCount: number;
  doneCount: number;
  onComplete: () => void;
  onDelete: () => void;
  onSave: (id: number, data: Partial<{ name: string; status: SprintStatus; startDate: string | null; endDate: string | null }>) => void;
}) {
  const [name, setName] = useState(sprint.name);
  useEffect(() => { setName(sprint.name); }, [sprint.name]);

  const isCompleted = sprint.status === "completed";
  const cellBase = "px-2 py-1 w-full bg-transparent rounded focus:outline-none focus:ring-1 focus:ring-indigo-300 text-sm";

  const handleNameBlur = () => {
    const trimmed = name.trim();
    if (!trimmed) { setName(sprint.name); return; }
    if (trimmed !== sprint.name) onSave(sprint.id, { name: trimmed });
  };

  return (
    <tr className={`border-b border-gray-100 last:border-0 ${isCompleted ? "opacity-60" : "hover:bg-gray-50/40"} transition-colors`}>
      <td className="px-2 py-2">
        {isCompleted ? (
          <span className="px-2 text-sm font-medium text-gray-800">{sprint.name}</span>
        ) : (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleNameBlur}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            className={`${cellBase} font-medium text-gray-800`}
          />
        )}
      </td>
      <td className="px-2 py-2">
        {isCompleted ? (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SPRINT_STATUS_COLOR[sprint.status as SprintStatus]}`}>
            {SPRINT_STATUS_LABEL[sprint.status as SprintStatus]}
          </span>
        ) : (
          <select
            value={sprint.status}
            onChange={(e) => onSave(sprint.id, { status: e.target.value as SprintStatus })}
            className={`${cellBase} cursor-pointer text-gray-800`}
          >
            <option value="planning">計画中</option>
            <option value="active">アクティブ</option>
          </select>
        )}
      </td>
      <td className="px-2 py-2">
        {isCompleted ? (
          <span className="px-2 text-sm text-gray-500">{sprint.startDate ? formatDate(sprint.startDate) : "—"}</span>
        ) : (
          <input
            type="date"
            value={sprint.startDate ? sprint.startDate.slice(0, 10) : ""}
            onChange={(e) => onSave(sprint.id, { startDate: e.target.value || null })}
            className={`${cellBase} text-gray-600`}
          />
        )}
      </td>
      <td className="px-2 py-2">
        {isCompleted ? (
          <span className="px-2 text-sm text-gray-500">{sprint.endDate ? formatDate(sprint.endDate) : "—"}</span>
        ) : (
          <input
            type="date"
            value={sprint.endDate ? sprint.endDate.slice(0, 10) : ""}
            onChange={(e) => onSave(sprint.id, { endDate: e.target.value || null })}
            className={`${cellBase} text-gray-600`}
          />
        )}
      </td>
      <td className="px-4 py-2 text-sm text-gray-500">{doneCount}/{taskCount}</td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-1">
          {!isCompleted && (
            <button onClick={onComplete} className="p-1 text-gray-400 hover:text-green-600 rounded transition-colors" title="スプリントを完了">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </button>
          )}
          <button onClick={onDelete} className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors" title="削除">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
}

function EpicDropZone({ epicId, children }: { epicId: number | null; children: React.ReactNode }) {
  const id = epicId === null ? "epic-null" : `epic-${epicId}`;
  const { setNodeRef } = useDroppable({ id });
  return <div ref={setNodeRef}>{children}</div>;
}

function MainBacklogDropZone({ children, isHighlighted }: { children: React.ReactNode; isHighlighted: boolean }) {
  const { setNodeRef } = useDroppable({ id: "backlog" });
  return (
    <div
      ref={setNodeRef}
      className={`mt-3 bg-white rounded-xl overflow-hidden transition-all ${
        isHighlighted ? "border-2 border-dashed border-indigo-400" : "border border-gray-200"
      }`}
    >
      {children}
    </div>
  );
}


export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [view, setView] = useState<ViewState>("all-sprints");
  const [previousView, setPreviousView] = useState<ViewState>("all-sprints");
  const [filterProjectId, setFilterProjectId] = useState<number | null>(null);
  const [filterEpicId, setFilterEpicId] = useState<number | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>("empty");
  const [taskForm, setTaskForm] = useState(EMPTY_TASK_FORM);
  const [showSprintForm, setShowSprintForm] = useState(false);
  const [sprintForm, setSprintForm] = useState(EMPTY_SPRINT_FORM);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectForm, setProjectForm] = useState(EMPTY_PROJECT_FORM);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editingSprint, setEditingSprint] = useState<Sprint | null>(null);
  const [editSprintForm, setEditSprintForm] = useState(EMPTY_SPRINT_FORM);
  const [completingSprintId, setCompletingSprintId] = useState<number | null>(null);
  const [completeMoveTarget, setCompleteMoveTarget] = useState<string>("backlog");
  const [showSprintFormMain, setShowSprintFormMain] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  type UpdateStatus = "idle" | "running" | "done" | "error";
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [updateSteps, setUpdateSteps] = useState<{ label: string; output: string; success: boolean }[]>([]);
  const [updateUpToDate, setUpdateUpToDate] = useState(false);
  const [editProjectForm, setEditProjectForm] = useState({ name: "", key: "" });
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [activeOverId, setActiveOverId] = useState<string | number | null>(null);
  const [mainMenu, setMainMenu] = useState<"tasks" | "sprints">("tasks");
  const [sprintSubMenu, setSprintSubMenu] = useState<"management" | "records">("management");
  const [showClosedSprints, setShowClosedSprints] = useState(false);
  const [selectedRecordSprintId, setSelectedRecordSprintId] = useState<number | null>(null);
  const [sprintTaskRecords, setSprintTaskRecords] = useState<SprintTaskRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [displayMode, setDisplayMode] = useState<"list" | "swimlane">("list");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [activities, setActivities] = useState<TaskActivity[]>([]);
  const [commentTab, setCommentTab] = useState<"comments" | "activity">("comments");
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState("");
  const [epics, setEpics] = useState<Epic[]>([]);
  const [showEpicForm, setShowEpicForm] = useState(false);
  const [epicForm, setEpicForm] = useState(EMPTY_EPIC_FORM);
  const [editingEpic, setEditingEpic] = useState<Epic | null>(null);
  const [editEpicForm, setEditEpicForm] = useState(EMPTY_EPIC_FORM);
  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<Task[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [panelDragOver, setPanelDragOver] = useState(false);
  const [detailDragOver, setDetailDragOver] = useState(false);

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;
  const isTaskDragging = !!activeDragId?.startsWith("task-");
  const activeDragTask = isTaskDragging
    ? tasks.find((t) => t.id === parseInt(activeDragId!.replace("task-", "")))
    : null;

  async function fetchAll() {
    const [tasksRes, sprintsRes, projectsRes, epicsRes] = await Promise.all([
      fetch("/api/tasks"),
      fetch("/api/sprints"),
      fetch("/api/projects"),
      fetch("/api/epics"),
    ]);
    const newTasks: Task[] = await tasksRes.json();
    const newSprints: Sprint[] = await sprintsRes.json();
    const newProjects: Project[] = await projectsRes.json();
    const newEpics: Epic[] = await epicsRes.json();
    setTasks(newTasks);
    setSprints(newSprints);
    setProjects(newProjects);
    setEpics(newEpics);
    return { tasks: newTasks, sprints: newSprints, projects: newProjects, epics: newEpics };
  }

  useEffect(() => { fetchAll(); }, []);

  async function fetchComments(taskId: number) {
    const res = await fetch(`/api/tasks/${taskId}/comments`);
    setComments(await res.json());
  }

  useEffect(() => {
    if (selectedTaskId) fetchComments(selectedTaskId);
    else setComments([]);
  }, [selectedTaskId]);

  const viewedTasks = tasks.filter((t) => {
    if (isTaskView(view)) return t.id === view.id;
    if (isSearchView(view)) return false;
    if (t.parentId !== null) return false;
    if (filterProjectId !== null && t.projectId !== filterProjectId) return false;
    if (filterEpicId !== null && t.epicId !== filterEpicId) return false;
    return true;
  });
  const filtered = viewedTasks;

  const currentTaskInView = isTaskView(view) ? tasks.find((t) => t.id === view.id) : null;
  const viewTitle = view === "all-sprints" ? "スプリントビュー"
    : view === "all-epics" ? "エピックビュー"
    : isSearchView(view) ? `「${view.query}」の検索結果`
    : isTaskView(view)
    ? (currentTaskInView ? `${getTaskKey(currentTaskInView, projects) ?? "#" + currentTaskInView.id}` : "")
    : "";

  function showTaskOnly(task: Task) {
    setPreviousView((prev) => (isTaskView(view) ? prev : view));
    setView({ kind: "task", id: task.id });
    selectTask(task);
  }

  function populateForm(task: Task) {
    setTaskForm({
      title: task.title,
      description: task.description ?? "",
      status: task.status as TaskStatus,
      priority: task.priority as Priority,
      dueDate: task.dueDate ? task.dueDate.split("T")[0] : "",
      sprintId: task.sprintId,
      projectId: task.projectId,
      epicId: task.epicId,
    });
  }

  async function fetchActivities(taskId: number) {
    const res = await fetch(`/api/tasks/${taskId}/activities`);
    const data = await res.json();
    setActivities(data);
  }

  async function fetchAttachments(taskId: number) {
    const res = await fetch(`/api/tasks/${taskId}/attachments`);
    setAttachments(await res.json());
  }

  async function handleUpload(taskId: number, file: File) {
    setIsUploading(true);
    const form = new FormData();
    form.append("file", file);
    await fetch(`/api/tasks/${taskId}/attachments`, { method: "POST", body: form });
    await fetchAttachments(taskId);
    setIsUploading(false);
  }

  async function handleDeleteAttachment(attachmentId: number, taskId: number) {
    await fetch(`/api/attachments/${attachmentId}`, { method: "DELETE" });
    await fetchAttachments(taskId);
  }

  function handleFileDrop(e: React.DragEvent, taskId: number) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(taskId, file);
  }

  async function handleCommentImagePaste(
    e: React.ClipboardEvent<HTMLTextAreaElement>,
    taskId: number,
    getValue: () => string,
    setValue: (v: string) => void
  ) {
    const imageItem = Array.from(e.clipboardData.items).find((item) =>
      item.type.startsWith("image/")
    );
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;

    const { selectionStart: start, selectionEnd: end } = e.currentTarget;
    const form = new FormData();
    form.append("file", new File([file], `paste-${Date.now()}.png`, { type: file.type }));
    const res = await fetch(`/api/tasks/${taskId}/attachments`, { method: "POST", body: form });
    const att: TaskAttachment = await res.json();
    await fetchAttachments(taskId);

    const markdown = `![画像](${att.filepath})`;
    const current = getValue();
    setValue(current.slice(0, start) + markdown + current.slice(end));
  }

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedSearchContextRef = useRef<{ view: ViewState; mainMenu: "tasks" | "sprints" } | null>(null);

  async function fetchSearch(q: string) {
    setIsSearching(true);
    setView({ kind: "search", query: q });
    setMainMenu("tasks");
    const res = await fetch(`/api/tasks/search?q=${encodeURIComponent(q)}`);
    setSearchResults(await res.json());
    setIsSearching(false);
  }

  function clearSearch() {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    setSearchInput("");
    setSearchResults([]);
    if (savedSearchContextRef.current) {
      setView(savedSearchContextRef.current.view);
      setMainMenu(savedSearchContextRef.current.mainMenu);
      savedSearchContextRef.current = null;
    }
  }

  function handleSearchInputChange(value: string) {
    setSearchInput(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (value.trim()) {
      if (!isSearchView(view) && !savedSearchContextRef.current) {
        savedSearchContextRef.current = { view, mainMenu };
      }
      searchDebounceRef.current = setTimeout(() => fetchSearch(value.trim()), 300);
    } else {
      clearSearch();
    }
  }

  function selectTask(task: Task) {
    setSelectedTaskId(task.id);
    populateForm(task);
    setPanelMode("edit");
    setEditingCommentId(null);
    setNewComment("");
    fetchActivities(task.id);
    fetchAttachments(task.id);
  }

  function openCreateForm() {
    setSelectedTaskId(null);
    setTaskForm({ ...EMPTY_TASK_FORM, projectId: filterProjectId, epicId: filterEpicId });
    setPanelMode("create");
  }

  async function saveTaskField(taskId: number, data: Record<string, unknown>) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const { tasks: newTasks } = await fetchAll();
    const updated = newTasks.find((t) => t.id === taskId);
    if (updated) populateForm(updated);
    fetchActivities(taskId);
  }

  async function handleTaskSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!taskForm.title.trim()) return;
    const body = {
      title: taskForm.title.trim(),
      description: taskForm.description.trim() || null,
      status: taskForm.status,
      priority: taskForm.priority,
      dueDate: taskForm.dueDate || null,
      sprintId: taskForm.sprintId,
      projectId: taskForm.projectId,
      epicId: taskForm.epicId,
    };
    if (panelMode === "edit" && selectedTask) {
      await fetch(`/api/tasks/${selectedTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const { tasks: newTasks } = await fetchAll();
      const updated = newTasks.find((t) => t.id === selectedTask.id);
      if (updated) populateForm(updated);
    } else {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const created: Task = await res.json();
      await fetchAll();
      setSelectedTaskId(created.id);
      populateForm(created);
      setPanelMode("edit");
    }
  }

  async function toggleDone(task: Task, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !task.done }),
    });
    await fetchAll();
  }

  async function deleteTask() {
    if (!selectedTask) return;
    if (!confirm("このタスクを削除しますか？")) return;
    await fetch(`/api/tasks/${selectedTask.id}`, { method: "DELETE" });
    setSelectedTaskId(null);
    setPanelMode("empty");
    fetchAll();
  }

  async function handleAddSubtask(e: React.FormEvent) {
    e.preventDefault();
    if (!newSubtaskTitle.trim() || !selectedTask) return;
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newSubtaskTitle.trim(),
        sprintId: selectedTask.sprintId,
        projectId: selectedTask.projectId,
        parentId: selectedTask.id,
      }),
    });
    const created: Task = await res.json();
    setNewSubtaskTitle("");
    await fetchAll();
    fetchActivities(selectedTask.id);
    return created;
  }

  async function unlinkFromParent() {
    if (!selectedTask) return;
    await fetch(`/api/tasks/${selectedTask.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: null }),
    });
    fetchAll();
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim() || !selectedTaskId) return;
    await fetch(`/api/tasks/${selectedTaskId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: newComment.trim() }),
    });
    setNewComment("");
    await fetchComments(selectedTaskId);
    fetchActivities(selectedTaskId);
  }

  async function handleSaveEdit(commentId: number) {
    if (!editingCommentBody.trim() || !selectedTaskId) return;
    await fetch(`/api/comments/${commentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: editingCommentBody.trim() }),
    });
    setEditingCommentId(null);
    setEditingCommentBody("");
    await fetchComments(selectedTaskId);
    fetchActivities(selectedTaskId);
  }

  async function handleDeleteComment(commentId: number) {
    if (!selectedTaskId) return;
    await fetch(`/api/comments/${commentId}`, { method: "DELETE" });
    await fetchComments(selectedTaskId);
    fetchActivities(selectedTaskId);
  }

  async function handleSprintSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sprintForm.name.trim()) return;
    const res = await fetch("/api/sprints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: sprintForm.name.trim(),
        startDate: sprintForm.startDate || null,
        endDate: sprintForm.endDate || null,
        status: sprintForm.status,
      }),
    });
    const created: Sprint = await res.json();
    setSprintForm(EMPTY_SPRINT_FORM);
    setShowSprintForm(false);
    await fetchAll();
  }

  async function deleteSprint(sprint: Sprint) {
    if (!confirm(`「${sprint.name}」を削除しますか？\n内のタスクはバックログへ移動されます。`)) return;
    await fetch(`/api/sprints/${sprint.id}`, { method: "DELETE" });
    fetchAll();
  }

  async function loadSprintRecords(sprintId: number) {
    setSelectedRecordSprintId(sprintId);
    setLoadingRecords(true);
    const res = await fetch(`/api/sprints/${sprintId}/records`);
    const data: SprintTaskRecord[] = await res.json();
    setSprintTaskRecords(data);
    setLoadingRecords(false);
  }

  async function handleSprintInlineSave(id: number, data: Partial<{ name: string; status: SprintStatus; startDate: string | null; endDate: string | null }>) {
    await fetch(`/api/sprints/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    await fetchAll();
  }

  function openCompleteSprintModal(sprint: Sprint) {
    setCompletingSprintId(sprint.id);
    setCompleteMoveTarget("backlog");
  }

  async function handleCompleteSprint() {
    if (completingSprintId === null) return;
    const moveToSprintId = completeMoveTarget === "backlog" ? null : parseInt(completeMoveTarget);
    await fetch(`/api/sprints/${completingSprintId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moveToSprintId }),
    });
    setCompletingSprintId(null);
    await fetchAll();
  }

  async function handleProjectSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectForm.name.trim()) return;
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: projectForm.name.trim(), key: projectForm.key.trim() || null, color: projectForm.color }),
    });
    const created: Project = await res.json();
    setProjectForm(EMPTY_PROJECT_FORM);
    setShowProjectForm(false);
    await fetchAll();
    setFilterProjectId(created.id);
  }

  async function handleChangeSprint(taskId: number, sprintId: number | null) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sprintId }),
    });
    fetchAll();
  }

  function openEditProject(project: Project, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingProject(project);
    setEditProjectForm({ name: project.name, key: project.key ?? "" });
  }

  async function handleUpdateSprint(e: React.FormEvent) {
    e.preventDefault();
    if (!editingSprint || !editSprintForm.name.trim()) return;
    await fetch(`/api/sprints/${editingSprint.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editSprintForm.name.trim(),
        startDate: editSprintForm.startDate || null,
        endDate: editSprintForm.endDate || null,
        status: editSprintForm.status,
      }),
    });
    setEditingSprint(null);
    await fetchAll();
  }

  async function handleUpdateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!editingProject || !editProjectForm.name.trim()) return;
    await fetch(`/api/projects/${editingProject.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editProjectForm.name.trim(),
        key: editProjectForm.key.trim() || null,
      }),
    });
    setEditingProject(null);
    await fetchAll();
  }

  async function deleteProject(project: Project) {
    if (!confirm(`「${project.name}」を削除しますか？\nタスクの割り当ては解除されます。`)) return;
    await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    if (filterProjectId === project.id) setFilterProjectId(null);
    fetchAll();
  }

  async function handleEpicSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!epicForm.title.trim()) return;
    const res = await fetch("/api/epics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: epicForm.title.trim(),
        description: epicForm.description.trim() || null,
        color: epicForm.color,
        projectId: epicForm.projectId,
      }),
    });
    const created: Epic = await res.json();
    setEpicForm(EMPTY_EPIC_FORM);
    setShowEpicForm(false);
    await fetchAll();
    setFilterEpicId(created.id);
  }

  async function handleUpdateEpic(e: React.FormEvent) {
    e.preventDefault();
    if (!editingEpic || !editEpicForm.title.trim()) return;
    await fetch(`/api/epics/${editingEpic.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editEpicForm.title.trim(),
        description: editEpicForm.description.trim() || null,
        color: editEpicForm.color,
        projectId: editEpicForm.projectId,
      }),
    });
    setEditingEpic(null);
    await fetchAll();
  }

  async function deleteEpic(epic: Epic) {
    if (!confirm(`「${epic.title}」を削除しますか？\nストーリーの割り当ては解除されます。`)) return;
    await fetch(`/api/epics/${epic.id}`, { method: "DELETE" });
    if (filterEpicId === epic.id) setFilterEpicId(null);
    fetchAll();
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragStart(e: DragStartEvent) { setActiveDragId(String(e.active.id)); }
  function handleDragOver(e: DragOverEvent) { setActiveOverId(e.over?.id ?? null); }

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveDragId(null);
    setActiveOverId(null);
    if (!over) return;
    const activeId = active.id;
    const overId = over.id;

    if (typeof activeId === "string" && activeId.startsWith("task-")) {
      const taskId = parseInt(activeId.replace("task-", ""));
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      if (typeof overId === "string" && overId.startsWith("task-")) {
        const overTaskId = parseInt(overId.replace("task-", ""));
        if (taskId === overTaskId) return;
        // スプリントをまたいだドロップ → スプリント移動
        const overTask = tasks.find((t) => t.id === overTaskId);
        if (overTask && task.sprintId !== overTask.sprintId && view !== "all-epics") {
          await fetch(`/api/tasks/${taskId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sprintId: overTask.sprintId }),
          });
          await fetchAll();
          return;
        }
        // all-epics ビューでエピックをまたいだドロップ → エピック移動
        if (view === "all-epics" && overTask && task.epicId !== overTask.epicId) {
          await fetch(`/api/tasks/${taskId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ epicId: overTask.epicId }),
          });
          await fetchAll();
          return;
        }
        const sprintTasksForReorder = view === "all-epics"
          ? filtered
          : filtered.filter((t) => t.sprintId === task.sprintId);
        const oldIdx = sprintTasksForReorder.findIndex((t) => t.id === taskId);
        const newIdx = sprintTasksForReorder.findIndex((t) => t.id === overTaskId);
        if (oldIdx === -1 || newIdx === -1) return;
        const reordered = arrayMove(sprintTasksForReorder, oldIdx, newIdx);
        // 楽観的更新
        const oldTaskIdx = tasks.findIndex((t) => t.id === taskId);
        const newTaskIdx = tasks.findIndex((t) => t.id === overTaskId);
        setTasks(arrayMove(tasks, oldTaskIdx, newTaskIdx));
        await fetch("/api/tasks/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: reordered.map((t) => t.id) }),
        });
        await fetchAll();
        return;
      }

      if (typeof overId === "string" && overId.startsWith("epic-")) {
        const targetEpicId = overId === "epic-null" ? null : parseInt(overId.replace("epic-", ""));
        if (task.epicId === targetEpicId) return;
        await fetch(`/api/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ epicId: targetEpicId }),
        });
        await fetchAll();
        return;
      }

      if (typeof overId === "string" && overId.startsWith("col-")) {
        const newStatus = overId.replace("col-", "") as TaskStatus;
        if (task.status === newStatus) return;
        await fetch(`/api/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        await fetchAll();
        return;
      }

      if (typeof overId === "string" && overId.startsWith("project-")) {
        const projectId = parseInt(overId.replace("project-", ""));
        if (task.projectId === projectId) return;
        await fetch(`/api/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId }),
        });
        await fetchAll();
        return;
      }

      let newSprintId: number | null;
      if (overId === "backlog") newSprintId = null;
      else if (typeof overId === "number") newSprintId = overId;
      else return;
      if (task.sprintId === newSprintId) return;
      await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sprintId: newSprintId }),
      });
      await fetchAll();
    } else if (typeof activeId === "number") {
      if (activeId === overId) return;
      const oldIndex = sprints.findIndex((s) => s.id === activeId);
      const newIndex = sprints.findIndex((s) => s.id === overId);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(sprints, oldIndex, newIndex);
      setSprints(reordered);
      await fetch("/api/sprints/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: reordered.map((s) => s.id) }),
      });
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={taskAwareCollision}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="h-screen flex flex-col bg-gray-50">
        <header className="bg-white border-b border-gray-200 px-6 py-2 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-800">タスク管理</h1>
            <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setMainMenu("tasks")}
                className={`px-4 py-1 rounded-md text-sm font-medium transition-colors ${mainMenu === "tasks" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                タスク
              </button>
              <button
                onClick={() => setMainMenu("sprints")}
                className={`px-4 py-1 rounded-md text-sm font-medium transition-colors ${mainMenu === "sprints" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                スプリント
              </button>
            </div>
            <div className="relative">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="6.5" cy="6.5" r="4.5" />
                <line x1="10" y1="10" x2="14" y2="14" />
              </svg>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => handleSearchInputChange(e.target.value)}
                placeholder="タスクを検索..."
                className="border border-gray-300 rounded-lg pl-8 pr-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-52"
              />
            </div>
            <div className="flex items-center gap-2">
            <button
              onClick={openCreateForm}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              + タスクを追加
            </button>
            <button
              onClick={() => { setShowAdminModal(true); setUpdateStatus("idle"); setUpdateSteps([]); setUpdateUpToDate(false); }}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="管理メニュー"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
            </button>
            </div>
          </div>
        </header>

        {/* スプリントメニュー */}
        {mainMenu === "sprints" && (
          <div className="flex flex-1 overflow-hidden flex-col">
            {/* サブタブ */}
            <div className="flex-shrink-0 border-b border-gray-200 bg-white px-6 flex items-center gap-6">
              {(["management", "records"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setSprintSubMenu(tab)}
                  className={`py-3 text-sm font-medium border-b-2 transition-colors ${sprintSubMenu === tab ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                >
                  {tab === "management" ? "スプリント管理" : "スプリント記録"}
                </button>
              ))}
            </div>

            {/* スプリント管理 */}
            {sprintSubMenu === "management" && (
              <div className="flex-1 overflow-y-auto p-6">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-gray-500">{sortSprints(sprints).filter((s) => showClosedSprints || s.status !== "completed").length} 件</p>
                  <button
                    onClick={() => setShowClosedSprints((v) => !v)}
                    className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${showClosedSprints ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}
                  >
                    {showClosedSprints ? "クローズ済みを非表示" : "クローズ済みを表示"}
                  </button>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/60">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 w-48">スプリント名</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 w-24">ステータス</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 w-28">開始日</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 w-28">終了日</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 w-20">タスク数</th>
                        <th className="px-4 py-2.5 w-24"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortSprints(sprints)
                        .filter((s) => showClosedSprints || s.status !== "completed")
                        .map((sprint) => (
                          <SprintTableRow
                            key={sprint.id}
                            sprint={sprint}
                            taskCount={tasks.filter((t) => t.sprintId === sprint.id && t.parentId === null).length}
                            doneCount={tasks.filter((t) => t.sprintId === sprint.id && t.parentId === null && t.done).length}
                            onComplete={() => openCompleteSprintModal(sprint)}
                            onDelete={() => deleteSprint(sprint)}
                            onSave={handleSprintInlineSave}
                          />
                        ))}
                    </tbody>
                  </table>
                  {sortSprints(sprints).filter((s) => showClosedSprints || s.status !== "completed").length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-10">スプリントがありません</p>
                  )}
                </div>
              </div>
            )}

            {/* スプリント記録 */}
            {sprintSubMenu === "records" && (
              <div className="flex flex-1 overflow-hidden">
                {/* 左ペイン：スプリント一覧 */}
                <div className="w-64 flex-shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
                  <div className="p-3 border-b border-gray-100">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">スプリント一覧</p>
                  </div>
                  <ul className="py-1">
                    {[
                      ...sprints.filter((s) => s.status === "active"),
                      ...sprints
                        .filter((s) => s.status === "completed")
                        .sort((a, b) => {
                          if (!a.closedAt && !b.closedAt) return 0;
                          if (!a.closedAt) return 1;
                          if (!b.closedAt) return -1;
                          return new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime();
                        }),
                    ].map((sprint) => (
                      <li key={sprint.id}>
                        <button
                          onClick={() => loadSprintRecords(sprint.id)}
                          className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${selectedRecordSprintId === sprint.id ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sprint.status === "active" ? "bg-green-500" : "bg-gray-300"}`} />
                            <span className="truncate">{sprint.name}</span>
                          </div>
                          {sprint.closedAt && (
                            <p className="text-xs text-gray-400 mt-0.5 pl-3.5">{formatDate(sprint.closedAt)}</p>
                          )}
                        </button>
                      </li>
                    ))}
                    {sprints.filter((s) => s.status === "active" || s.status === "completed").length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-8">記録がありません</p>
                    )}
                  </ul>
                </div>

                {/* 右ペイン：タスク記録 */}
                <div className="flex-1 overflow-y-auto p-6">
                  {selectedRecordSprintId === null ? (
                    <div className="flex items-center justify-center h-full text-gray-400 text-sm">左のスプリントを選択してください</div>
                  ) : loadingRecords ? (
                    <div className="flex items-center justify-center h-full text-gray-400 text-sm">読み込み中…</div>
                  ) : (() => {
                    const sprint = sprints.find((s) => s.id === selectedRecordSprintId);
                    const done = sprintTaskRecords.filter((r) => r.wasDone);
                    const moved = sprintTaskRecords.filter((r) => !r.wasDone);
                    return (
                      <div className="max-w-2xl">
                        <div className="mb-5">
                          <h2 className="text-base font-bold text-gray-800">{sprint?.name}</h2>
                          <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                            {sprint?.startDate && <span>開始: {formatDate(sprint.startDate)}</span>}
                            {sprint?.endDate && <span>終了: {formatDate(sprint.endDate)}</span>}
                            {sprint?.closedAt && <span>クローズ: {formatDate(sprint.closedAt)}</span>}
                          </div>
                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-sm text-gray-600">完了 <span className="font-semibold text-green-700">{done.length}</span></span>
                            <span className="text-gray-300">|</span>
                            <span className="text-sm text-gray-600">未完了 <span className="font-semibold text-orange-600">{moved.length}</span></span>
                            <span className="text-gray-300">|</span>
                            <span className="text-sm text-gray-600">合計 <span className="font-semibold">{sprintTaskRecords.length}</span></span>
                          </div>
                        </div>

                        {sprint?.status === "active" && (
                          <div className="mb-5 p-3 bg-green-50 rounded-lg border border-green-200 text-xs text-green-700">
                            アクティブなスプリントです。クローズ後に記録が保存されます。
                          </div>
                        )}

                        {sprintTaskRecords.length === 0 && sprint?.status !== "active" ? (
                          <p className="text-sm text-gray-400">このスプリントの記録はありません。</p>
                        ) : (
                          <>
                            {done.length > 0 && (
                              <div className="mb-5">
                                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">完了タスク ({done.length})</h3>
                                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                  <ul className="divide-y divide-gray-100">
                                    {done.map((r) => {
                                      const t = tasks.find((t) => t.id === r.taskId);
                                      return (
                                        <li
                                          key={r.id}
                                          onClick={() => { if (t) { setMainMenu("tasks"); showTaskOnly(t); } }}
                                          className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${t ? "cursor-pointer hover:bg-gray-50" : ""}`}
                                        >
                                          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-green-500 flex-shrink-0">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                          </svg>
                                          <span className="text-sm text-gray-700 line-through decoration-gray-400 flex-1">{r.taskTitle}</span>
                                          {t && <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-gray-300 flex-shrink-0"><path d="M6 3h7v7M13 3 3 13"/></svg>}
                                          {!t && <span className="text-xs text-gray-300 flex-shrink-0">削除済み</span>}
                                        </li>
                                      );
                                    })}
                                  </ul>
                                </div>
                              </div>
                            )}
                            {moved.length > 0 && (
                              <div>
                                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">未完了・移動したタスク ({moved.length})</h3>
                                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                  <ul className="divide-y divide-gray-100">
                                    {moved.map((r) => {
                                      const t = tasks.find((t) => t.id === r.taskId);
                                      return (
                                        <li
                                          key={r.id}
                                          onClick={() => { if (t) { setMainMenu("tasks"); showTaskOnly(t); } }}
                                          className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${t ? "cursor-pointer hover:bg-gray-50" : ""}`}
                                        >
                                          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-orange-400 flex-shrink-0">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                          </svg>
                                          <span className="text-sm text-gray-700 flex-1">{r.taskTitle}</span>
                                          <span className="text-xs text-gray-400 flex-shrink-0">移動先: {r.movedToSprintName ?? "バックログ"}</span>
                                          {t && <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-gray-300 flex-shrink-0"><path d="M6 3h7v7M13 3 3 13"/></svg>}
                                          {!t && <span className="text-xs text-gray-300 flex-shrink-0">削除済み</span>}
                                        </li>
                                      );
                                    })}
                                  </ul>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

        <div className={`flex flex-1 overflow-hidden ${mainMenu !== "tasks" ? "hidden" : ""}`}>
          {/* ナビゲーション */}
          <aside className={`${sidebarCollapsed ? "w-10" : "w-56"} transition-all duration-200 ease-in-out border-r border-gray-200 bg-white flex-shrink-0 flex flex-col overflow-hidden`}>
            {/* ヘッダー：ラベル + 開閉ボタン */}
            <div className={`flex-shrink-0 flex items-center border-b border-gray-100 ${sidebarCollapsed ? "justify-center py-2.5" : "px-3 py-1.5"}`}>
              {!sidebarCollapsed && (
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex-1">ナビゲーション</span>
              )}
              <button
                onClick={() => setSidebarCollapsed((v) => !v)}
                title={sidebarCollapsed ? "ナビゲーションを開く" : "ナビゲーションを閉じる"}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {sidebarCollapsed
                    ? <><polyline points="6 4 10 8 6 12" /></>
                    : <><polyline points="10 4 6 8 10 12" /></>}
                </svg>
              </button>
            </div>
            <div className={`flex-1 overflow-y-auto min-h-0 ${sidebarCollapsed ? "hidden" : ""}`}>

              {/* プロジェクト */}
              <div className="p-3 border-b border-gray-100">
                <div className="flex items-center justify-between px-1 mb-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">プロジェクト</p>
                  <button
                    onClick={() => setShowProjectForm(true)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    + 追加
                  </button>
                </div>

                {showProjectForm && (
                  <form onSubmit={handleProjectSubmit} className="mb-2 p-2 bg-gray-50 rounded-lg border border-gray-200 space-y-2">
                    <input
                      type="text"
                      value={projectForm.name}
                      onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="プロジェクト名"
                      autoFocus
                    />
                    <input
                      type="text"
                      value={projectForm.key}
                      onChange={(e) => setProjectForm({ ...projectForm, key: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })}
                      maxLength={15}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-mono text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="キー (例: PRJ)"
                    />
                    <div className="flex gap-1.5 flex-wrap">
                      {PROJECT_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setProjectForm({ ...projectForm, color })}
                          className={`w-5 h-5 rounded-full flex-shrink-0 transition-transform ${
                            projectForm.color === color ? "scale-110 ring-2 ring-offset-1 ring-gray-400" : ""
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <div className="flex gap-1">
                      <button type="submit" className="flex-1 bg-indigo-600 text-white rounded px-2 py-1.5 text-xs font-medium hover:bg-indigo-700">追加</button>
                      <button type="button" onClick={() => { setShowProjectForm(false); setProjectForm(EMPTY_PROJECT_FORM); }} className="flex-1 border border-gray-300 text-gray-600 rounded px-2 py-1.5 text-xs hover:bg-gray-50">キャンセル</button>
                    </div>
                  </form>
                )}

                {projects.length === 0 && !showProjectForm && (
                  <p className="text-xs text-gray-400 px-1 py-2">プロジェクトがありません</p>
                )}
                <div className="space-y-0.5">
                  {projects.map((project) => (
                    <DroppableProjectItem
                      key={project.id}
                      project={project}
                      isSelected={filterProjectId === project.id}
                      taskCount={tasks.filter((t) => t.projectId === project.id && t.parentId === null).length}
                      onSelect={() => setFilterProjectId(filterProjectId === project.id ? null : project.id)}
                      onEdit={(e) => openEditProject(project, e)}
                      onDelete={(e) => { e.stopPropagation(); deleteProject(project); }}
                      isTaskOver={isTaskDragging && activeOverId === `project-${project.id}`}
                    />
                  ))}
                </div>
              </div>

              {/* エピック */}
              <div className="p-3 border-b border-gray-100">
                <div className="flex items-center justify-between px-1 mb-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">エピック</p>
                </div>
                <button
                  onClick={() => setView(view === "all-epics" ? "all-sprints" : "all-epics")}
                  className={`w-full text-left flex items-center justify-between px-2 py-1.5 mb-1 rounded-lg text-sm transition-colors ${
                    view === "all-epics"
                      ? "bg-indigo-50 text-indigo-700 font-medium"
                      : "text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  <span>エピックビュー</span>
                  <span className="text-xs text-gray-400">{epics.length}</span>
                </button>
                <div className="space-y-0.5">
                  {epics.map((epic) => (
                    <button
                      key={epic.id}
                      onClick={() => setFilterEpicId(filterEpicId === epic.id ? null : epic.id)}
                      className={`w-full text-left flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                        filterEpicId === epic.id
                          ? "bg-indigo-50 text-indigo-700"
                          : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: epic.color }} />
                      <span className="flex-1 truncate text-sm font-medium">{epic.title}</span>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {tasks.filter((t) => t.epicId === epic.id && t.parentId === null).length}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* スプリント（ナビゲーションのみ・管理はタスクリストビューから） */}
              <div className="p-3">
                <div className="flex items-center justify-between px-1 mb-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">スプリント</p>
                </div>
                <button
                  onClick={() => setView("all-sprints")}
                  className={`w-full text-left flex items-center justify-between px-2 py-1.5 mb-1 rounded-lg text-sm transition-colors ${
                    view === "all-sprints"
                      ? "bg-indigo-50 text-indigo-700 font-medium"
                      : "text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  <span>スプリントビュー</span>
                  <span className="text-xs text-gray-400">{sprints.length}</span>
                </button>
              </div>
            </div>
          </aside>

          {/* メインコンテンツ */}
          <div className={`flex-1 flex flex-col min-w-0 ${!isTaskView(view) && !isSearchView(view) && displayMode === "swimlane" ? "overflow-hidden" : "overflow-y-auto"}`}>
            {/* ヘッダー */}
            {!isTaskView(view) && !isSearchView(view) && (
            <div className="flex-shrink-0 px-4 pt-4 pb-3 flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold text-gray-700">{viewTitle}</h2>
              {filterProjectId !== null && (() => {
                const fp = projects.find((p) => p.id === filterProjectId);
                return fp ? (
                  <button
                    onClick={() => setFilterProjectId(null)}
                    className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium transition-colors hover:bg-gray-100"
                    style={{ borderColor: fp.color, color: fp.color }}
                    title="プロジェクトフィルターを解除"
                  >
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: fp.color }} />
                    {fp.name}
                    <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M2 2l6 6M8 2l-6 6" />
                    </svg>
                  </button>
                ) : null;
              })()}
              {filterEpicId !== null && (() => {
                const fe = epics.find((e) => e.id === filterEpicId);
                return fe ? (
                  <button
                    onClick={() => setFilterEpicId(null)}
                    className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium transition-colors hover:bg-gray-100"
                    style={{ borderColor: fe.color, color: fe.color }}
                    title="エピックフィルターを解除"
                  >
                    <span className="w-1.5 h-1.5 rounded-sm flex-shrink-0" style={{ backgroundColor: fe.color }} />
                    {fe.title}
                    <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M2 2l6 6M8 2l-6 6" />
                    </svg>
                  </button>
                ) : null;
              })()}
              <div className="ml-auto flex bg-gray-100 rounded-lg p-0.5 flex-shrink-0">
                <button
                  onClick={() => setDisplayMode("list")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    displayMode === "list" ? "bg-white shadow text-gray-800" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <svg viewBox="0 0 14 12" className="w-3.5 h-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <line x1="4" y1="2" x2="13" y2="2" /><line x1="4" y1="6" x2="13" y2="6" /><line x1="4" y1="10" x2="13" y2="10" />
                    <circle cx="1.5" cy="2" r="1" fill="currentColor" stroke="none" /><circle cx="1.5" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="1.5" cy="10" r="1" fill="currentColor" stroke="none" />
                  </svg>
                  リスト
                </button>
                <button
                  onClick={() => setDisplayMode("swimlane")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    displayMode === "swimlane" ? "bg-white shadow text-gray-800" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <svg viewBox="0 0 14 12" className="w-3.5 h-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <rect x="0.75" y="0.75" width="3.5" height="10.5" rx="0.75" /><rect x="5.25" y="0.75" width="3.5" height="10.5" rx="0.75" /><rect x="9.75" y="0.75" width="3.5" height="10.5" rx="0.75" />
                  </svg>
                  スイムレーン
                </button>
              </div>
            </div>
            )}

            {!isTaskView(view) && !isSearchView(view) && (<>
            {/* フィルター（リストのみ） */}

            {/* リストビュー（スプリント管理） */}
            {displayMode === "list" && view === "all-sprints" && (
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-gray-400">{sprints.length} スプリント</p>
                  <button
                    onClick={() => setShowSprintFormMain((v) => !v)}
                    className="text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                  >
                    {showSprintFormMain ? "キャンセル" : "+ スプリントを追加"}
                  </button>
                </div>

                {showSprintFormMain && (
                  <form
                    onSubmit={async (e) => {
                      await handleSprintSubmit(e);
                      setShowSprintFormMain(false);
                    }}
                    className="mb-4 p-4 bg-white rounded-xl border border-gray-200 space-y-3"
                  >
                    <p className="text-sm font-semibold text-gray-700">新しいスプリント</p>
                    <input
                      type="text"
                      value={sprintForm.name}
                      onChange={(e) => setSprintForm({ ...sprintForm, name: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="スプリント名 *"
                      autoFocus
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">開始日</label>
                        <input type="date" value={sprintForm.startDate} onChange={(e) => setSprintForm({ ...sprintForm, startDate: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">終了日</label>
                        <input type="date" value={sprintForm.endDate} onChange={(e) => setSprintForm({ ...sprintForm, endDate: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                    </div>
                    <select value={sprintForm.status} onChange={(e) => setSprintForm({ ...sprintForm, status: e.target.value as SprintStatus })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      <option value="planning">計画中</option>
                      <option value="active">アクティブ</option>
                      <option value="completed">完了</option>
                    </select>
                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={() => { setShowSprintFormMain(false); setSprintForm(EMPTY_SPRINT_FORM); }} className="flex-1 border border-gray-300 text-gray-600 rounded-lg px-4 py-2 text-sm hover:bg-gray-50">キャンセル</button>
                      <button type="submit" className="flex-1 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700">追加</button>
                    </div>
                  </form>
                )}

                {sprints.filter((s) => s.status !== "completed").length === 0 ? (
                  <div className="text-center py-16 text-gray-400">スプリントがありません</div>
                ) : (
                  <SortableContext items={sprints.filter((s) => s.status !== "completed").map((s) => s.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-3">
                      {(() => {
                        const activeSprints = sprints.filter((s) => s.status !== "completed");
                        const overTaskId = typeof activeOverId === "string" && activeOverId.startsWith("task-")
                          ? parseInt(activeOverId.replace("task-", ""))
                          : null;
                        const overTaskSprintId = overTaskId ? tasks.find((t) => t.id === overTaskId)?.sprintId : null;
                        return activeSprints.map((sprint) => {
                        const sprintTasks = filtered.filter((t) => t.sprintId === sprint.id);
                        return (
                          <SortableSprintSection
                            key={sprint.id}
                            sprint={sprint}
                            sprintTasks={sprintTasks}
                            selectedTaskId={selectedTaskId}
                            projects={projects}
                            sprints={sprints}
                            epics={epics}
                            allTasks={tasks}
                            isTaskOver={isTaskDragging && overTaskSprintId === sprint.id}
                            onSelectTask={selectTask}
                            onToggleDone={toggleDone}
                            onChangeSprint={handleChangeSprint}
                            onShowOnly={showTaskOnly}
                            onNavigate={() => {}}
                            onEdit={() => {
                              setEditingSprint(sprint);
                              setEditSprintForm({
                                name: sprint.name,
                                startDate: sprint.startDate ? sprint.startDate.slice(0, 10) : "",
                                endDate: sprint.endDate ? sprint.endDate.slice(0, 10) : "",
                                status: sprint.status as SprintStatus,
                              });
                            }}
                            onDelete={() => deleteSprint(sprint)}
                            onComplete={() => openCompleteSprintModal(sprint)}
                          />
                        );
                        });
                      })()}
                    </div>
                  </SortableContext>
                )}

                {/* バックログ */}
                {(() => {
                  const backlogTasks = tasks.filter((t) =>
                    t.sprintId === null &&
                    t.parentId === null &&
                    (filterProjectId === null || t.projectId === filterProjectId) &&
                    (filterEpicId === null || t.epicId === filterEpicId)
                  );
                  const isBacklogOver = isTaskDragging && activeOverId === "backlog";
                  return (
                    <MainBacklogDropZone isHighlighted={isBacklogOver}>
                      <button
                        onClick={() => {}}
                        className="w-full flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/60 text-left"
                      >
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-gray-400 flex-shrink-0">
                          <rect x="1" y="1" width="14" height="14" rx="2" />
                          <path d="M4 5h8M4 8h6M4 11h4" />
                        </svg>
                        <h3 className="text-sm font-semibold text-gray-700">バックログ</h3>
                        <span className="text-xs text-gray-400 ml-auto">{backlogTasks.length} 件</span>
                      </button>
                      {backlogTasks.length === 0 ? (
                        <p className="text-sm text-gray-400 py-6 text-center text-gray-400">
                          {isBacklogOver ? "ここにドロップしてバックログへ移動" : "タスクなし"}
                        </p>
                      ) : (
                        <div className="p-2">
                          <SortableContext items={backlogTasks.map((t) => `task-${t.id}`)} strategy={verticalListSortingStrategy}>
                            <ul className="space-y-1.5">
                              {backlogTasks.map((task) => (
                                <DraggableTaskCard
                                  key={task.id}
                                  task={task}
                                  isSelected={selectedTaskId === task.id}
                                  onSelect={() => selectTask(task)}
                                  onToggleDone={(e) => toggleDone(task, e)}
                                  projects={projects}
                                  sprints={sprints}
                                  epics={epics}
                                  onChangeSprint={handleChangeSprint}
                                  allTasks={tasks}
                                  onShowOnly={showTaskOnly}
                                />
                              ))}
                            </ul>
                          </SortableContext>
                        </div>
                      )}
                    </MainBacklogDropZone>
                  );
                })()}
              </div>
            )}


            {/* リストビュー（エピック管理） */}
            {displayMode === "list" && view === "all-epics" && (
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-gray-400">{epics.length} エピック</p>
                  <button
                    onClick={() => setShowEpicForm((v) => !v)}
                    className="text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                  >
                    {showEpicForm ? "キャンセル" : "+ エピックを追加"}
                  </button>
                </div>

                {showEpicForm && (
                  <form onSubmit={handleEpicSubmit} className="mb-4 p-4 bg-white rounded-xl border border-gray-200 space-y-3">
                    <p className="text-sm font-semibold text-gray-700">新しいエピック</p>
                    <input
                      type="text"
                      value={epicForm.title}
                      onChange={(e) => setEpicForm({ ...epicForm, title: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="エピック名 *"
                      autoFocus
                    />
                    <select
                      value={epicForm.projectId ?? ""}
                      onChange={(e) => setEpicForm({ ...epicForm, projectId: e.target.value ? parseInt(e.target.value) : null })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">プロジェクトなし</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <div className="flex gap-1.5 flex-wrap">
                      {EPIC_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setEpicForm({ ...epicForm, color })}
                          className={`w-5 h-5 rounded-full flex-shrink-0 transition-transform ${
                            epicForm.color === color ? "scale-110 ring-2 ring-offset-1 ring-gray-400" : ""
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={() => { setShowEpicForm(false); setEpicForm(EMPTY_EPIC_FORM); }} className="flex-1 border border-gray-300 text-gray-600 rounded-lg px-4 py-2 text-sm hover:bg-gray-50">キャンセル</button>
                      <button type="submit" className="flex-1 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700">追加</button>
                    </div>
                  </form>
                )}

                {(() => {
                  const noEpicTasks = filtered.filter((t) => t.epicId === null);
                  const overTaskIdForEpic = typeof activeOverId === "string" && activeOverId.startsWith("task-")
                    ? parseInt(activeOverId.replace("task-", ""))
                    : null;
                  const overTaskEpicId = overTaskIdForEpic ? tasks.find((t) => t.id === overTaskIdForEpic)?.epicId : undefined;
                  return (
                    <div className="space-y-3">
                      {epics.map((epic) => {
                        const epicTasks = filtered.filter((t) => t.epicId === epic.id);
                        const epicProject = epic.projectId ? projects.find((p) => p.id === epic.projectId) : null;
                        const isEpicOver = isTaskDragging && (activeOverId === `epic-${epic.id}` || overTaskEpicId === epic.id);
                        return (
                          <EpicDropZone key={epic.id} epicId={epic.id}>
                          <div className={`bg-white rounded-xl overflow-hidden transition-all ${isEpicOver ? "border-2 border-dashed border-indigo-400" : "border border-gray-200"}`}>
                            <div
                              className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50/60 transition-colors"
                              onClick={() => { setFilterEpicId(filterEpicId === epic.id ? null : epic.id); setView("all-sprints"); }}
                            >
                              <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: epic.color }} />
                              <h3 className="text-sm font-semibold text-gray-700 flex-1 truncate">{epic.title}</h3>
                              {epicProject && (
                                <span className="flex items-center gap-1 flex-shrink-0">
                                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: epicProject.color }} />
                                  <span className="text-xs text-gray-400 truncate max-w-[80px]">{epicProject.name}</span>
                                </span>
                              )}
                              <span className="text-xs text-gray-400 ml-auto flex-shrink-0">{epicTasks.length} 件</span>
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingEpic(epic); setEditEpicForm({ title: epic.title, description: epic.description ?? "", color: epic.color, projectId: epic.projectId }); }}
                                className="p-1 text-gray-400 hover:text-indigo-600 rounded transition-colors flex-shrink-0"
                                title="編集"
                              >
                                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                </svg>
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteEpic(epic); }}
                                className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors flex-shrink-0"
                                title="削除"
                              >
                                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                              </button>
                            </div>
                            {epicTasks.length === 0 ? (
                              <p className="text-sm text-gray-400 py-4 text-center">ストーリーなし</p>
                            ) : (
                              <div className="p-2">
                                <SortableContext items={epicTasks.map((t) => `task-${t.id}`)} strategy={verticalListSortingStrategy}>
                                  <ul className="space-y-1.5">
                                    {epicTasks.map((task) => (
                                      <DraggableTaskCard
                                        key={task.id}
                                        task={task}
                                        isSelected={selectedTaskId === task.id}
                                        onSelect={() => selectTask(task)}
                                        onToggleDone={(e) => toggleDone(task, e)}
                                        projects={projects}
                                        sprints={sprints}
                                        epics={epics}
                                        onChangeSprint={handleChangeSprint}
                                        allTasks={tasks}
                                        onShowOnly={showTaskOnly}
                                      />
                                    ))}
                                  </ul>
                                </SortableContext>
                              </div>
                            )}
                          </div>
                          </EpicDropZone>
                        );
                      })}

                      {/* エピックなし */}
                      {(() => { const isNoEpicOver = isTaskDragging && (activeOverId === "epic-null" || overTaskEpicId === null); return (
                      <EpicDropZone epicId={null}>
                      <div className={`bg-white rounded-xl overflow-hidden transition-all ${isNoEpicOver ? "border-2 border-dashed border-indigo-400" : "border border-dashed border-gray-300"}`}>
                        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/40">
                          <span className="w-3 h-3 rounded-sm flex-shrink-0 bg-gray-300" />
                          <h3 className="text-sm font-semibold text-gray-400 flex-1">エピックなし</h3>
                          <span className="text-xs text-gray-400 ml-auto flex-shrink-0">{noEpicTasks.length} 件</span>
                        </div>
                        {noEpicTasks.length === 0 ? (
                          <p className="text-sm text-gray-300 py-4 text-center">すべてのストーリーはエピックに属しています</p>
                        ) : (
                          <div className="p-2">
                            <SortableContext items={noEpicTasks.map((t) => `task-${t.id}`)} strategy={verticalListSortingStrategy}>
                              <ul className="space-y-1.5">
                                {noEpicTasks.map((task) => (
                                  <DraggableTaskCard
                                    key={task.id}
                                    task={task}
                                    isSelected={selectedTaskId === task.id}
                                    onSelect={() => selectTask(task)}
                                    onToggleDone={(e) => toggleDone(task, e)}
                                    projects={projects}
                                    sprints={sprints}
                                    epics={epics}
                                    onChangeSprint={handleChangeSprint}
                                    allTasks={tasks}
                                    onShowOnly={showTaskOnly}
                                  />
                                ))}
                              </ul>
                            </SortableContext>
                          </div>
                        )}
                      </div>
                      </EpicDropZone>
                      ); })()}
                    </div>
                  );
                })()}
              </div>
            )}


            {/* スイムレーンビュー */}
            {displayMode === "swimlane" && (
              <div className="flex-1 overflow-x-auto overflow-y-auto px-4 pb-4">
                <div className="flex gap-3 h-full min-h-0" style={{ minWidth: "max-content" }}>
                  {(["open", "in_progress", "resolved", "on_hold", "closed"] as TaskStatus[]).map((status) => (
                    <div key={status} className="w-52 flex-shrink-0 flex flex-col">
                      <SwimlaneColumn
                        status={status}
                        tasks={viewedTasks.filter((t) => t.status === status)}
                        isOver={isTaskDragging && activeOverId === `col-${status}`}
                        onSelectTask={selectTask}
                        selectedTaskId={selectedTaskId}
                        projects={projects}
                        allTasks={tasks}
                        onShowOnly={showTaskOnly}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            </>)}

            {/* 検索結果 */}
            {isSearchView(view) && (
              <div className="flex-1 overflow-y-auto px-4 py-4">
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="font-semibold text-gray-700">「{view.query}」の検索結果</h2>
                  {!isSearching && (
                    <span className="text-sm text-gray-400">{searchResults.length} 件</span>
                  )}
                  <button
                    onClick={clearSearch}
                    className="ml-auto text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors"
                  >
                    <svg viewBox="0 0 10 10" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M2 2l6 6M8 2l-6 6" />
                    </svg>
                    検索をクリア
                  </button>
                </div>
                {isSearching ? (
                  <p className="text-sm text-gray-400 text-center py-12">検索中...</p>
                ) : searchResults.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-12">該当するタスクが見つかりませんでした</p>
                ) : (
                  <ul className="space-y-1.5">
                    {searchResults.map((task) => {
                      const project = task.projectId ? projects.find((p) => p.id === task.projectId) : null;
                      const epic = task.epicId ? epics.find((e) => e.id === task.epicId) : null;
                      const sprint = task.sprintId ? sprints.find((s) => s.id === task.sprintId) : null;
                      const taskKey = getTaskKey(task, projects);
                      return (
                        <li
                          key={task.id}
                          onClick={() => selectTask(task)}
                          className={`bg-white rounded-lg border px-4 py-3 cursor-pointer transition-all flex items-center gap-3 ${
                            selectedTaskId === task.id
                              ? "border-indigo-400 ring-1 ring-indigo-400"
                              : "border-gray-200 hover:border-indigo-200"
                          }`}
                        >
                          <div className="w-20 flex-shrink-0">
                            {taskKey && (
                              <span
                                onClick={(e) => { e.stopPropagation(); showTaskOnly(task); }}
                                className="text-xs font-mono text-gray-400 bg-gray-100 hover:bg-indigo-100 hover:text-indigo-600 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                                title="この課題のみを表示"
                              >
                                {taskKey}
                              </span>
                            )}
                          </div>
                          <span className={`text-sm font-medium flex-1 min-w-0 truncate ${task.done ? "line-through text-gray-400" : "text-gray-800"}`}>
                            {task.title}
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${TASK_STATUS_COLOR[task.status as TaskStatus]}`}>
                            {TASK_STATUS_LABEL[task.status as TaskStatus]}
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${PRIORITY_COLOR[task.priority as Priority]}`}>
                            {PRIORITY_LABEL[task.priority as Priority]}
                          </span>
                          {epic && (
                            <span className="flex items-center gap-1 flex-shrink-0">
                              <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: epic.color }} />
                              <span className="text-xs text-gray-500 truncate max-w-[56px]">{epic.title}</span>
                            </span>
                          )}
                          {project && (
                            <span className="flex items-center gap-1 flex-shrink-0">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
                              <span className="text-xs text-gray-400 truncate max-w-[64px]">{project.name}</span>
                            </span>
                          )}
                          {sprint ? (
                            <span className="text-xs text-gray-400 flex-shrink-0 truncate max-w-[80px]">{sprint.name}</span>
                          ) : (
                            <span className="text-xs text-gray-300 flex-shrink-0">バックログ</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {/* タスク詳細画面 */}
            {isTaskView(view) && selectedTask && (
              <div
                className="flex-1 overflow-y-auto relative"
                onDragOver={(e) => { e.preventDefault(); setDetailDragOver(true); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDetailDragOver(false); }}
                onDrop={(e) => { setDetailDragOver(false); handleFileDrop(e, selectedTask.id); }}
              >
                {detailDragOver && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-indigo-50/90 border-2 border-dashed border-indigo-400 pointer-events-none">
                    <svg viewBox="0 0 24 24" className="w-10 h-10 text-indigo-400" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 16V4M8 8l4-4 4 4" /><rect x="3" y="16" width="18" height="5" rx="1.5" />
                    </svg>
                    <p className="text-base font-medium text-indigo-600">ドロップしてファイルを添付</p>
                  </div>
                )}
                <div className="max-w-4xl mx-auto px-8 py-6">
                  {/* パンくず */}
                  <div className="flex items-center gap-2 mb-6 text-sm text-gray-500">
                    <button
                      onClick={() => setView(previousView)}
                      className="flex items-center gap-1.5 hover:text-gray-700 transition-colors"
                    >
                      <svg viewBox="0 0 12 12" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M7.5 2L3 6l4.5 4" />
                      </svg>
                      戻る
                    </button>
                    {selectedTask.parentId && (() => {
                      const pt = tasks.find((t) => t.id === selectedTask.parentId);
                      if (!pt) return null;
                      return (
                        <>
                          <span className="text-gray-300">/</span>
                          <button
                            onClick={() => showTaskOnly(pt)}
                            className="hover:text-gray-700 transition-colors truncate max-w-[200px]"
                          >
                            {getTaskKey(pt, projects) ?? pt.title}
                          </button>
                          <span className="text-gray-300">/</span>
                        </>
                      );
                    })()}
                    <span className="font-mono text-gray-400">
                      {getTaskKey(selectedTask, projects) ?? `#${selectedTask.id}`}
                    </span>
                    {selectedTask.parentId && (
                      <button
                        onClick={unlinkFromParent}
                        className="ml-2 text-xs text-gray-400 hover:text-red-500 transition-colors"
                      >
                        関連解除
                      </button>
                    )}
                  </div>

                  {/* メイン：左コンテンツ + 右メタデータ */}
                  <div className="flex gap-8 items-start">
                    {/* 左：コンテンツ全体 */}
                    <div className="flex-1 min-w-0 space-y-4">
                      <input
                        type="text"
                        value={taskForm.title}
                        onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                        onBlur={() => {
                          const trimmed = taskForm.title.trim();
                          if (trimmed && trimmed !== selectedTask.title) saveTaskField(selectedTask.id, { title: trimmed });
                          else if (!trimmed) setTaskForm({ ...taskForm, title: selectedTask.title });
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                        className="w-full text-2xl font-bold text-gray-900 border-0 border-b-2 border-gray-200 focus:border-indigo-500 focus:outline-none pb-2 bg-transparent"
                        placeholder="タスクのタイトル"
                      />
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">説明</label>
                        <DescriptionEditor
                          value={taskForm.description}
                          onChange={(v) => setTaskForm({ ...taskForm, description: v })}
                          onBlur={() => {
                            const trimmed = taskForm.description.trim();
                            const original = selectedTask.description ?? "";
                            if (trimmed !== original) saveTaskField(selectedTask.id, { description: trimmed || null });
                          }}
                          onPaste={(e) => handleCommentImagePaste(e, selectedTask.id, () => taskForm.description, (v) => setTaskForm({ ...taskForm, description: v }))}
                          rows={8}
                          placeholder="詳細・メモ（任意）"
                        />
                      </div>
                  {/* サブタスク */}
                  {(() => {
                    const subtasks = tasks.filter((t) => t.parentId === selectedTask.id);
                    return (
                      <div className="border-t border-gray-100 pt-4">
                        <div className="flex items-center gap-2 mb-4">
                          <h3 className="text-sm font-semibold text-gray-700">サブタスク</h3>
                          {subtasks.length > 0 && (
                            <span className="text-xs text-gray-400">{subtasks.filter((s) => s.done).length}/{subtasks.length}</span>
                          )}
                        </div>
                        {subtasks.length === 0 && (
                          <p className="text-xs text-gray-400 mb-3">サブタスクはまだありません</p>
                        )}
                        <ul className="space-y-2 mb-3">
                          {subtasks.map((st) => (
                            <li
                              key={st.id}
                              onClick={() => showTaskOnly(st)}
                              className="flex items-center gap-2.5 p-3 rounded-xl border border-gray-200 hover:border-indigo-200 cursor-pointer transition-colors bg-white"
                            >
                              <button
                                onClick={(e) => toggleDone(st, e)}
                                className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-colors cursor-pointer ${
                                  st.done ? "bg-indigo-600 border-indigo-600" : "border-gray-300 hover:border-indigo-400"
                                }`}
                              >
                                {st.done && (
                                  <svg viewBox="0 0 12 12" fill="none" className="w-full h-full p-0.5">
                                    <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                              </button>
                              <span className={`text-sm flex-1 min-w-0 truncate ${st.done ? "line-through text-gray-400" : "text-gray-700"}`}>
                                {getTaskKey(st, projects) && (
                                  <span className="font-mono text-xs text-gray-400 mr-2">{getTaskKey(st, projects)}</span>
                                )}
                                {st.title}
                              </span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${TASK_STATUS_COLOR[st.status as TaskStatus]}`}>
                                {TASK_STATUS_LABEL[st.status as TaskStatus]}
                              </span>
                            </li>
                          ))}
                        </ul>
                        <form onSubmit={handleAddSubtask} className="flex gap-2">
                          <input
                            type="text"
                            value={newSubtaskTitle}
                            onChange={(e) => setNewSubtaskTitle(e.target.value)}
                            placeholder="サブタスクを追加..."
                            className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                          />
                          <button
                            type="submit"
                            className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors flex-shrink-0"
                          >
                            追加
                          </button>
                        </form>
                      </div>
                    );
                  })()}

                  {/* 添付ファイル */}
                  <div className="border-t border-gray-100 pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-700">
                        添付ファイル{attachments.length > 0 && <span className="ml-1 text-gray-400 font-normal">({attachments.length})</span>}
                      </h3>
                      <label className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-300 cursor-pointer transition-colors ${isUploading ? "text-gray-300 pointer-events-none" : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"}`}>
                        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M8 2v8M5 5l3-3 3 3" /><rect x="2" y="11" width="12" height="3" rx="1" />
                        </svg>
                        {isUploading ? "アップロード中..." : "ファイルを添付"}
                        <input
                          type="file"
                          className="hidden"
                          disabled={isUploading}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f && selectedTask) { handleUpload(selectedTask.id, f); e.target.value = ""; } }}
                        />
                      </label>
                    </div>
                    {attachments.length > 0 && (
                      <ul className="space-y-1.5">
                        {attachments.map((att) => {
                          const isImage = att.mimetype.startsWith("image/");
                          const sizeLabel = att.size < 1024 * 1024
                            ? `${Math.round(att.size / 1024)} KB`
                            : `${(att.size / 1024 / 1024).toFixed(1)} MB`;
                          return (
                            <li key={att.id} className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 bg-white hover:border-indigo-200 transition-colors group">
                              {isImage ? (
                                <img src={att.filepath} alt={att.filename} className="w-8 h-8 rounded object-cover flex-shrink-0 border border-gray-100" />
                              ) : (
                                <div className="w-8 h-8 rounded flex items-center justify-center bg-gray-100 flex-shrink-0">
                                  <svg viewBox="0 0 16 16" className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M9 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6L9 2z" /><path d="M9 2v4h4" />
                                  </svg>
                                </div>
                              )}
                              <a href={att.filepath} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 hover:text-indigo-600 transition-colors" title={att.filename}>
                                <p className="text-sm text-gray-800 truncate">{att.filename}</p>
                                <p className="text-xs text-gray-400">{sizeLabel}</p>
                              </a>
                              <button
                                onClick={() => selectedTask && handleDeleteAttachment(att.id, selectedTask.id)}
                                className="p-1 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                                title="削除"
                              >
                                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M2 4h12M6 4V2h4v2M5 4v9a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V4" />
                                </svg>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  {/* コメント / アクティビティ */}
                  <div className="border-t border-gray-100 pt-4">
                    <div className="flex border-b border-gray-200 mb-4">
                      <button
                        onClick={() => setCommentTab("comments")}
                        className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${commentTab === "comments" ? "border-indigo-500 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                      >
                        コメント{comments.length > 0 && ` (${comments.length})`}
                      </button>
                      <button
                        onClick={() => setCommentTab("activity")}
                        className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${commentTab === "activity" ? "border-indigo-500 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                      >
                        アクティビティ{activities.length > 0 && ` (${activities.length})`}
                      </button>
                    </div>

                    {commentTab === "activity" && (
                      <div className="space-y-2">
                        {activities.length === 0 && <p className="text-xs text-gray-400">変更履歴はまだありません</p>}
                        {activities.map((a) => (
                          <div key={a.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="text-xs font-medium text-gray-700">{a.field}</span>
                              {(a.oldValue || a.newValue) && <span className="text-xs text-gray-400 mx-1">:</span>}
                              {a.oldValue && <span className="text-xs text-gray-500 line-through mr-1">{a.oldValue}</span>}
                              {a.oldValue && a.newValue && <span className="text-xs text-gray-400 mr-1">→</span>}
                              {a.newValue && <span className="text-xs text-gray-700 font-medium">{a.newValue}</span>}
                            </div>
                            <span className="text-xs text-gray-400 flex-shrink-0">{formatRelativeTime(a.createdAt)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {commentTab === "comments" && <>
                    {comments.length === 0 && (
                      <p className="text-xs text-gray-400 mb-3">コメントはまだありません</p>
                    )}
                    <div className="space-y-3 mb-4">
                      {comments.map((comment) => {
                        const isEdited = comment.updatedAt !== comment.createdAt;
                        const isEditing = editingCommentId === comment.id;
                        return (
                          <div key={comment.id} className="group bg-white rounded-xl border border-gray-200 p-4">
                            {isEditing ? (
                              <div className="space-y-2">
                                <textarea
                                  value={editingCommentBody}
                                  onChange={(e) => setEditingCommentBody(e.target.value)}
                                  onPaste={(e) => selectedTask && handleCommentImagePaste(e, selectedTask.id, () => editingCommentBody, setEditingCommentBody)}
                                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                                  rows={3}
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSaveEdit(comment.id);
                                    if (e.key === "Escape") { setEditingCommentId(null); setEditingCommentBody(""); }
                                  }}
                                />
                                <div className="flex gap-1.5">
                                  <button onClick={() => handleSaveEdit(comment.id)} className="flex-1 bg-indigo-600 text-white rounded px-2 py-1 text-xs font-medium hover:bg-indigo-700">保存</button>
                                  <button onClick={() => { setEditingCommentId(null); setEditingCommentBody(""); }} className="flex-1 border border-gray-200 text-gray-600 rounded px-2 py-1 text-xs hover:bg-gray-50">キャンセル</button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <MarkdownPreview body={comment.body} />
                                <div className="mt-2 flex items-center justify-between gap-2">
                                  <span className="text-xs text-gray-400">
                                    {formatDateTime(comment.createdAt)}
                                    {isEdited && <span className="ml-1">(編集済み)</span>}
                                  </span>
                                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => { setEditingCommentId(comment.id); setEditingCommentBody(comment.body); }} className="text-xs text-gray-400 hover:text-indigo-600">編集</button>
                                    <button onClick={() => handleDeleteComment(comment.id)} className="text-xs text-gray-400 hover:text-red-500">削除</button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <form onSubmit={handleAddComment} className="space-y-2">
                      <textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        onPaste={(e) => selectedTask && handleCommentImagePaste(e, selectedTask.id, () => newComment, setNewComment)}
                        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none bg-white"
                        placeholder="コメントを追加... (画像はCtrl+Vで貼り付け可)"
                        rows={3}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAddComment(e as unknown as React.FormEvent);
                        }}
                      />
                      <button
                        type="submit"
                        disabled={!newComment.trim()}
                        className="w-full bg-indigo-600 text-white rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        投稿
                      </button>
                    </form>
                    </>}
                  </div>
                    </div>

                    {/* 右：メタデータサイドバー */}
                    <div className="w-56 flex-shrink-0 sticky top-6 self-start space-y-4 bg-white rounded-2xl border border-gray-200 p-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">ステータス</label>
                        <select
                          value={taskForm.status}
                          onChange={(e) => { const v = e.target.value as TaskStatus; setTaskForm({ ...taskForm, status: v }); saveTaskField(selectedTask.id, { status: v }); }}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        >
                          <option value="open">オープン</option>
                          <option value="in_progress">着手</option>
                          <option value="resolved">解決済み</option>
                          <option value="on_hold">保留</option>
                          <option value="closed">クローズ</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">優先度</label>
                        <select
                          value={taskForm.priority}
                          onChange={(e) => { const v = e.target.value as Priority; setTaskForm({ ...taskForm, priority: v }); saveTaskField(selectedTask.id, { priority: v }); }}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        >
                          <option value="low">低</option>
                          <option value="medium">中</option>
                          <option value="high">高</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">プロジェクト</label>
                        <select
                          value={taskForm.projectId ?? ""}
                          onChange={(e) => { const v = e.target.value ? parseInt(e.target.value) : null; setTaskForm({ ...taskForm, projectId: v }); saveTaskField(selectedTask.id, { projectId: v }); }}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        >
                          <option value="">なし</option>
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">スプリント</label>
                        <select
                          value={taskForm.sprintId ?? "backlog"}
                          onChange={(e) => { const v = e.target.value === "backlog" ? null : parseInt(e.target.value); setTaskForm({ ...taskForm, sprintId: v }); saveTaskField(selectedTask.id, { sprintId: v }); }}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        >
                          <option value="backlog">バックログ</option>
                          {sprints.filter((s) => s.status !== "completed").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">エピック</label>
                        <select
                          value={taskForm.epicId ?? ""}
                          onChange={(e) => { const v = e.target.value ? parseInt(e.target.value) : null; setTaskForm({ ...taskForm, epicId: v }); saveTaskField(selectedTask.id, { epicId: v }); }}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        >
                          <option value="">なし</option>
                          {epics.map((ep) => <option key={ep.id} value={ep.id}>{ep.title}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">期限</label>
                        <input
                          type="date"
                          value={taskForm.dueDate}
                          onChange={(e) => { const v = e.target.value; setTaskForm({ ...taskForm, dueDate: v }); saveTaskField(selectedTask.id, { dueDate: v || null }); }}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        />
                      </div>
                      <div className="pt-3 border-t border-gray-100">
                        <button
                          type="button"
                          onClick={deleteTask}
                          className="w-full text-sm text-red-500 hover:text-red-700 py-1.5 transition-colors"
                        >
                          このタスクを削除
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* タスク詳細ビュー */}
          {!isTaskView(view) && (
          <div
            className="w-80 border-l border-gray-200 bg-white overflow-y-auto flex-shrink-0 relative"
            onDragOver={(e) => { e.preventDefault(); if (panelMode === "edit" && selectedTask) setPanelDragOver(true); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setPanelDragOver(false); }}
            onDrop={(e) => { setPanelDragOver(false); if (selectedTask) handleFileDrop(e, selectedTask.id); }}
          >
            {panelDragOver && selectedTask && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-indigo-50/90 border-2 border-dashed border-indigo-400 pointer-events-none">
                <svg viewBox="0 0 24 24" className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 16V4M8 8l4-4 4 4" /><rect x="3" y="16" width="18" height="5" rx="1.5" />
                </svg>
                <p className="text-sm font-medium text-indigo-600">ドロップしてファイルを添付</p>
              </div>
            )}
            {panelMode === "empty" && (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                タスクを選択してください
              </div>
            )}

            {(panelMode === "edit" || panelMode === "create") && (
              <div className="p-6">
                {panelMode === "edit" && selectedTask?.parentId && (() => {
                  const parentTask = tasks.find((t) => t.id === selectedTask.parentId);
                  if (!parentTask) return null;
                  return (
                    <div className="flex items-center gap-1.5 mb-3 text-xs">
                      <button
                        onClick={() => selectTask(parentTask)}
                        className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 hover:underline min-w-0"
                      >
                        <svg viewBox="0 0 12 12" className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M7.5 2L3 6l4.5 4" />
                        </svg>
                        <span className="truncate max-w-[160px]">{parentTask.title}</span>
                      </button>
                      <span className="text-gray-300">/</span>
                      <button
                        onClick={unlinkFromParent}
                        className="text-gray-400 hover:text-red-500 flex-shrink-0"
                        title="親タスクとの関連付けを解除"
                      >
                        関連解除
                      </button>
                    </div>
                  );
                })()}
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-lg font-bold text-gray-800">
                    {panelMode === "create" ? "タスクを追加" : "タスクを編集"}
                  </h2>
                  {panelMode === "edit" && selectedTask && (() => {
                    const key = getTaskKey(selectedTask, projects);
                    return key ? (
                      <span
                        onClick={() => showTaskOnly(selectedTask)}
                        className="text-sm font-mono text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded border border-indigo-100 cursor-pointer transition-colors"
                        title="この課題のみを表示"
                      >
                        {key}
                      </span>
                    ) : null;
                  })()}
                </div>
                <form onSubmit={handleTaskSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">タイトル {panelMode === "create" && <span className="text-red-500">*</span>}</label>
                    <input
                      type="text"
                      value={taskForm.title}
                      onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                      onBlur={() => {
                        if (panelMode === "edit" && selectedTask) {
                          const trimmed = taskForm.title.trim();
                          if (trimmed && trimmed !== selectedTask.title) saveTaskField(selectedTask.id, { title: trimmed });
                          else if (!trimmed) setTaskForm({ ...taskForm, title: selectedTask.title });
                        }
                      }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="タスクのタイトル"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">メモ</label>
                    {panelMode === "edit" && selectedTask ? (
                      <DescriptionEditor
                        value={taskForm.description}
                        onChange={(v) => setTaskForm({ ...taskForm, description: v })}
                        onBlur={() => {
                          const trimmed = taskForm.description.trim();
                          const original = selectedTask.description ?? "";
                          if (trimmed !== original) saveTaskField(selectedTask.id, { description: trimmed || null });
                        }}
                        onPaste={(e) => handleCommentImagePaste(e, selectedTask.id, () => taskForm.description, (v) => setTaskForm({ ...taskForm, description: v }))}
                        rows={4}
                        placeholder="詳細・メモ��任意）"
                      />
                    ) : (
                      <MarkdownEditor
                        value={taskForm.description}
                        onChange={(v) => setTaskForm({ ...taskForm, description: v })}
                        rows={4}
                        placeholder="詳細・メモ（任意）"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ステータス</label>
                    <select
                      value={taskForm.status}
                      onChange={(e) => {
                        const v = e.target.value as TaskStatus;
                        setTaskForm({ ...taskForm, status: v });
                        if (panelMode === "edit" && selectedTask) saveTaskField(selectedTask.id, { status: v });
                      }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="open">オープン</option>
                      <option value="in_progress">着手</option>
                      <option value="resolved">解決済み</option>
                      <option value="on_hold">保留</option>
                      <option value="closed">クローズ</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">プロジェクト</label>
                    <select
                      value={taskForm.projectId ?? ""}
                      onChange={(e) => {
                        const v = e.target.value ? parseInt(e.target.value) : null;
                        setTaskForm({ ...taskForm, projectId: v });
                        if (panelMode === "edit" && selectedTask) saveTaskField(selectedTask.id, { projectId: v });
                      }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">なし</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">スプリント</label>
                    <select
                      value={taskForm.sprintId ?? "backlog"}
                      onChange={(e) => {
                        const v = e.target.value === "backlog" ? null : parseInt(e.target.value);
                        setTaskForm({ ...taskForm, sprintId: v });
                        if (panelMode === "edit" && selectedTask) saveTaskField(selectedTask.id, { sprintId: v });
                      }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="backlog">バックログ</option>
                      {sprints.filter((s) => s.status !== "completed").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">エピック</label>
                    <select
                      value={taskForm.epicId ?? ""}
                      onChange={(e) => {
                        const v = e.target.value ? parseInt(e.target.value) : null;
                        setTaskForm({ ...taskForm, epicId: v });
                        if (panelMode === "edit" && selectedTask) saveTaskField(selectedTask.id, { epicId: v });
                      }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">なし</option>
                      {epics.map((ep) => <option key={ep.id} value={ep.id}>{ep.title}</option>)}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">優先度</label>
                      <select
                        value={taskForm.priority}
                        onChange={(e) => {
                          const v = e.target.value as Priority;
                          setTaskForm({ ...taskForm, priority: v });
                          if (panelMode === "edit" && selectedTask) saveTaskField(selectedTask.id, { priority: v });
                        }}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="low">低</option>
                        <option value="medium">中</option>
                        <option value="high">高</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">期限</label>
                      <input
                        type="date"
                        value={taskForm.dueDate}
                        onChange={(e) => {
                          const v = e.target.value;
                          setTaskForm({ ...taskForm, dueDate: v });
                          if (panelMode === "edit" && selectedTask) saveTaskField(selectedTask.id, { dueDate: v || null });
                        }}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  {panelMode === "create" && (
                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => { setSelectedTaskId(null); setPanelMode("empty"); }}
                        className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                      >
                        キャンセル
                      </button>
                      <button
                        type="submit"
                        className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                      >
                        追加
                      </button>
                    </div>
                  )}

                  {panelMode === "edit" && (
                    <div className="pt-2 border-t border-gray-100">
                      <button
                        type="button"
                        onClick={deleteTask}
                        className="w-full text-sm text-red-500 hover:text-red-700 py-1.5 transition-colors"
                      >
                        このタスクを削除
                      </button>
                    </div>
                  )}
                </form>

                {panelMode === "edit" && selectedTask && (() => {
                  const subtasks = tasks.filter((t) => t.parentId === selectedTask.id);
                  return (
                    <div className="mt-6 border-t border-gray-100 pt-5">
                      <div className="flex items-center gap-2 mb-3">
                        <h3 className="text-sm font-semibold text-gray-700">サブタスク</h3>
                        {subtasks.length > 0 && (
                          <span className="text-xs text-gray-400">
                            {subtasks.filter((s) => s.done).length}/{subtasks.length}
                          </span>
                        )}
                      </div>

                      {subtasks.length === 0 && (
                        <p className="text-xs text-gray-400 mb-3">サブタスクはまだありません</p>
                      )}

                      <ul className="space-y-1.5 mb-3">
                        {subtasks.map((st) => (
                          <li
                            key={st.id}
                            onClick={() => selectTask(st)}
                            className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 hover:border-indigo-200 cursor-pointer transition-colors"
                          >
                            <button
                              onClick={(e) => toggleDone(st, e)}
                              className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-colors cursor-pointer ${
                                st.done ? "bg-indigo-600 border-indigo-600" : "border-gray-300 hover:border-indigo-400"
                              }`}
                            >
                              {st.done && (
                                <svg viewBox="0 0 12 12" fill="none" className="w-full h-full p-0.5">
                                  <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </button>
                            <span className={`text-sm flex-1 min-w-0 truncate ${st.done ? "line-through text-gray-400" : "text-gray-700"}`}>
                              {st.title}
                            </span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${TASK_STATUS_COLOR[st.status as TaskStatus]}`}>
                              {TASK_STATUS_LABEL[st.status as TaskStatus]}
                            </span>
                          </li>
                        ))}
                      </ul>

                      <form onSubmit={handleAddSubtask} className="flex gap-1.5">
                        <input
                          type="text"
                          value={newSubtaskTitle}
                          onChange={(e) => setNewSubtaskTitle(e.target.value)}
                          placeholder="サブタスクを追加..."
                          className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <button
                          type="submit"
                          className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex-shrink-0"
                        >
                          追加
                        </button>
                      </form>
                    </div>
                  );
                })()}

                {panelMode === "edit" && selectedTask && (
                  <div className="mt-6 border-t border-gray-100 pt-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-700">
                        添付ファイル{attachments.length > 0 && <span className="ml-1 text-gray-400 font-normal">({attachments.length})</span>}
                      </h3>
                      <label className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-gray-300 cursor-pointer transition-colors ${isUploading ? "text-gray-300 pointer-events-none" : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"}`}>
                        <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M8 2v8M5 5l3-3 3 3" /><rect x="2" y="11" width="12" height="3" rx="1" />
                        </svg>
                        {isUploading ? "..." : "添付"}
                        <input
                          type="file"
                          className="hidden"
                          disabled={isUploading}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f && selectedTask) { handleUpload(selectedTask.id, f); e.target.value = ""; } }}
                        />
                      </label>
                    </div>
                    {attachments.length > 0 && (
                      <ul className="space-y-1.5 mb-3">
                        {attachments.map((att) => {
                          const isImage = att.mimetype.startsWith("image/");
                          const sizeLabel = att.size < 1024 * 1024
                            ? `${Math.round(att.size / 1024)} KB`
                            : `${(att.size / 1024 / 1024).toFixed(1)} MB`;
                          return (
                            <li key={att.id} className="flex items-center gap-2 p-1.5 rounded-lg border border-gray-200 bg-white hover:border-indigo-200 transition-colors group">
                              {isImage ? (
                                <img src={att.filepath} alt={att.filename} className="w-7 h-7 rounded object-cover flex-shrink-0 border border-gray-100" />
                              ) : (
                                <div className="w-7 h-7 rounded flex items-center justify-center bg-gray-100 flex-shrink-0">
                                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M9 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6L9 2z" /><path d="M9 2v4h4" />
                                  </svg>
                                </div>
                              )}
                              <a href={att.filepath} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 hover:text-indigo-600 transition-colors" title={att.filename}>
                                <p className="text-xs text-gray-800 truncate">{att.filename}</p>
                                <p className="text-xs text-gray-400">{sizeLabel}</p>
                              </a>
                              <button
                                onClick={() => handleDeleteAttachment(att.id, selectedTask.id)}
                                className="p-1 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                                title="削除"
                              >
                                <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M2 4h12M6 4V2h4v2M5 4v9a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V4" />
                                </svg>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}

                {panelMode === "edit" && (
                  <div className="mt-6 border-t border-gray-100 pt-5">
                    <div className="flex border-b border-gray-200 mb-3">
                      <button
                        onClick={() => setCommentTab("comments")}
                        className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${commentTab === "comments" ? "border-indigo-500 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                      >
                        コメント{comments.length > 0 && ` (${comments.length})`}
                      </button>
                      <button
                        onClick={() => setCommentTab("activity")}
                        className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${commentTab === "activity" ? "border-indigo-500 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                      >
                        アクティビティ{activities.length > 0 && ` (${activities.length})`}
                      </button>
                    </div>

                    {commentTab === "activity" && (
                      <div className="space-y-1.5">
                        {activities.length === 0 && <p className="text-xs text-gray-400">変更履歴はまだありません</p>}
                        {activities.map((a) => (
                          <div key={a.id} className="flex items-start gap-2 py-1.5 border-b border-gray-50 last:border-0">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="text-xs font-medium text-gray-700">{a.field}</span>
                              {(a.oldValue || a.newValue) && <span className="text-xs text-gray-400 ml-1 mr-0.5">:</span>}
                              {a.oldValue && <span className="text-xs text-gray-500 line-through mr-1">{a.oldValue}</span>}
                              {a.oldValue && a.newValue && <span className="text-xs text-gray-400 mr-0.5">→</span>}
                              {a.newValue && <span className="text-xs text-gray-700 ml-0.5">{a.newValue}</span>}
                              <div className="text-xs text-gray-400 mt-0.5">{formatRelativeTime(a.createdAt)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {commentTab === "comments" && <>
                    {comments.length === 0 && (
                      <p className="text-xs text-gray-400 mb-3">コメントはまだありません</p>
                    )}

                    <div className="space-y-3 mb-4">
                      {comments.map((comment) => {
                        const isEdited = comment.updatedAt !== comment.createdAt;
                        const isEditing = editingCommentId === comment.id;
                        return (
                          <div key={comment.id} className="group bg-gray-50 rounded-lg p-3">
                            {isEditing ? (
                              <div className="space-y-2">
                                <textarea
                                  value={editingCommentBody}
                                  onChange={(e) => setEditingCommentBody(e.target.value)}
                                  onPaste={(e) => selectedTask && handleCommentImagePaste(e, selectedTask.id, () => editingCommentBody, setEditingCommentBody)}
                                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                                  rows={3}
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSaveEdit(comment.id);
                                    if (e.key === "Escape") { setEditingCommentId(null); setEditingCommentBody(""); }
                                  }}
                                />
                                <div className="flex gap-1.5">
                                  <button
                                    onClick={() => handleSaveEdit(comment.id)}
                                    className="flex-1 bg-indigo-600 text-white rounded px-2 py-1 text-xs font-medium hover:bg-indigo-700"
                                  >
                                    保存
                                  </button>
                                  <button
                                    onClick={() => { setEditingCommentId(null); setEditingCommentBody(""); }}
                                    className="flex-1 border border-gray-300 text-gray-600 rounded px-2 py-1 text-xs hover:bg-gray-50"
                                  >
                                    キャンセル
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <MarkdownPreview body={comment.body} />
                                <div className="mt-1.5 flex items-center justify-between gap-2">
                                  <span className="text-xs text-gray-400">
                                    {formatDateTime(comment.createdAt)}
                                    {isEdited && <span className="ml-1 text-gray-400">(編集済み)</span>}
                                  </span>
                                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => { setEditingCommentId(comment.id); setEditingCommentBody(comment.body); }}
                                      className="text-xs text-gray-400 hover:text-indigo-600"
                                    >
                                      編集
                                    </button>
                                    <button
                                      onClick={() => handleDeleteComment(comment.id)}
                                      className="text-xs text-gray-400 hover:text-red-500"
                                    >
                                      削除
                                    </button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <form onSubmit={handleAddComment} className="space-y-2">
                      <textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        onPaste={(e) => selectedTask && handleCommentImagePaste(e, selectedTask.id, () => newComment, setNewComment)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                        placeholder="コメントを追加... (画像はCtrl+Vで貼り付け可)"
                        rows={2}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAddComment(e as unknown as React.FormEvent);
                        }}
                      />
                      <button
                        type="submit"
                        disabled={!newComment.trim()}
                        className="w-full bg-indigo-600 text-white rounded-lg px-3 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        投稿
                      </button>
                    </form>
                    </>}
                  </div>
                )}
              </div>
            )}
          </div>
          )}
        </div>
      </div>

      {/* エピック編集モーダル */}
      {editingEpic && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setEditingEpic(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold text-gray-800 mb-4">エピックを編集</h2>
            <form onSubmit={handleUpdateEpic} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">エピック名 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={editEpicForm.title}
                  onChange={(e) => setEditEpicForm({ ...editEpicForm, title: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">プロジェクト</label>
                <select
                  value={editEpicForm.projectId ?? ""}
                  onChange={(e) => setEditEpicForm({ ...editEpicForm, projectId: e.target.value ? parseInt(e.target.value) : null })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">なし</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">カラー</label>
                <div className="flex gap-1.5 flex-wrap">
                  {EPIC_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setEditEpicForm({ ...editEpicForm, color })}
                      className={`w-6 h-6 rounded-full flex-shrink-0 transition-transform ${
                        editEpicForm.color === color ? "scale-110 ring-2 ring-offset-1 ring-gray-400" : ""
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setEditingEpic(null)} className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">キャンセル</button>
                <button type="submit" className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">保存</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* スプリント完了モーダル */}
      {completingSprintId !== null && (() => {
        const sprint = sprints.find((s) => s.id === completingSprintId);
        if (!sprint) return null;
        const unclosedTasks = tasks.filter((t) => t.sprintId === completingSprintId && !t.done && t.status !== "closed");
        const otherSprints = sprints.filter((s) => s.id !== completingSprintId && s.status !== "completed");
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setCompletingSprintId(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-base font-bold text-gray-800 mb-1">スプリントを完了</h2>
              <p className="text-sm text-gray-500 mb-4">{sprint.name}</p>
              {unclosedTasks.length > 0 ? (
                <div className="mb-5">
                  <p className="text-sm text-gray-700 mb-2">
                    未完了タスクが <span className="font-semibold text-orange-600">{unclosedTasks.length} 件</span> あります。移動先を選択してください。
                  </p>
                  <select
                    value={completeMoveTarget}
                    onChange={(e) => setCompleteMoveTarget(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="backlog">バックログ</option>
                    {otherSprints.map((s) => (
                      <option key={s.id} value={String(s.id)}>{s.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="text-sm text-gray-500 mb-5">すべてのタスクが完了しています。</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setCompletingSprintId(null)}
                  className="flex-1 border border-gray-300 text-gray-600 rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleCompleteSprint}
                  className="flex-1 bg-green-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-green-700"
                >
                  完了する
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* スプリント編集モーダル */}
      {editingSprint && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setEditingSprint(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold text-gray-800 mb-4">スプリントを編集</h2>
            <form onSubmit={handleUpdateSprint} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">スプリント名 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={editSprintForm.name}
                  onChange={(e) => setEditSprintForm({ ...editSprintForm, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="スプリント名"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">開始日</label>
                  <input type="date" value={editSprintForm.startDate} onChange={(e) => setEditSprintForm({ ...editSprintForm, startDate: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">終了日</label>
                  <input type="date" value={editSprintForm.endDate} onChange={(e) => setEditSprintForm({ ...editSprintForm, endDate: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ステータス</label>
                <select value={editSprintForm.status} onChange={(e) => setEditSprintForm({ ...editSprintForm, status: e.target.value as SprintStatus })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="planning">計画中</option>
                  <option value="active">アクティブ</option>
                  <option value="completed">完了</option>
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditingSprint(null)}
                  className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* プロジェクト編集モーダル */}
      {editingProject && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setEditingProject(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold text-gray-800 mb-4">プロジェクトを編集</h2>
            <form onSubmit={handleUpdateProject} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">プロジェクト名 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={editProjectForm.name}
                  onChange={(e) => setEditProjectForm({ ...editProjectForm, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="プロジェクト名"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">プロジェクトキー</label>
                <input
                  type="text"
                  value={editProjectForm.key}
                  onChange={(e) => setEditProjectForm({ ...editProjectForm, key: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })}
                  maxLength={15}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="例: PRJ（半角英数・最大15文字）"
                />
                <p className="text-xs text-gray-400 mt-1">{editProjectForm.key.length}/15</p>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditingProject(null)}
                  className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 管理メニューモーダル */}
      {showAdminModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowAdminModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 flex flex-col gap-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-800">管理メニュー</h2>
              <button onClick={() => setShowAdminModal(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            <div className="border border-gray-200 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-700">アプリをアップデート</p>
                  <p className="text-xs text-gray-400 mt-0.5">GitHub から最新バージョンを取得して反映します</p>
                </div>
                <button
                  onClick={async () => {
                    setUpdateStatus("running");
                    setUpdateSteps([]);
                    setUpdateUpToDate(false);
                    try {
                      const res = await fetch("/api/admin/update", { method: "POST" });
                      const data = await res.json();
                      setUpdateSteps(data.steps ?? []);
                      setUpdateUpToDate(!!data.upToDate);
                      setUpdateStatus(data.success ? "done" : "error");
                    } catch {
                      setUpdateSteps([{ label: "エラー", output: "リクエストに失敗しました", success: false }]);
                      setUpdateStatus("error");
                    }
                  }}
                  disabled={updateStatus === "running"}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-shrink-0 ${
                    updateStatus === "running"
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-indigo-600 text-white hover:bg-indigo-700"
                  }`}
                >
                  {updateStatus === "running" ? "実行中…" : "確認・実行"}
                </button>
              </div>

              {updateStatus === "done" && updateUpToDate && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-green-500 flex-shrink-0">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-green-700 font-medium">最新バージョンです</span>
                </div>
              )}

              {updateSteps.length > 0 && (
                <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                  {updateSteps.map((step, i) => (
                    <div key={i} className={`rounded-lg border text-xs font-mono ${step.success ? "border-gray-200 bg-gray-50" : "border-red-200 bg-red-50"}`}>
                      <div className={`flex items-center gap-1.5 px-3 py-1.5 border-b ${step.success ? "border-gray-200" : "border-red-200"}`}>
                        {step.success ? (
                          <svg viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3 text-green-500 flex-shrink-0">
                            <path fillRule="evenodd" d="M10 6A4 4 0 112 6a4 4 0 018 0zm-1.5-.5L6 8 3.5 5.5l1-1L6 6l2-2 .5.5z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3 text-red-500 flex-shrink-0">
                            <path fillRule="evenodd" d="M6 1a5 5 0 100 10A5 5 0 006 1zm-.5 2.5h1v4h-1V3.5zm0 5h1v1h-1v-1z" clipRule="evenodd" />
                          </svg>
                        )}
                        <span className={`font-semibold ${step.success ? "text-gray-600" : "text-red-600"}`}>{step.label}</span>
                      </div>
                      {step.output && (
                        <pre className="px-3 py-2 text-gray-700 whitespace-pre-wrap break-all leading-relaxed">{step.output}</pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <DragOverlay dropAnimation={null}>
        {activeDragTask && (
          <div className="bg-white rounded-xl border border-indigo-400 shadow-xl p-4 flex gap-2 w-80 opacity-95">
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2">
                <span className={`flex-1 font-medium text-gray-800 ${activeDragTask.done ? "line-through text-gray-400" : ""}`}>
                  {activeDragTask.title}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${PRIORITY_COLOR[activeDragTask.priority as Priority]}`}>
                  {PRIORITY_LABEL[activeDragTask.priority as Priority]}
                </span>
              </div>
              {activeDragTask.description && (
                <p className="text-sm text-gray-500 mt-1 truncate">{activeDragTask.description}</p>
              )}
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
