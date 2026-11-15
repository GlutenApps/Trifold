import { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { Markdown } from '@tiptap/markdown';

/**
 * Markdown shown, not edited: a rule's text (ADR 0041) with its headings, lists, bold and
 * tables. The same Tiptap markdown reader the notes editor uses (ADR 0010), read-only, so no
 * second markdown library joins the app.
 */
export function MarkdownView({ markdown }: { markdown: string }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Table,
      TableRow,
      TableHeader,
      TableCell,
      Markdown,
    ],
    content: markdown,
    contentType: 'markdown',
    editable: false,
    editorProps: { attributes: { class: 'markdown-view prose' } },
  });
  // A different record opened in the same place shows its own text.
  useEffect(() => {
    if (editor && !editor.isDestroyed)
      editor.commands.setContent(markdown, { contentType: 'markdown' });
  }, [editor, markdown]);
  return <EditorContent editor={editor} data-testid="markdown-view" />;
}
