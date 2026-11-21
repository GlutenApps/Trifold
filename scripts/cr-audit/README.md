# CR audit

A fight simulation that checks whether a scaled monster, or a horde, fights like a real
monster of the CR it claims (ADR 0051, ADR 0047). It reads only the bundled SRD files in
`resources/` (run `pnpm fetch:content` first).

- `lib.ts` reads a stat block's offence and defence from its text (2014 and 2024 wording), and
  runs a fight against a party of four.
- `reference.ts` is the yardstick: every SRD 5.2 monster fought at every level, 1 to 20. "Fights
  like CR X" means a party of CR X's level loses the share of its hit points that it loses to
  the median real CR X monster.
- `scale.ts` runs the scaler audit: `pnpm tsx scripts/cr-audit/scale.ts [parts to leave out]`.
  It takes about five minutes. Rerun it after any change to `packages/rules/src/crScale.ts`.
- `horde.ts` runs the horde trials.

The model leaves out spells, conditions and Legendary Resistance, and the SRD has few monsters
above CR 12, so read the results as steps on the CR list, give or take one. Real monsters land
within one step of their own CR about 77% of the time.
