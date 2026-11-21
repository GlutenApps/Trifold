import type { ReactNode } from 'react';

/**
 * The building blocks of Library › Settings (ADR 0054): one column of sections, each a heading
 * and a list of setting rows. A row is the setting's name and a line on what it does, with its
 * control beside it from 640 px and under it below (ADR 0014). Sections carry an id for the
 * page's jump links and, where another screen deep-links to them, a `data-nav` key.
 */

export interface SettingsSectionInfo {
  id: string;
  title: string;
}

export function SettingsSection({
  id,
  title,
  nav,
  testId,
  children,
}: {
  id: string;
  title: string;
  /** A `navigate` landing key (`landOn`), for sections other screens point at. */
  nav?: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={`settings-${id}`}
      className="settings-section"
      aria-labelledby={`settings-${id}-title`}
      data-nav={nav}
      data-testid={testId}
    >
      <h2 id={`settings-${id}-title`}>{title}</h2>
      <div className="settings-rows">{children}</div>
    </section>
  );
}

export function SettingRow({
  label,
  hint,
  htmlFor,
  status,
  children,
  below,
}: {
  /** The setting's name. With `htmlFor` it is the control's label. */
  label: string;
  /** One or two plain sentences on what the setting does. */
  hint?: ReactNode;
  htmlFor?: string;
  /** A state line under the hint (last copied, index working), muted and small. */
  status?: ReactNode;
  /** The setting's controls. */
  children?: ReactNode;
  /** Full-width content under the row: a list, a confirmation. */
  below?: ReactNode;
}) {
  return (
    <div className="setting-row">
      <div className="setting-text">
        {htmlFor ? (
          <label className="setting-name" htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <span className="setting-name">{label}</span>
        )}
        {hint && <p className="muted small setting-hint">{hint}</p>}
        {status}
      </div>
      {children && <div className="setting-control">{children}</div>}
      {below && <div className="setting-below">{below}</div>}
    </div>
  );
}

/** Jump links to each section, for the long page; shown from 640 px. */
export function SettingsJump({ sections }: { sections: readonly SettingsSectionInfo[] }) {
  return (
    <nav className="settings-jump" aria-label="Settings sections">
      {sections.map((s) => (
        <button
          key={s.id}
          type="button"
          className="btn small ghost"
          onClick={() =>
            document
              .getElementById(`settings-${s.id}`)
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        >
          {s.title}
        </button>
      ))}
    </nav>
  );
}
