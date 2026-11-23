import type { CompendiumRecord } from '@trifold/schema';
import { copyKeyOf, duplicateGroupKey } from '@trifold/rules';
import { useAppStore } from '../../stores/appStore';
import { chooseCopy } from '../settings/DuplicatesView';
import { Icon } from '../shell/icons';

/**
 * Always use this copy (ADR 0063), on a record's page when the record is in more than one file
 * or book: makes this copy the one shown for it, wherever it appears, until the GM changes it
 * here or on the Duplicates tab. Pressed again, the record goes back to the usual order.
 */
export function UseThisCopy({
  record,
  copies,
}: {
  record: CompendiumRecord;
  /** Every copy of the record, every edition, as the edition switch lists them. */
  copies: readonly CompendiumRecord[];
}) {
  const choices = useAppStore((s) => s.library?.settings?.duplicateChoices);
  const mine = copyKeyOf(record);
  // Another place: another file, or another book in this file. Editions alone do not count.
  const place = (r: CompendiumRecord) => `${r.sourceId}|${r.sourceBook ?? ''}`;
  const elsewhere = copies.some((c) => c.id !== record.id && place(c) !== place(record));
  if (!elsewhere || record.sourceId.startsWith('campaign:')) return null;
  const chosen = choices?.[duplicateGroupKey(record.kind, record.key)] === mine;
  return (
    <button
      type="button"
      className={`chrome-btn${chosen ? ' on' : ''}`}
      aria-label="Always use this copy"
      aria-pressed={chosen}
      title={
        chosen
          ? `This copy of ${record.displayName} is always shown. Click to go back to the usual order`
          : `Always show this copy of ${record.displayName}, over its copies in other files and books`
      }
      onClick={() => void chooseCopy(record.kind, record.key, chosen ? null : mine)}
    >
      <Icon name="pin" />
    </button>
  );
}
