import { useEffect, useRef } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Image } from '@tiptap/extension-image';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { Markdown } from '@tiptap/markdown';
import { hk } from '../../platform';
import { Icon, type IconName } from '../shell/icons';
import { SearchHighlight } from './searchHighlight';

/**
 * The Tiptap editor behind every note and template body (ADR 0010): markdown in, markdown out,
 * so note files stay readable in any editor. The SearchHighlight extension from
 * searchHighlight.ts draws the notes panel's search hit; `NoteEditor` below has the toolbar and
 * the rule that opening a note never writes it.
 */
export interface Highlight {
  phrase: string;
  /** Which occurrence to show, counting from 0 in reading order. */
  active: number;
}

/**
 * The note body: formatted text in, markdown out (ADR 0010). The toolbar covers what a prep
 * note needs; typing markdown prefixes (`# `, `- `, `1. `, `> `, `[ ] `) still works for anyone
 * with the habit. A search highlight from the notes panel is shown and scrolled into view.
 */
export function NoteEditor({
  markdown,
  onChange,
  highlight = null,
  autoFocus = false,
}: {
  markdown: string;
  onChange(markdown: string): void;
  highlight?: Highlight | null;
  autoFocus?: boolean;
}) {
  // What the editor last handed back (or made of the file on load): opening a note must never
  // write it, and a transaction that leaves the markdown as it was is not a change.
  const known = useRef<string | null>(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table,
      TableRow,
      TableHeader,
      TableCell,
      Image,
      Markdown,
      SearchHighlight,
    ],
    content: markdown,
    contentType: 'markdown',
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: { class: 'note-body prose', 'aria-label': 'Body', role: 'textbox' },
    },
    onCreate: ({ editor: ed }) => {
      known.current = ed.getMarkdown().replace(/\s+$/, '');
    },
    onUpdate: ({ editor: ed, transaction }) => {
      if (!transaction.docChanged || known.current === null) return;
      const next = ed.getMarkdown().replace(/\s+$/, '');
      if (next === known.current) return;
      known.current = next;
      onChange(next);
    },
  });

  const active = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      bold: ed.isActive('bold'),
      italic: ed.isActive('italic'),
      strike: ed.isActive('strike'),
      h1: ed.isActive('heading', { level: 1 }),
      h2: ed.isActive('heading', { level: 2 }),
      h3: ed.isActive('heading', { level: 3 }),
      bulletList: ed.isActive('bulletList'),
      orderedList: ed.isActive('orderedList'),
      taskList: ed.isActive('taskList'),
      blockquote: ed.isActive('blockquote'),
    }),
  });

  useEffect(() => {
    if (!editor) return;
    editor.commands.setSearchHighlight(highlight?.phrase ?? '', highlight?.active ?? 0);
    if (highlight?.phrase) {
      editor.view.dom.querySelector('.search-hit.active')?.scrollIntoView({ block: 'center' });
    }
  }, [editor, highlight?.phrase, highlight?.active]);

  if (!editor) return null;
  const chain = () => editor.chain().focus();

  const button = (
    label: string,
    on: boolean,
    run: () => void,
    icon: IconName | null,
    text?: string,
    shortcut?: string,
  ) => (
    <button
      type="button"
      className={`chrome-btn xs${on ? ' on' : ''}`}
      aria-label={label}
      aria-pressed={on}
      title={shortcut ? `${label} (${hk(shortcut)})` : label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      {icon ? <Icon name={icon} /> : <span className="toolbar-text">{text}</span>}
    </button>
  );

  return (
    <div className="note-editor">
      <div className="note-toolbar" role="toolbar" aria-label="Formatting">
        {button('Bold', active.bold, () => chain().toggleBold().run(), 'bold', undefined, 'Ctrl+B')}
        {button(
          'Italic',
          active.italic,
          () => chain().toggleItalic().run(),
          'italic',
          undefined,
          'Ctrl+I',
        )}
        {button(
          'Strikethrough',
          active.strike,
          () => chain().toggleStrike().run(),
          'strike',
          undefined,
          'Ctrl+Shift+S',
        )}
        <span className="toolbar-gap" />
        {button(
          'Heading 1',
          active.h1,
          () => chain().toggleHeading({ level: 1 }).run(),
          null,
          'H1',
        )}
        {button(
          'Heading 2',
          active.h2,
          () => chain().toggleHeading({ level: 2 }).run(),
          null,
          'H2',
        )}
        {button(
          'Heading 3',
          active.h3,
          () => chain().toggleHeading({ level: 3 }).run(),
          null,
          'H3',
        )}
        <span className="toolbar-gap" />
        {button('Bulleted list', active.bulletList, () => chain().toggleBulletList().run(), 'list')}
        {button(
          'Numbered list',
          active.orderedList,
          () => chain().toggleOrderedList().run(),
          'listOrdered',
        )}
        {button('Checklist', active.taskList, () => chain().toggleTaskList().run(), 'checklist')}
        <span className="toolbar-gap" />
        {button('Quote', active.blockquote, () => chain().toggleBlockquote().run(), 'quote')}
        {button('Divider', false, () => chain().setHorizontalRule().run(), 'rule')}
      </div>
      <EditorContent editor={editor} className="note-editor-body" />
    </div>
  );
}
