import type { ReactNode } from 'react';
import { Icon, type IconName } from '../shell/icons';

/**
 * The building blocks of Library › Settings (ADR 0054): one column of sections, each a heading
 * and a list of setting rows. A row is the setting's name and a line on what it does, with its
 * control beside it from 640 px and under it below (ADR 0014). Each section is a card with an
 * icon and its title in a header bar, so the page reads as separate groups. Sections other screens
 * deep-link to carry a `data-nav` key.
 */

export function SettingsSection({
  id,
  title,
  icon,
  nav,
  testId,
  children,
}: {
  id: string;
  title: string;
  icon: IconName;
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
      <header className="settings-section-head">
        <Icon name={icon} />
        <h2 id={`settings-${id}-title`}>{title}</h2>
      </header>
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
