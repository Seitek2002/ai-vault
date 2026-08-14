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
import { useCallback, useEffect, useRef, useState } from "react";
import type { SVGProps } from "react";
import { useQuery } from "@tanstack/react-query";
import { FontSize } from "./extensions/fontSize";
import { VariableToken } from "./extensions/variableToken";
import { Image } from "./extensions/image";
import { PLACEHOLDER_MENU } from "@/lib/placeholders";
import { extractVariables, slugifyVariableKey } from "@/lib/variableTokens";
import { settingsApi } from "@/lib/api/settings";
import { documentsApi } from "@/lib/api/documents";
import { letterheadsApi, type LetterheadDto } from "@/lib/api/letterheads";
import { buildLetterheadNode } from "@/lib/letterhead";
import { Select, Button, Spinner } from "@/components/ui";
import type { TemplateVariableType } from "@ai-vault/types";
import "./editor.css";

const CONTENT_IMAGE_DEFAULT_WIDTH = 320;

const FONT_SIZES = ["8", "9", "10", "10.5", "11", "12", "14", "16", "18", "20", "24", "28", "32", "36"];

const TOOLBAR_SELECT_CLS =
  "px-1.5 py-1 text-xs rounded-md border border-[var(--color-border)] bg-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-0 transition-colors";

function InsertFieldSelect({ editor }: { editor: Editor }) {
  return (
    <Select
      title="Вставить поле — подставится автоматически при создании документа"
      value=""
      onChange={(key) => {
        if (key) editor.chain().focus().insertContent(`{{${key}}}`).run();
      }}
      placeholder="Вставить поле…"
      className={`${TOOLBAR_SELECT_CLS} max-w-[130px]`}
      options={PLACEHOLDER_MENU.map((group) => ({
        group: group.group,
        items: group.items.map((item) => ({ value: item.key, label: item.label })),
      }))}
    />
  );
}

function FontSizeSelect({ editor }: { editor: Editor }) {
  const current = (editor.getAttributes("textStyle").fontSize as string | undefined) ?? "";
  const value = current.replace("pt", "");

  return (
    <Select
      title="Размер шрифта"
      value={value}
      onChange={(v) => {
        if (!v) editor.chain().focus().unsetFontSize().run();
        else editor.chain().focus().setFontSize(`${v}pt`).run();
      }}
      placeholder="12 (по умолч.)"
      className={`${TOOLBAR_SELECT_CLS} w-[110px]`}
      options={[
        { value: "", label: "12 (по умолч.)" },
        ...FONT_SIZES.map((s) => ({ value: s, label: s })),
      ]}
    />
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
const LetterheadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <rect x="3" y="4" width="18" height="16" rx="1.5" />
    <path d="M3 9h18" />
    <circle cx="6.5" cy="6.5" r="1" />
    <path d="M10 6.5h8" />
  </svg>
);
const ImageIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />
  </svg>
);

/* ── Toolbar button ─────────────────────────────────────────────────── */
function ToolbarBtn({
  active,
  disabled,
  title,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => { e.preventDefault(); if (!disabled) onClick(); }}
      className={[
        "p-1.5 rounded-md transition-colors",
        disabled
          ? "text-[var(--color-text-muted)] opacity-40 cursor-not-allowed"
          : active
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
              <Select
                value={varType}
                onChange={(v) => setVarType(v as TemplateVariableType)}
                className="mt-1 w-full px-2 py-1.5 text-sm rounded-md"
                options={[
                  { value: "text", label: "Текст" },
                  { value: "date", label: "Дата" },
                ]}
              />
            </label>
            <Button size="sm" onClick={insert} disabled={!label.trim()} className="mt-1 rounded-md">
              Вставить
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Letterhead dropdown: pick from saved letterhead templates, with search ── */
const DEFAULT_LETTERHEAD_LABEL = "Реквизиты компании";

function LetterheadDropdown({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: settingsApi.getSettings,
  });
  const { data: letterheads = [] } = useQuery({
    queryKey: ["letterheads"],
    queryFn: () => letterheadsApi.list(),
  });

  const defaultNode = buildLetterheadNode(settings);
  const q = search.trim().toLowerCase();
  const defaultVisible = !!defaultNode && DEFAULT_LETTERHEAD_LABEL.toLowerCase().includes(q);
  const filtered = letterheads.filter((l) => l.name.toLowerCase().includes(q));
  const hasAny = defaultVisible || filtered.length > 0;

  function close() {
    setOpen(false);
    setSearch("");
  }

  function insertDefault() {
    if (!defaultNode) return;
    editor.chain().focus().insertContentAt(0, defaultNode).run();
    close();
  }

  function insertCustom(lh: LetterheadDto) {
    const content = (lh.bodyJson as { content?: unknown[] } | null)?.content;
    if (!content || content.length === 0) return;
    editor.chain().focus().insertContentAt(0, content).run();
    close();
  }

  return (
    <div className="relative">
      <ToolbarBtn title="Добавить верхний колонтитул" onClick={() => setOpen((v) => !v)}>
        <LetterheadIcon />
      </ToolbarBtn>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={close} />
          <div className="absolute left-0 top-full mt-1 z-20 w-72 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] shadow-xl flex flex-col">
            <div className="p-2 border-b border-[var(--color-border)]">
              <input
                autoFocus
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") close(); }}
                placeholder="Поиск колонтитула…"
                className="w-full px-2 py-1.5 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
              />
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              {defaultVisible && (
                <button
                  type="button"
                  onClick={insertDefault}
                  className="w-full text-left px-3 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)] transition-colors"
                >
                  {DEFAULT_LETTERHEAD_LABEL}{" "}
                  <span className="text-xs text-[var(--color-text-muted)]">(по умолчанию)</span>
                </button>
              )}
              {filtered.map((lh) => (
                <button
                  key={lh.id}
                  type="button"
                  onClick={() => insertCustom(lh)}
                  className="w-full text-left px-3 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)] transition-colors truncate"
                >
                  {lh.name}
                </button>
              ))}
              {!hasAny && (
                <p className="px-3 py-4 text-xs text-[var(--color-text-muted)] text-center">
                  {letterheads.length === 0 && !defaultNode
                    ? "Колонтитулов пока нет — создайте в Конструкторе"
                    : "Ничего не найдено"}
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Insert an arbitrary image (photo) at the cursor, uploaded on the spot ── */
function InsertImageButton({ editor }: { editor: Editor }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const { url } = await documentsApi.uploadContentImage(file);
        editor
          .chain()
          .focus()
          .insertContent({ type: "image", attrs: { src: url, width: CONTENT_IMAGE_DEFAULT_WIDTH } })
          .run();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Не удалось загрузить изображение");
      } finally {
        setUploading(false);
      }
    },
    [editor],
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleFile(file);
        }}
      />
      <ToolbarBtn
        title="Вставить изображение"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? <Spinner size="sm" /> : <ImageIcon />}
      </ToolbarBtn>
    </>
  );
}

/* ── Contextual table toolbar (shown only with the cursor inside a table) ── */
function TableControls({ editor }: { editor: Editor }) {
  if (!editor.isActive("table")) return null;

  const actions: Array<{ label: string; title: string; onClick: () => void; danger?: boolean }> = [
    { label: "Строка выше", title: "Добавить строку выше", onClick: () => editor.chain().focus().addRowBefore().run() },
    { label: "Строка ниже", title: "Добавить строку ниже", onClick: () => editor.chain().focus().addRowAfter().run() },
    { label: "Столбец слева", title: "Добавить столбец слева", onClick: () => editor.chain().focus().addColumnBefore().run() },
    { label: "Столбец справа", title: "Добавить столбец справа", onClick: () => editor.chain().focus().addColumnAfter().run() },
    { label: "Удалить строку", title: "Удалить текущую строку", onClick: () => editor.chain().focus().deleteRow().run(), danger: true },
    { label: "Удалить столбец", title: "Удалить текущий столбец", onClick: () => editor.chain().focus().deleteColumn().run(), danger: true },
    { label: "Удалить таблицу", title: "Удалить всю таблицу", onClick: () => editor.chain().focus().deleteTable().run(), danger: true },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1 px-3 py-1.5 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] shrink-0">
      {actions.map((a) => (
        <button
          key={a.label}
          type="button"
          title={a.title}
          onMouseDown={(e) => { e.preventDefault(); a.onClick(); }}
          className={[
            "px-2 py-1 rounded-md text-xs font-medium transition-colors",
            a.danger
              ? "text-red-500 hover:bg-red-500/10"
              : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)]",
          ].join(" ")}
        >
          {a.label}
        </button>
      ))}
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
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({ inline: false }),
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
          {!variablesEnabled && <InsertFieldSelect editor={editor} />}
          {variablesEnabled && <AddVariableButton editor={editor} />}
          <LetterheadDropdown editor={editor} />
          <InsertImageButton editor={editor} />
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

      {!readOnly && <TableControls editor={editor} />}

      {/* Editor area */}
      <EditorContent
        editor={editor}
        className="flex-1 overflow-y-auto px-8 py-6 prose-editor"
      />
    </div>
  );
}
