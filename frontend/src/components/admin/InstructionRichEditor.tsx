import { useEffect } from "react";
import { RichTextEditor } from "@mantine/tiptap";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";

interface InstructionRichEditorProps {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
}

/**
 * Tiptap editor obal pro návody (1:1 z crm-mvp). Whitelist obsahu drží pevně
 * malou množinu formátů (nadpisy, odstavce, tučně, kurzíva, seznamy, odkaz).
 * Output je HTML, sanitizace probíhá až při tisku přes DOMPurify
 * v PrintDeclarationPage.
 *
 * Editor je controlled — `value` přepíše obsah, ale jen pokud se reálně liší
 * od aktuálního, aby se nezhodil cursor při každém keystroku.
 */
export default function InstructionRichEditor({
  value,
  onChange,
  disabled,
}: InstructionRichEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer" },
      }),
    ],
    content: value,
    editable: !disabled,
    onUpdate({ editor: ed }) {
      onChange(ed.getHTML());
    },
  });

  // Sync external `value` → editor (např. po načtení z DB).
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== value) {
      editor.commands.setContent(value || "", false);
    }
  }, [value, editor]);

  // Sync `disabled` → editor.
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  return (
    <>
      {/* Vnitřní ProseMirror element (.tiptap) je editovatelná oblast, ale
          defaultně má jen výšku obsahu — min-height a padding přímo na ní,
          aby celá viditelná plocha byla aktivní pro fokus a typing. */}
      <style>{`
        .instruction-rte .tiptap.ProseMirror {
          min-height: 320px;
          padding: 12px 14px;
          cursor: text;
          font-size: 14px;
          line-height: 1.5;
          outline: none;
        }
        .instruction-rte .tiptap.ProseMirror:focus {
          outline: none;
        }
      `}</style>
      <RichTextEditor editor={editor} className="instruction-rte">
        <RichTextEditor.Toolbar sticky stickyOffset={0}>
          <RichTextEditor.ControlsGroup>
            <RichTextEditor.Bold />
            <RichTextEditor.Italic />
            <RichTextEditor.Underline />
            <RichTextEditor.Strikethrough />
            <RichTextEditor.ClearFormatting />
          </RichTextEditor.ControlsGroup>

          <RichTextEditor.ControlsGroup>
            <RichTextEditor.H1 />
            <RichTextEditor.H2 />
            <RichTextEditor.H3 />
          </RichTextEditor.ControlsGroup>

          <RichTextEditor.ControlsGroup>
            <RichTextEditor.BulletList />
            <RichTextEditor.OrderedList />
          </RichTextEditor.ControlsGroup>

          <RichTextEditor.ControlsGroup>
            <RichTextEditor.Link />
            <RichTextEditor.Unlink />
          </RichTextEditor.ControlsGroup>

          <RichTextEditor.ControlsGroup>
            <RichTextEditor.Undo />
            <RichTextEditor.Redo />
          </RichTextEditor.ControlsGroup>
        </RichTextEditor.Toolbar>

        <RichTextEditor.Content />
      </RichTextEditor>
    </>
  );
}
