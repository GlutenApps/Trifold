import { useCallback, useEffect, useRef, useState } from 'react';
import type { NoteTemplate } from '@trifold/schema';
import { blankTemplate, useNoteTemplateStore } from '../../stores/noteTemplateStore';
import { Icon } from '../shell/icons';
import { AUTOSAVE_MS } from './autosave';
import { NoteEditor } from './NoteEditor';

/** A template's name and body, saved shortly after the last change and on close. */
function TemplateEditor({ template }: { template: NoteTemplate }) {
  const save = useNoteTemplateStore((s) => s.save);
  const remove = useNoteTemplateStore((s) => s.remove);
  const [name, setName] = useState(template.name);
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const latest = useRef(template);
  latest.current = template;
  const pending = useRef<Partial<Pick<NoteTemplate, 'name' | 'body'>> | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const nameRef = useRef<HTMLInputElement>(null);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const patch = pending.current;
    if (!patch) return;
    pending.current = null;
    setDirty(false);
    void save({
      ...latest.current,
      ...patch,
      name: (patch.name ?? latest.current.name).trim() || latest.current.name,
    });
  }, [save]);
  useEffect(() => flush, [flush]);

  const update = (patch: Partial<Pick<NoteTemplate, 'name' | 'body'>>) => {
    pending.current = { ...pending.current, ...patch };
    setDirty(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, AUTOSAVE_MS);
  };

  // A template made a moment ago has a placeholder name: select it so typing replaces it.
  const fresh = Date.now() - Date.parse(template.createdAt) < 5000;
  useEffect(() => {
    if (fresh) nameRef.current?.select();
  }, [fresh]);

  return (
    <>
      <div className="row note-head">
        <input
          ref={nameRef}
          className="note-title"
          aria-label="Template name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            update({ name: e.target.value });
          }}
          onBlur={flush}
        />
        <span className="muted small note-status" aria-live="polite">
          {dirty ? 'Unsaved' : 'Saved'}
        </span>
        {confirm ? (
          <>
            <button
              type="button"
              className="btn small danger"
              onClick={() => void remove(template.id)}
            >
              Delete {template.name}
            </button>
            <button type="button" className="btn small" onClick={() => setConfirm(false)}>
              Keep it
            </button>
          </>
        ) : (
          <button
            type="button"
            className="chrome-btn xs danger"
            aria-label={`Delete template ${template.name}`}
            title="Delete template"
            onClick={() => setConfirm(true)}
          >
            <Icon name="trash" size={13} />
          </button>
        )}
      </div>
      <NoteEditor
        key={template.id}
        markdown={template.body}
        onChange={(markdown) => update({ body: markdown })}
      />
    </>
  );
}

/**
 * Where templates are made and edited (ADR 0010): pick one from the row of names, change its
 * name and body, add or delete. Templates belong to the Library, not the campaign.
 */
export function TemplatesPane({
  initialId = null,
  onDone,
}: {
  initialId?: string | null;
  onDone(): void;
}) {
  const templates = useNoteTemplateStore((s) => s.templates);
  const save = useNoteTemplateStore((s) => s.save);
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const selected = templates.find((t) => t.id === selectedId) ?? templates[0] ?? null;

  const add = async () => {
    const saved = await save(blankTemplate());
    if (saved) setSelectedId(saved.id);
  };

  return (
    <div className="notes-pane templates-pane" data-testid="templates-pane">
      <div className="row">
        <strong>Templates</strong>
        <span className="muted small">Starting points for new notes, in every campaign.</span>
        <span className="spacer" />
        <button
          type="button"
          className="chrome-btn primary"
          aria-label="New template"
          title="New template"
          onClick={() => void add()}
        >
          <Icon name="plus" size={16} />
        </button>
        <button type="button" className="btn small" onClick={onDone}>
          Done
        </button>
      </div>
      {templates.length === 0 ? (
        <p className="muted">No templates. Add one, or save an open note as a template.</p>
      ) : (
        <div className="template-chips" role="tablist" aria-label="Templates">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              className={`subtab${t.id === selected?.id ? ' active' : ''}`}
              aria-selected={t.id === selected?.id}
              onClick={() => setSelectedId(t.id)}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
      {selected && <TemplateEditor key={selected.id} template={selected} />}
    </div>
  );
}
