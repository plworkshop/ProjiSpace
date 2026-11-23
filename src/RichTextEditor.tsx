import { t } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link2,
  Unlink,
  Quote,
  Undo2,
  Redo2,
  RemoveFormatting,
  Check,
  X,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { editorContent, sanitizeDescription } from "./description";
import { EditorVoiceDictation } from "./VoiceDictation";

export default function RichTextEditor({
  text,
  html,
  onChange,
  disabled = false,
  autoFocus = false,
  onExpand,
  expanded = false,
}: {
  text: string;
  html: string | null;
  onChange: (text: string, html: string | null) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  onExpand?: () => void;
  expanded?: boolean;
}) {
  const wasExpanded = useRef(expanded);
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState("");
  const [linkError, setLinkError] = useState("");
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
        link: {
          openOnClick: false,
          HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
        },
      }),
    ],
    content: editorContent(text, html),
    autofocus: autoFocus ? "start" : false,
    editorProps: {
      attributes: {
        role: "textbox",
        dir: "auto",
        "aria-label": t("Описание проекта"),
        "aria-multiline": "true",
        class: "rich-document",
      },
    },
    onUpdate: ({ editor }) => {
      const text = editor.getText({ blockSeparator: "\n\n" });
      onChange(text, text ? sanitizeDescription(editor.getHTML()) : null);
    },
  });
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      empty: e?.isEmpty ?? true,
      bold: !!e?.isActive("bold"),
      italic: !!e?.isActive("italic"),
      underline: !!e?.isActive("underline"),
      bullet: !!e?.isActive("bulletList"),
      ordered: !!e?.isActive("orderedList"),
      quote: !!e?.isActive("blockquote"),
      link: !!e?.isActive("link"),
      heading: e?.isActive("heading", { level: 1 })
        ? "1"
        : e?.isActive("heading", { level: 2 })
          ? "2"
          : "p",
      undo: !!e?.can().undo(),
      redo: !!e?.can().redo(),
    }),
  });
  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);
  useEffect(() => {
    if (editor && wasExpanded.current !== expanded) {
      wasExpanded.current = expanded;
      editor.commands.focus();
    }
  }, [editor, expanded]);
  if (!editor)
    return <div className="editor-loading">{t("Загрузка редактора…")}</div>;
  const tools = [
    {
      label: t("Жирный"),
      shortcut: "Ctrl+B",
      icon: Bold,
      active: state?.bold,
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: t("Курсив"),
      shortcut: "Ctrl+I",
      icon: Italic,
      active: state?.italic,
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: t("Подчёркнутый"),
      shortcut: "Ctrl+U",
      icon: Underline,
      active: state?.underline,
      run: () => editor.chain().focus().toggleUnderline().run(),
    },
    {
      label: t("Маркированный список"),
      icon: List,
      active: state?.bullet,
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: t("Нумерованный список"),
      icon: ListOrdered,
      active: state?.ordered,
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: t("Цитата"),
      icon: Quote,
      active: state?.quote,
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      label: t("Ссылка"),
      icon: Link2,
      active: state?.link,
      run: () => {
        setHref(editor.getAttributes("link").href || "");
        setLinkError("");
        setLinkOpen((v) => !v);
      },
    },
    {
      label: t("Убрать форматирование"),
      icon: RemoveFormatting,
      run: () => editor.chain().focus().unsetAllMarks().clearNodes().run(),
    },
  ];
  function applyLink() {
    try {
      const value = href.trim();
      const url = new URL(
        /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`,
      );
      if (
        !value ||
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error();
      if (editor!.state.selection.empty && !editor!.isActive("link")) {
        editor!
          .chain()
          .focus()
          .insertContent({
            type: "text",
            text: value,
            marks: [{ type: "link", attrs: { href: url.href } }],
          })
          .run();
      } else
        editor!
          .chain()
          .focus()
          .extendMarkRange("link")
          .setLink({ href: url.href })
          .run();
      setLinkOpen(false);
    } catch {
      setLinkError(t("Укажите корректную ссылку HTTP или HTTPS."));
    }
  }
  return (
    <div className={`rich-editor ${state?.empty ? "is-empty" : ""}`}>
      <div
        className="rich-toolbar"
        role="group"
        aria-label={t("Форматирование текста")}
      >
        <select
          aria-label={t("Стиль текста")}
          value={state?.heading || "p"}
          disabled={disabled}
          onChange={(e) => {
            if (e.target.value === "p")
              editor.chain().focus().setParagraph().run();
            else
              editor
                .chain()
                .focus()
                .setHeading({ level: Number(e.target.value) as 1 | 2 })
                .run();
          }}
        >
          <option value="p">{t("Текст")}</option>
          <option value="1">{t("Заголовок 1")}</option>
          <option value="2">{t("Заголовок 2")}</option>
        </select>
        {tools.map((tool) => (
          <button
            key={tool.label}
            type="button"
            title={`${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ""}`}
            aria-label={tool.label}
            aria-pressed={tool.active}
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={tool.run}
          >
            <tool.icon size={16} aria-hidden="true" />
          </button>
        ))}
        <EditorVoiceDictation
          disabled={disabled}
          insert={(value) =>
            editor
              .chain()
              .focus()
              .insertContentAt(
                editor.state.selection.to,
                value.split(/\n+/).map((line) => ({
                  type: "paragraph",
                  content: [{ type: "text", text: line }],
                })),
              )
              .run()
          }
        />
        <span className="rich-toolbar-divider" />
        <button
          type="button"
          aria-label={t("Отменить действие")}
          title={t("Отменить (Ctrl+Z)")}
          disabled={disabled || !state?.undo}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 size={16} />
        </button>
        <button
          type="button"
          aria-label={t("Повторить действие")}
          title={t("Повторить (Ctrl+Shift+Z)")}
          disabled={disabled || !state?.redo}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 size={16} />
        </button>
        <div className="rich-toolbar-end">
          {onExpand && (
            <button
              type="button"
              className="rich-expand"
              aria-label={
                expanded ? t("Свернуть описание") : t("Развернуть описание")
              }
              title={
                expanded ? t("Свернуть описание") : t("Развернуть описание")
              }
              aria-expanded={expanded}
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={onExpand}
            >
              {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          )}
        </div>
      </div>
      {linkOpen && (
        <div
          className="rich-link-form"
          role="group"
          aria-label={t("Настройка ссылки")}
        >
          <input
            autoFocus
            type="url"
            aria-label={t("Адрес ссылки")}
            placeholder="https://example.com"
            value={href}
            disabled={disabled}
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setLinkOpen(false);
                editor.commands.focus();
              }
            }}
          />
          <button
            type="button"
            aria-label={t("Применить ссылку")}
            disabled={disabled}
            onClick={applyLink}
          >
            <Check size={16} />
          </button>
          <button
            type="button"
            aria-label={t("Удалить ссылку")}
            disabled={disabled || !state?.link}
            onClick={() => {
              editor.chain().focus().extendMarkRange("link").unsetLink().run();
              setLinkOpen(false);
            }}
          >
            <Unlink size={16} />
          </button>
          <button
            type="button"
            aria-label={t("Закрыть настройку ссылки")}
            onClick={() => {
              setLinkOpen(false);
              editor.commands.focus();
            }}
          >
            <X size={16} />
          </button>
          {linkError && (
            <p className="error" role="alert">
              {linkError}
            </p>
          )}
        </div>
      )}
      <EditorContent editor={editor} className="rich-editor-content" />
    </div>
  );
}
