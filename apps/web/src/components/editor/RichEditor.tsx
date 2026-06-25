"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { useCallback, useEffect } from "react";
import type { SVGProps } from "react";
import "./editor.css";

/* ── Icons ─────────────────────────────────────────────────────────── */
const Icon = (d: string) =>
  function Ico(props: SVGProps<SVGSVGElement>) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d={d} />
      </svg>
    );
  };

const BoldIcon = Icon("M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6zM6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z");
const ItalicIcon = Icon("M19 4h-9M14 20H5M14.7 4.7L9.2 19.4");
const UnderlineIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3" />
    <line x1="4" y1="21" x2="20" y2="21" />
  </svg>
);

const AlignLeftIcon = Icon("M21 6H3M15 12H3M17 18H3");
const AlignCenterIcon = Icon("M21 6H3M17 12H7M19 18H5");
const AlignRightIcon = Icon("M21 6H3M21 12H9M21 18H11");
const ListIcon = Icon("M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01");
const ListOrderedIcon = Icon("M10 6h11M10 12h11M10 18h11M4 6h.01M4 12h.01M4 18h.01");
const TableIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
  </svg>
);

/* ── Toolbar button ─────────────────────────────────────────────────── */
function ToolbarBtn({
  active,
  title,
  onClick,
  children,
}: {
  active?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={[
        "p-1.5 rounded-md transition-colors",
        active
          ? "bg-[var(--color-accent-dim)] text-[var(--color-accent)]"
          : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

const SEP = () => <div className="w-px h-5 bg-[var(--color-border)] mx-0.5" />;

/* ── RichEditor ─────────────────────────────────────────────────────── */
interface RichEditorProps {
  initialContent?: unknown;
  onChange?: (json: unknown) => void;
  placeholder?: string;
  readOnly?: boolean;
}

export function RichEditor({ initialContent, onChange, placeholder = "Начните вводить текст...", readOnly = false }: RichEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: (initialContent as object) ?? "",
    editable: !readOnly,
    onUpdate: ({ editor: e }) => {
      onChange?.(e.getJSON());
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    if (!editor || !initialContent) return;
    const current = JSON.stringify(editor.getJSON());
    const next = JSON.stringify(initialContent);
    if (current !== next) {
      editor.commands.setContent(initialContent as object, false);
    }
  // Only run when initialContent identity changes (document switch)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, JSON.stringify(initialContent)]);

  const insertTable = useCallback(() => {
    editor?.chain().focus().insertTable({ rows: 4, cols: 3, withHeaderRow: true }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-0.5 px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-bg-surface)] shrink-0">
          <ToolbarBtn active={editor.isActive("bold")} title="Жирный (Ctrl+B)" onClick={() => editor.chain().focus().toggleBold().run()}>
            <BoldIcon className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn active={editor.isActive("italic")} title="Курсив (Ctrl+I)" onClick={() => editor.chain().focus().toggleItalic().run()}>
            <ItalicIcon className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn active={editor.isActive("underline")} title="Подчёркивание (Ctrl+U)" onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <UnderlineIcon />
          </ToolbarBtn>
          <SEP />
          {([1, 2, 3] as const).map((level) => (
            <ToolbarBtn
              key={level}
              active={editor.isActive("heading", { level })}
              title={`Заголовок ${level}`}
              onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
            >
              <span className="text-xs font-bold w-4 h-4 flex items-center justify-center">H{level}</span>
            </ToolbarBtn>
          ))}
          <SEP />
          <ToolbarBtn active={editor.isActive({ textAlign: "left" })} title="По левому краю" onClick={() => editor.chain().focus().setTextAlign("left").run()}>
            <AlignLeftIcon className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn active={editor.isActive({ textAlign: "center" })} title="По центру" onClick={() => editor.chain().focus().setTextAlign("center").run()}>
            <AlignCenterIcon className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn active={editor.isActive({ textAlign: "right" })} title="По правому краю" onClick={() => editor.chain().focus().setTextAlign("right").run()}>
            <AlignRightIcon className="w-4 h-4" />
          </ToolbarBtn>
          <SEP />
          <ToolbarBtn active={editor.isActive("bulletList")} title="Маркированный список" onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <ListIcon className="w-4 h-4" />
          </ToolbarBtn>
          <ToolbarBtn active={editor.isActive("orderedList")} title="Нумерованный список" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <ListOrderedIcon className="w-4 h-4" />
          </ToolbarBtn>
          <SEP />
          <ToolbarBtn active={editor.isActive("table")} title="Вставить таблицу" onClick={insertTable}>
            <TableIcon />
          </ToolbarBtn>
        </div>
      )}

      {/* Editor area */}
      <EditorContent
        editor={editor}
        className="flex-1 overflow-y-auto px-8 py-6 prose-editor"
      />
    </div>
  );
}
