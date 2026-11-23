import { useState } from 'react';
import { ABILITY_NAMES } from '@trifold/rules';
import { SheetUrl, type Ability, type Character, type TableNumbers } from '@trifold/schema';
import { useCharacterStore } from '../../stores/characterStore';
import { NumField } from './fields';

/**
 * An External character (PLAYER-MODE.md, Way 1; ADR 0068): the sheet lives in another app, so
 * the player enters the table numbers a GM's PC card takes, and a link to the sheet. It can
 * become a Trifold character, starting from these numbers; not the reverse.
 */

const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export function ExternalForm({ character }: { character: Character }) {
  const change = useCharacterStore((s) => s.change);
  const makeTrifold = useCharacterStore((s) => s.makeTrifold);
  const [link, setLink] = useState(character.sheetUrl ?? '');
  const [asking, setAsking] = useState(false);
  const n = character.numbers;
  const id = character.id;
  const set = (patch: Partial<TableNumbers>) => change(id, { numbers: { ...n, ...patch } });
  const linkOk = link.trim() === '' || SheetUrl.safeParse(link.trim()).success;

  return (
    <div className="character-body" data-testid="external-form">
      <section className="sheet-section" aria-label="Table numbers">
        <h2>Table numbers</h2>
        <p className="muted small">
          What your GM’s PC card shows. Copy them from your sheet; when they change, your GM is
          offered the new ones.
        </p>
        <div className="sheet-grid">
          <label className="field">
            Class
            <input
              type="text"
              aria-label="Class"
              placeholder="Fighter 3 / Rogue 2"
              maxLength={80}
              value={n.classText}
              onChange={(e) => set({ classText: e.target.value })}
            />
          </label>
          <label className="field">
            Level
            <NumField
              label="Level"
              value={n.level}
              min={1}
              max={20}
              onChange={(v) => v && set({ level: v })}
            />
          </label>
          <label className="field">
            Max HP
            <NumField
              label="Max HP"
              value={n.maxHp}
              min={1}
              max={999}
              onChange={(v) => v && set({ maxHp: v })}
            />
          </label>
          <label className="field">
            AC
            <NumField
              label="AC"
              value={n.ac}
              min={0}
              max={40}
              onChange={(v) => v !== undefined && set({ ac: v })}
            />
          </label>
          <label className="field">
            Initiative bonus
            <NumField
              label="Initiative bonus"
              value={n.initiativeBonus}
              min={-10}
              max={20}
              onChange={(v) => v !== undefined && set({ initiativeBonus: v })}
            />
          </label>
          <label className="field">
            Speed
            <NumField
              label="Speed"
              value={n.speed}
              min={0}
              max={200}
              onChange={(v) => v !== undefined && set({ speed: v })}
            />
          </label>
          <label className="field">
            Passive Perception
            <NumField
              label="Passive Perception"
              value={n.passives.perception}
              min={1}
              max={40}
              onChange={(v) => v && set({ passives: { ...n.passives, perception: v } })}
            />
          </label>
          <label className="field">
            Passive Insight
            <NumField
              label="Passive Insight"
              value={n.passives.insight}
              min={1}
              max={40}
              onChange={(v) => v && set({ passives: { ...n.passives, insight: v } })}
            />
          </label>
          <label className="field">
            Passive Investigation
            <NumField
              label="Passive Investigation"
              value={n.passives.investigation}
              min={1}
              max={40}
              onChange={(v) => v && set({ passives: { ...n.passives, investigation: v } })}
            />
          </label>
          <label className="field">
            Spell save DC
            <NumField
              label="Spell save DC"
              value={n.spellSaveDc}
              min={1}
              max={40}
              optional
              onChange={(v) => {
                const { spellSaveDc: _old, ...rest } = n;
                change(id, { numbers: v === undefined ? rest : { ...rest, spellSaveDc: v } });
              }}
            />
          </label>
        </div>
        <h3>Saving throws</h3>
        <div className="sheet-grid">
          {ABILITIES.map((a) => (
            <label key={a} className="field">
              {ABILITY_NAMES[a]}
              <NumField
                label={`${ABILITY_NAMES[a]} save`}
                value={n.saves[a]}
                min={-10}
                max={30}
                optional
                onChange={(v) => {
                  const saves = { ...n.saves };
                  if (v === undefined) delete saves[a];
                  else saves[a] = v;
                  set({ saves });
                }}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="sheet-section" aria-label="Character sheet link">
        <h2>Character sheet link</h2>
        <p className="muted small">The web address of your sheet. It opens in a web tab.</p>
        <input
          type="url"
          className="wide-input"
          aria-label="Character sheet link"
          placeholder="https://"
          value={link}
          onChange={(e) => {
            const next = e.target.value;
            setLink(next);
            const t = next.trim();
            if (t === '') change(id, { sheetUrl: undefined });
            else if (SheetUrl.safeParse(t).success) change(id, { sheetUrl: t });
          }}
        />
        {!linkOk && (
          <p className="small join-problem" role="alert">
            A web address starts with http:// or https://.
          </p>
        )}
      </section>

      <section className="sheet-section" aria-label="Notes">
        <h2>Notes</h2>
        <textarea
          aria-label="Notes"
          rows={4}
          value={character.notes}
          onChange={(e) => change(id, { notes: e.target.value })}
        />
      </section>

      <section className="sheet-section" aria-label="Make it a Trifold character">
        <h2>Keep the sheet in Trifold</h2>
        {asking ? (
          <div className="row wraps" role="group" aria-label="Make it a Trifold character?">
            <span className="small">
              The sheet starts from these numbers, kept as they are until you fill it in. This
              cannot be undone: a Trifold character stays one.
            </span>
            <button type="button" className="btn primary" onClick={() => makeTrifold(id)}>
              Make it a Trifold character
            </button>
            <button type="button" className="btn" onClick={() => setAsking(false)}>
              Keep it External
            </button>
          </div>
        ) : (
          <>
            <p className="muted small">
              A Trifold character has its whole sheet here, and works out these numbers from it.
            </p>
            <button type="button" className="btn" onClick={() => setAsking(true)}>
              Make it a Trifold character…
            </button>
          </>
        )}
      </section>
    </div>
  );
}
