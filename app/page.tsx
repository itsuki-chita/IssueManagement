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
  | "backlog"
  | "all-sprints"
  | "all-projects"
  | { kind: "sprint"; id: number }
  | { kind: "project"; id: number }
  | { kind: "task"; id: number };

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

const PROJECT_COLORS = [
  "#6366f1", "#3b82f6", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#8b5cf6", "#14b8a6",
];

function isSprintView(v: ViewState): v is { kind: "sprint"; id: number } {
  return typeof v === "object" && v.kind === "sprint";
}
function isAllSprintsView(v: ViewState): v is "all-sprints" {
  return v === "all-sprints";
}
function isAllProjectsView(v: ViewState): v is "all-projects" {
  return v === "all-projects";
}
function isProjectView(v: ViewState): v is { kind: "project"; id: number } {
  return typeof v === "object" && v.kind === "project";
}
function isTaskView(v: ViewState): v is { kind: "task"; id: number } {
  return typeof v === "object" && v.kind === "task";
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
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}

function MarkdownEditor({
  value, onChange, rows = 6, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
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
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none bg-white"
          placeholder={placeholder}
          rows={rows}
        />
      )}
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

function SortableSprintItem({
  sprint, isSelected, taskCount, onSelect, onDelete, isTaskOver,
}: {
  sprint: Sprint;
  isSelected: boolean;
  taskCount: number;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
  isTaskOver: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: sprint.id });

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}>
      <div
        onClick={onSelect}
        className={`group flex items-start gap-1 px-2 py-2 rounded-lg cursor-pointer transition-all ${
          isTaskOver ? "ring-2 ring-indigo-400 bg-indigo-50"
            : isSelected ? "bg-indigo-50 text-indigo-700"
            : "text-gray-700 hover:bg-gray-50"
        }`}
      >
        <button
          {...attributes} {...listeners}
          onClick={(e) => e.stopPropagation()}
          tabIndex={-1}
          className="mt-1 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing flex-shrink-0 touch-none focus:outline-none"
        >
          <GripIcon />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="text-sm font-medium truncate">{sprint.name}</span>
            <span className="text-xs text-gray-400 flex-shrink-0">{taskCount}</span>
          </div>
          <div className="mt-0.5">
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${SPRINT_STATUS_COLOR[sprint.status]}`}>
              {SPRINT_STATUS_LABEL[sprint.status]}
            </span>
          </div>
          {(sprint.startDate || sprint.endDate) && (
            <div className="text-xs text-gray-400 mt-0.5">
              {formatShortDate(sprint.startDate)}〜{formatShortDate(sprint.endDate)}
            </div>
          )}
        </div>
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 mt-0.5 text-gray-400 hover:text-red-500 transition-opacity flex-shrink-0"
        >
          <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function DraggableTaskCard({
  task, isSelected, onSelect, onToggleDone, projects, sprints, onChangeSprint, allTasks, onShowOnly,
}: {
  task: Task;
  isSelected: boolean;
  onSelect: () => void;
  onToggleDone: (e: React.MouseEvent) => void;
  projects: Project[];
  sprints: Sprint[];
  onChangeSprint: (taskId: number, sprintId: number | null) => void;
  allTasks: Task[];
  onShowOnly: (task: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `task-${task.id}` });
  const project = task.projectId ? projects.find((p) => p.id === task.projectId) : null;
  const taskKey = getTaskKey(task, projects);
  const currentSprint = task.sprintId ? sprints.find((s) => s.id === task.sprintId) : null;
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
      className={`bg-white rounded-xl border p-4 flex gap-2 cursor-grab active:cursor-grabbing select-none transition-colors ${
        isDragging ? "opacity-30 shadow-lg" : ""
      } ${isSelected ? "border-indigo-400 ring-1 ring-indigo-400" : "border-gray-200 hover:border-indigo-200"}`}
    >
      <span className="mt-0.5 text-gray-300 flex-shrink-0 self-start">
        <GripIcon />
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onToggleDone(e); }}
        onPointerDown={(e) => e.stopPropagation()}
        className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 transition-colors cursor-pointer ${
          task.done ? "bg-indigo-600 border-indigo-600" : "border-gray-300 hover:border-indigo-400"
        }`}
      >
        {task.done && (
          <svg viewBox="0 0 12 12" fill="none" className="w-full h-full p-0.5">
            <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <span className={`flex-1 font-medium text-gray-800 ${task.done ? "line-through text-gray-400" : ""}`}>
            {task.title}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${PRIORITY_COLOR[task.priority as Priority]}`}>
            {PRIORITY_LABEL[task.priority as Priority]}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2 flex-wrap">
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
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${TASK_STATUS_COLOR[task.status as TaskStatus]}`}>
            {TASK_STATUS_LABEL[task.status as TaskStatus]}
          </span>
          {project && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
              <span className="text-xs text-gray-500 truncate max-w-[80px]">{project.name}</span>
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
          {/* スプリント選択 */}
          <div
            ref={sprintMenuRef}
            className="relative"
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
                {sprints.map((sprint) => (
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
        {task.description && <p className="text-sm text-gray-500 mt-1 truncate">{task.description}</p>}
        {task.dueDate && <p className="text-xs text-gray-400 mt-1">期限: {formatDate(task.dueDate)}</p>}
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

function BacklogDropZone({ taskCount, isSelected, onSelect, isHighlighted }: {
  taskCount: number;
  isSelected: boolean;
  onSelect: () => void;
  isHighlighted: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: "backlog" });
  return (
    <div ref={setNodeRef} className="border-t border-gray-100 p-3 flex-shrink-0">
      <button
        onClick={onSelect}
        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-between ${
          isHighlighted ? "ring-2 ring-indigo-400 bg-indigo-50 text-indigo-700"
            : isSelected ? "bg-indigo-50 text-indigo-700"
            : "text-gray-700 hover:bg-gray-50"
        }`}
      >
        <span>バックログ</span>
        <span className="text-xs text-gray-400">{taskCount}</span>
      </button>
    </div>
  );
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [view, setView] = useState<ViewState>("backlog");
  const [previousView, setPreviousView] = useState<ViewState>("backlog");
  const [filter, setFilter] = useState<"all" | "active" | "done">("all");
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>("empty");
  const [taskForm, setTaskForm] = useState(EMPTY_TASK_FORM);
  const [showSprintForm, setShowSprintForm] = useState(false);
  const [sprintForm, setSprintForm] = useState(EMPTY_SPRINT_FORM);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectForm, setProjectForm] = useState(EMPTY_PROJECT_FORM);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editProjectForm, setEditProjectForm] = useState({ name: "", key: "" });
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [activeOverId, setActiveOverId] = useState<string | number | null>(null);
  const [displayMode, setDisplayMode] = useState<"list" | "swimlane">("list");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState("");

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;
  const isTaskDragging = !!activeDragId?.startsWith("task-");
  const activeDragTask = isTaskDragging
    ? tasks.find((t) => t.id === parseInt(activeDragId!.replace("task-", "")))
    : null;

  async function fetchAll() {
    const [tasksRes, sprintsRes, projectsRes] = await Promise.all([
      fetch("/api/tasks"),
      fetch("/api/sprints"),
      fetch("/api/projects"),
    ]);
    const newTasks: Task[] = await tasksRes.json();
    const newSprints: Sprint[] = await sprintsRes.json();
    const newProjects: Project[] = await projectsRes.json();
    setTasks(newTasks);
    setSprints(newSprints);
    setProjects(newProjects);
    return { tasks: newTasks, sprints: newSprints, projects: newProjects };
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
    if (t.parentId !== null) return false;
    if (view === "backlog") return t.sprintId === null;
    if (view === "all-sprints") return t.sprintId !== null;
    if (view === "all-projects") return t.projectId !== null;
    if (isSprintView(view)) return t.sprintId === view.id;
    if (isProjectView(view)) return t.projectId === view.id;
    return true;
  });
  const filtered = viewedTasks.filter((t) => {
    if (filter === "active") return !t.done;
    if (filter === "done") return t.done;
    return true;
  });

  const currentSprint = isSprintView(view) ? sprints.find((s) => s.id === view.id) : null;
  const currentProject = isProjectView(view) ? projects.find((p) => p.id === view.id) : null;
  const currentTaskInView = isTaskView(view) ? tasks.find((t) => t.id === view.id) : null;
  const viewTitle = view === "backlog" ? "バックログ"
    : view === "all-sprints" ? "すべてのスプリント"
    : view === "all-projects" ? "すべてのプロジェクト"
    : isTaskView(view)
    ? (currentTaskInView ? `${getTaskKey(currentTaskInView, projects) ?? "#" + currentTaskInView.id}` : "")
    : currentSprint?.name ?? currentProject?.name ?? "";

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
    });
  }

  function selectTask(task: Task) {
    setSelectedTaskId(task.id);
    populateForm(task);
    setPanelMode("edit");
    setEditingCommentId(null);
    setNewComment("");
  }

  function openCreateForm() {
    setSelectedTaskId(null);
    const sprintId = isSprintView(view) ? view.id : null;
    const projectId = isProjectView(view) ? view.id : null;
    setTaskForm({ ...EMPTY_TASK_FORM, sprintId, projectId });
    setPanelMode("create");
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
  }

  async function handleDeleteComment(commentId: number) {
    if (!selectedTaskId) return;
    await fetch(`/api/comments/${commentId}`, { method: "DELETE" });
    await fetchComments(selectedTaskId);
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
    setView({ kind: "sprint", id: created.id });
  }

  async function deleteSprint(sprint: Sprint) {
    if (!confirm(`「${sprint.name}」を削除しますか？\n内のタスクはバックログへ移動されます。`)) return;
    await fetch(`/api/sprints/${sprint.id}`, { method: "DELETE" });
    if (isSprintView(view) && view.id === sprint.id) setView("backlog");
    fetchAll();
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
    setView({ kind: "project", id: created.id });
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
    if (isProjectView(view) && view.id === project.id) setView("backlog");
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
        // all-sprints / all-projects ビューでグループが異なる場合はスナップバック
        if (view === "all-sprints" && task.sprintId !== tasks.find((t) => t.id === overTaskId)?.sprintId) return;
        if (view === "all-projects" && task.projectId !== tasks.find((t) => t.id === overTaskId)?.projectId) return;
        const sprintTasksForReorder = view === "all-sprints"
          ? filtered.filter((t) => t.sprintId === task.sprintId)
          : view === "all-projects"
          ? filtered.filter((t) => t.projectId === task.projectId)
          : filtered;
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
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-800">タスク管理</h1>
            <button
              onClick={openCreateForm}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              + タスクを追加
            </button>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          {/* スプリントビュー */}
          <aside className={`${sidebarCollapsed ? "w-10" : "w-56"} transition-all duration-200 ease-in-out border-r border-gray-200 bg-white flex-shrink-0 flex flex-col overflow-hidden`}>
            {/* 開閉ボタン */}
            <div className={`flex-shrink-0 flex border-b border-gray-100 ${sidebarCollapsed ? "justify-center py-2.5" : "justify-end pr-2 py-1.5"}`}>
              <button
                onClick={() => setSidebarCollapsed((v) => !v)}
                title={sidebarCollapsed ? "サイドバーを開く" : "サイドバーを閉じる"}
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

                {projects.length > 0 && (
                  <button
                    onClick={() => setView("all-projects")}
                    className={`w-full text-left flex items-center justify-between px-2 py-1.5 mb-1 rounded-lg text-sm transition-colors ${
                      view === "all-projects"
                        ? "bg-indigo-50 text-indigo-700 font-medium"
                        : "text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    <span>すべてのプロジェクト</span>
                    <span className="text-xs text-gray-400">{tasks.filter((t) => t.projectId !== null && t.parentId === null).length}</span>
                  </button>
                )}
                {projects.length === 0 && !showProjectForm && (
                  <p className="text-xs text-gray-400 px-1 py-2">プロジェクトがありません</p>
                )}
                <div className="space-y-0.5">
                  {projects.map((project) => (
                    <DroppableProjectItem
                      key={project.id}
                      project={project}
                      isSelected={isProjectView(view) && view.id === project.id}
                      taskCount={tasks.filter((t) => t.projectId === project.id && t.parentId === null).length}
                      onSelect={() => setView({ kind: "project", id: project.id })}
                      onEdit={(e) => openEditProject(project, e)}
                      onDelete={(e) => { e.stopPropagation(); deleteProject(project); }}
                      isTaskOver={isTaskDragging && activeOverId === `project-${project.id}`}
                    />
                  ))}
                </div>
              </div>

              {/* スプリント */}
              <div className="p-3">
                <div className="flex items-center justify-between px-1 mb-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">スプリント</p>
                  <button onClick={() => setShowSprintForm(true)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">+ 追加</button>
                </div>

                {showSprintForm && (
                  <form onSubmit={handleSprintSubmit} className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-2">
                    <input
                      type="text"
                      value={sprintForm.name}
                      onChange={(e) => setSprintForm({ ...sprintForm, name: e.target.value })}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="スプリント名"
                      autoFocus
                    />
                    <div className="grid grid-cols-2 gap-1">
                      <input type="date" value={sprintForm.startDate} onChange={(e) => setSprintForm({ ...sprintForm, startDate: e.target.value })} className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                      <input type="date" value={sprintForm.endDate} onChange={(e) => setSprintForm({ ...sprintForm, endDate: e.target.value })} className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                    </div>
                    <select value={sprintForm.status} onChange={(e) => setSprintForm({ ...sprintForm, status: e.target.value as SprintStatus })} className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                      <option value="planning">計画中</option>
                      <option value="active">アクティブ</option>
                      <option value="completed">完了</option>
                    </select>
                    <div className="flex gap-1 pt-1">
                      <button type="submit" className="flex-1 bg-indigo-600 text-white rounded px-2 py-1.5 text-xs font-medium hover:bg-indigo-700">追加</button>
                      <button type="button" onClick={() => { setShowSprintForm(false); setSprintForm(EMPTY_SPRINT_FORM); }} className="flex-1 border border-gray-300 text-gray-600 rounded px-2 py-1.5 text-xs hover:bg-gray-50">キャンセル</button>
                    </div>
                  </form>
                )}

                {sprints.length > 0 && (
                  <button
                    onClick={() => setView("all-sprints")}
                    className={`w-full text-left flex items-center justify-between px-2 py-1.5 mb-1 rounded-lg text-sm transition-colors ${
                      view === "all-sprints"
                        ? "bg-indigo-50 text-indigo-700 font-medium"
                        : "text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    <span>すべてのスプリント</span>
                    <span className="text-xs text-gray-400">{tasks.filter((t) => t.sprintId !== null && t.parentId === null).length}</span>
                  </button>
                )}
                {sprints.length === 0 && !showSprintForm && (
                  <p className="text-xs text-gray-400 px-1 py-2">スプリントがありません</p>
                )}
                <SortableContext items={sprints.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  {sprints.map((sprint) => (
                    <SortableSprintItem
                      key={sprint.id}
                      sprint={sprint}
                      isSelected={isSprintView(view) && view.id === sprint.id}
                      taskCount={tasks.filter((t) => t.sprintId === sprint.id && t.parentId === null).length}
                      onSelect={() => setView({ kind: "sprint", id: sprint.id })}
                      onDelete={(e) => { e.stopPropagation(); deleteSprint(sprint); }}
                      isTaskOver={isTaskDragging && activeOverId === sprint.id}
                    />
                  ))}
                </SortableContext>
              </div>
            </div>

            {/* バックログ（下部固定） */}
            {!sidebarCollapsed && (
              <BacklogDropZone
                taskCount={tasks.filter((t) => t.sprintId === null && t.parentId === null).length}
                isSelected={view === "backlog"}
                onSelect={() => setView("backlog")}
                isHighlighted={isTaskDragging && activeOverId === "backlog"}
              />
            )}
          </aside>

          {/* メインコンテンツ */}
          <div className={`flex-1 flex flex-col min-w-0 ${!isTaskView(view) && displayMode === "swimlane" ? "overflow-hidden" : "overflow-y-auto"}`}>
            {/* ヘッダー */}
            {!isTaskView(view) && (
            <div className="flex-shrink-0 px-4 pt-4 pb-3 flex items-center gap-2">
              {currentProject && (
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: currentProject.color }} />
              )}
              <h2 className="font-semibold text-gray-700">{viewTitle}</h2>
              {currentSprint && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SPRINT_STATUS_COLOR[currentSprint.status as SprintStatus]}`}>
                  {SPRINT_STATUS_LABEL[currentSprint.status as SprintStatus]}
                </span>
              )}
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

            {!isTaskView(view) && (<>
            {/* フィルター（リストのみ） */}
            {displayMode === "list" && (
              <div className="flex-shrink-0 px-4 pb-3 flex gap-2">
                {(["all", "active", "done"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      filter === f ? "bg-indigo-600 text-white" : "bg-white text-gray-600 border border-gray-200 hover:border-indigo-300"
                    }`}
                  >
                    {f === "all" ? "すべて" : f === "active" ? "未完了" : "完了済み"}
                  </button>
                ))}
                <span className="ml-auto text-sm text-gray-400 self-center">{filtered.length} 件</span>
              </div>
            )}

            {/* リストビュー（通常） */}
            {displayMode === "list" && view !== "all-sprints" && view !== "all-projects" && (
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                {filtered.length === 0 ? (
                  <div className="text-center py-16 text-gray-400">タスクがありません</div>
                ) : (
                  <SortableContext
                    items={filtered.map((t) => `task-${t.id}`)}
                    strategy={verticalListSortingStrategy}
                  >
                    <ul className="space-y-2">
                      {filtered.map((task) => (
                        <DraggableTaskCard
                          key={task.id}
                          task={task}
                          isSelected={selectedTaskId === task.id}
                          onSelect={() => selectTask(task)}
                          onToggleDone={(e) => toggleDone(task, e)}
                          projects={projects}
                          sprints={sprints}
                          onChangeSprint={handleChangeSprint}
                          allTasks={tasks}
                          onShowOnly={showTaskOnly}
                        />
                      ))}
                    </ul>
                  </SortableContext>
                )}
              </div>
            )}

            {/* リストビュー（すべてのスプリント：スプリントごとにグループ表示） */}
            {displayMode === "list" && view === "all-sprints" && (
              <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
                {sprints.map((sprint) => {
                  const sprintTasks = filtered.filter((t) => t.sprintId === sprint.id);
                  return (
                    <div key={sprint.id}>
                      <div className="flex items-center gap-2 mb-2 sticky top-0 bg-gray-50 py-1 z-10">
                        <h3 className="text-sm font-semibold text-gray-700">{sprint.name}</h3>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${SPRINT_STATUS_COLOR[sprint.status as SprintStatus]}`}>
                          {SPRINT_STATUS_LABEL[sprint.status as SprintStatus]}
                        </span>
                        {(sprint.startDate || sprint.endDate) && (
                          <span className="text-xs text-gray-400">
                            {formatShortDate(sprint.startDate)}〜{formatShortDate(sprint.endDate)}
                          </span>
                        )}
                        <span className="text-xs text-gray-400 ml-auto">{sprintTasks.length} 件</span>
                      </div>
                      {sprintTasks.length === 0 ? (
                        <p className="text-sm text-gray-400 py-3 text-center border border-dashed border-gray-200 rounded-xl">タスクなし</p>
                      ) : (
                        <SortableContext
                          items={sprintTasks.map((t) => `task-${t.id}`)}
                          strategy={verticalListSortingStrategy}
                        >
                          <ul className="space-y-2">
                            {sprintTasks.map((task) => (
                              <DraggableTaskCard
                                key={task.id}
                                task={task}
                                isSelected={selectedTaskId === task.id}
                                onSelect={() => selectTask(task)}
                                onToggleDone={(e) => toggleDone(task, e)}
                                projects={projects}
                                sprints={sprints}
                                onChangeSprint={handleChangeSprint}
                                allTasks={tasks}
                                onShowOnly={showTaskOnly}
                              />
                            ))}
                          </ul>
                        </SortableContext>
                      )}
                    </div>
                  );
                })}
                {sprints.every((s) => filtered.filter((t) => t.sprintId === s.id).length === 0) && (
                  <div className="text-center py-16 text-gray-400">タスクがありません</div>
                )}
              </div>
            )}

            {/* リストビュー（すべてのプロジェクト：プロジェクトごとにグループ表示） */}
            {displayMode === "list" && view === "all-projects" && (
              <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
                {projects.map((project) => {
                  const projectTasks = filtered.filter((t) => t.projectId === project.id);
                  return (
                    <div key={project.id}>
                      <div className="flex items-center gap-2 mb-2 sticky top-0 bg-gray-50 py-1 z-10">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
                        <h3 className="text-sm font-semibold text-gray-700">{project.name}</h3>
                        {project.key && (
                          <span className="text-xs font-mono text-gray-400">{project.key}</span>
                        )}
                        <span className="text-xs text-gray-400 ml-auto">{projectTasks.length} 件</span>
                      </div>
                      {projectTasks.length === 0 ? (
                        <p className="text-sm text-gray-400 py-3 text-center border border-dashed border-gray-200 rounded-xl">タスクなし</p>
                      ) : (
                        <SortableContext
                          items={projectTasks.map((t) => `task-${t.id}`)}
                          strategy={verticalListSortingStrategy}
                        >
                          <ul className="space-y-2">
                            {projectTasks.map((task) => (
                              <DraggableTaskCard
                                key={task.id}
                                task={task}
                                isSelected={selectedTaskId === task.id}
                                onSelect={() => selectTask(task)}
                                onToggleDone={(e) => toggleDone(task, e)}
                                projects={projects}
                                sprints={sprints}
                                onChangeSprint={handleChangeSprint}
                                allTasks={tasks}
                                onShowOnly={showTaskOnly}
                              />
                            ))}
                          </ul>
                        </SortableContext>
                      )}
                    </div>
                  );
                })}
                {projects.every((p) => filtered.filter((t) => t.projectId === p.id).length === 0) && (
                  <div className="text-center py-16 text-gray-400">タスクがありません</div>
                )}
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

            {/* タスク詳細画面 */}
            {isTaskView(view) && selectedTask && (
              <div className="flex-1 overflow-y-auto">
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
                  <form onSubmit={handleTaskSubmit} className="flex gap-8 items-start">
                    {/* 左：タイトル + 説明 */}
                    <div className="flex-1 min-w-0 space-y-5">
                      <input
                        type="text"
                        value={taskForm.title}
                        onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                        className="w-full text-2xl font-bold text-gray-900 border-0 border-b-2 border-gray-200 focus:border-indigo-500 focus:outline-none pb-2 bg-transparent"
                        placeholder="タスクのタイトル"
                      />
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">説明</label>
                        <MarkdownEditor
                          value={taskForm.description}
                          onChange={(v) => setTaskForm({ ...taskForm, description: v })}
                          rows={8}
                          placeholder="詳細・メモ（任意）"
                        />
                      </div>
                    </div>

                    {/* 右：メタデータサイドバー */}
                    <div className="w-56 flex-shrink-0 space-y-4 bg-white rounded-2xl border border-gray-200 p-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">ステータス</label>
                        <select
                          value={taskForm.status}
                          onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value as TaskStatus })}
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
                          onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value as Priority })}
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
                          onChange={(e) => setTaskForm({ ...taskForm, projectId: e.target.value ? parseInt(e.target.value) : null })}
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
                          onChange={(e) => setTaskForm({ ...taskForm, sprintId: e.target.value === "backlog" ? null : parseInt(e.target.value) })}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        >
                          <option value="backlog">バックログ</option>
                          {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">期限</label>
                        <input
                          type="date"
                          value={taskForm.dueDate}
                          onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        />
                      </div>
                      <div className="pt-3 border-t border-gray-100 space-y-2">
                        <button
                          type="submit"
                          className="w-full bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                        >
                          更新
                        </button>
                        <button
                          type="button"
                          onClick={deleteTask}
                          className="w-full text-sm text-red-500 hover:text-red-700 py-1.5 transition-colors"
                        >
                          このタスクを削除
                        </button>
                      </div>
                    </div>
                  </form>

                  {/* サブタスク */}
                  {(() => {
                    const subtasks = tasks.filter((t) => t.parentId === selectedTask.id);
                    return (
                      <div className="mt-8 border-t border-gray-100 pt-6 max-w-2xl">
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

                  {/* コメント */}
                  <div className="mt-8 border-t border-gray-100 pt-6 max-w-2xl">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4">コメント</h3>
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
                                <CommentBody body={comment.body} />
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
                        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none bg-white"
                        placeholder="コメントを追加..."
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
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* タスク詳細ビュー */}
          {!isTaskView(view) && (
          <div className="w-80 border-l border-gray-200 bg-white overflow-y-auto flex-shrink-0">
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">タイトル <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={taskForm.title}
                      onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="タスクのタイトル"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">メモ</label>
                    <MarkdownEditor
                      value={taskForm.description}
                      onChange={(v) => setTaskForm({ ...taskForm, description: v })}
                      rows={4}
                      placeholder="詳細・メモ（任意）"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ステータス</label>
                    <select
                      value={taskForm.status}
                      onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value as TaskStatus })}
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
                      onChange={(e) => setTaskForm({ ...taskForm, projectId: e.target.value ? parseInt(e.target.value) : null })}
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
                      onChange={(e) => setTaskForm({ ...taskForm, sprintId: e.target.value === "backlog" ? null : parseInt(e.target.value) })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="backlog">バックログ</option>
                      {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">優先度</label>
                      <select
                        value={taskForm.priority}
                        onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value as Priority })}
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
                        onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

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
                      {panelMode === "create" ? "追加" : "更新"}
                    </button>
                  </div>

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

                {panelMode === "edit" && (
                  <div className="mt-6 border-t border-gray-100 pt-5">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">コメント</h3>

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
                                <CommentBody body={comment.body} />
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
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                        placeholder="コメントを追加..."
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
                  </div>
                )}
              </div>
            )}
          </div>
          )}
        </div>
      </div>

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
