/**
 * The inline confirm (UI guidelines §9): a row's actions become one line, a muted question,
 * then the action and Keep. Keep or Escape cancels; Keep takes focus, so Enter never confirms
 * by accident. No dialogs. `verb` names the action ("Delete", "Remove", "Restore"); `question`
 * replaces the visible "Verb name?" when the consequence needs saying.
 */
export function InlineConfirm({
  name,
  verb = 'Delete',
  question,
  onConfirm,
  onKeep,
}: {
  name: string;
  verb?: string;
  question?: string;
  onConfirm(): void;
  onKeep(): void;
}) {
  return (
    <span
      className="inline-confirm"
      role="group"
      aria-label={`${verb} ${name}?`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onKeep();
        }
      }}
    >
      <span className="muted small inline-confirm-text">{question ?? `${verb} ${name}?`}</span>
      <button type="button" className="btn small danger" onClick={onConfirm}>
        {verb}
      </button>
      <button type="button" className="btn small" autoFocus onClick={onKeep}>
        Keep
      </button>
    </span>
  );
}
