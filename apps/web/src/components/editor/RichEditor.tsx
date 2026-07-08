"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import Placeholder from "@tiptap/extension-placeholder";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { useCallback, useEffect, useState } from "react";
import type { SVGProps } from "react";
import { FontSize } from "./extensions/fontSize";
import { VariableToken } from "./extensions/variableToken";
import { PLACEHOLDER_MENU } from "@/lib/placeholders";
import { extractVariables, slugifyVariableKey } from "@/lib/variableTokens";
import type { TemplateVariableType } from "@ai-vault/types";
import "./editor.css";

const FONT_SIZES = ["8", "9", "10", "10.5", "11", "12", "14", "16", "18", "20", "24", "28", "32", "36"];

function InsertFieldSelect({ editor }: { editor: Editor }) {
  return (
    <select
      title="Вставить поле — подставится автоматически при создании документа"
      value=""
      onChange={(e) => {
        const key = e.target.value;
        if (key) editor.chain().focus().insertContent(`{{${key}}}`).run();
      }}
      className="px-1.5 py-1 text-xs rounded-md border border-[var(--color-border)] bg-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors max-w-[130px]"
    >
      <option value="">Вставить поле…</option>
      {PLACEHOLDER_MENU.map((group) => (
        <optgroup key={group.group} label={group.group}>
          {group.items.map((item) => (
            <option key={item.key} value={item.key}>{item.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function FontSizeSelect({ editor }: { editor: Editor }) {
  const current = (editor.getAttributes("textStyle").fontSize as string | undefined) ?? "";
  const value = current.replace("pt", "");

  return (
    <select
      title="Размер шрифта"
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        if (!v) editor.chain().focus().unsetFontSize().run();
        else editor.chain().focus().setFontSize(`${v}pt`).run();
      }}
      className="px-1.5 py-1 text-xs rounded-md border border-[var(--color-border)] bg-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
    >
      <option value="">12 (по умолч.)</option>
      {FONT_SIZES.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}

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

/* ── Add variable button (constructor only) ───────────────────────────── */
function AddVariableButton({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [varType, setVarType] = useState<TemplateVariableType>("text");

  const insert = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const existingKeys = extractVariables(editor.getJSON()).map((v) => v.key);
    const key = slugifyVariableKey(trimmed, existingKeys);
    editor.chain().focus().insertVariable({ key, label: trimmed, varType, value: "" }).run();
    setLabel("");
    setVarType("text");
    setOpen(false);
  };

  return (
    <div className="relative">
      <ToolbarBtn title="Добавить переменную" onClick={() => setOpen((v) => !v)}>
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M12 9v6M9 12h6" />
        </svg>
      </ToolbarBtn>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 w-64 p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] shadow-xl flex flex-col gap-2">
            <label className="text-xs font-medium text-[var(--color-text-secondary)]">
              Название переменной
              <input
                autoFocus
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") insert();
                  if (e.key === "Escape") setOpen(false);
                }}
                placeholder="Реквизиты заказчика"
                className="mt-1 w-full px-2 py-1.5 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
              />
            </label>
            <label className="text-xs font-medium text-[var(--color-text-secondary)]">
              Тип
              <select
                value={varType}
                onChange={(e) => setVarType(e.target.value as TemplateVariableType)}
                className="mt-1 w-full px-2 py-1.5 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
              >
                <option value="text">Текст</option>
                <option value="date">Дата</option>
              </select>
            </label>
            <button
              onClick={insert}
              disabled={!label.trim()}
              className="mt-1 px-2 py-1.5 text-sm font-semibold rounded-md bg-[var(--color-accent)] text-[#0F172A] hover:bg-[var(--color-accent-hover)] disabled:opacity-40 transition-colors"
            >
              Вставить
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ── RichEditor ─────────────────────────────────────────────────────── */
interface RichEditorProps {
  initialContent?: unknown;
  onChange?: (json: unknown) => void;
  placeholder?: string;
  readOnly?: boolean;
  /** Shows the "Добавить переменную" toolbar control (template constructor only) */
  variablesEnabled?: boolean;
}

export function RichEditor({ initialContent, onChange, placeholder = "Начните вводить текст...", readOnly = false, variablesEnabled = false }: RichEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      FontSize,
      VariableToken,
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
          <FontSizeSelect editor={editor} />
          <InsertFieldSelect editor={editor} />
          {variablesEnabled && <AddVariableButton editor={editor} />}
          <SEP />
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
