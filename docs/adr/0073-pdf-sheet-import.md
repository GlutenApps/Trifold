# ADR 0073 — Import from PDF

**Status:** accepted, 2026-11-23. Builds Part 3, Way 2 of `docs/PLAYER-MODE.md` (import an exported PDF sheet) and the **Import from PDF** start in `docs/BUILDER.md`; amends both where they say a PDF without a form gets only a message.

## Context

Way 2 planned to read a PDF's form fields with a pure JavaScript library, map them by known field names per layout, show a plain message for flattened PDFs, and check the mappings against real exports first. Ian supplied a corpus of 17 sheets, kept out of the repo in `fixtures/local/pdf-sheets/`: his own export from D&D Beyond, filled and blank sheets on the official 2014 field names, a community sheet with dropdown scores, printed-to-PDF and scanned copies, and sheets typeset with no fields at all.

The corpus notes said the current D&D Beyond export has no form fields and would need positional text extraction or OCR. Reading it with pdf.js shows otherwise: the export has no AcroForm dictionary, so a reader that asks the document's form finds nothing, but every page keeps its widget annotations, named (`CLASS  LEVEL`, `AcrobaticsProf`, `spellName0`) and filled (921 of 1,477). The official 2014 field set and the community sheet read the same way. Only the printed, scanned and typeset sheets have nothing to read by name.

## Decision

- **Fields from the pages' widgets.** Main reads the PDF with **pdf.js** (`pdfjs-dist` 6.5.438, Apache-2.0, pure JavaScript), takes every page's widget annotations (name, text or chosen value, check state, rectangle), and never draws a page, runs the PDF's scripts or opens a locked file. Its optional native canvas package is left out of the install (`ignoredOptionalDependencies`). pdf.js is bundled into main and loaded only when a PDF is read.
- **One reader for the field sets the corpus shows**, `readPdfSheet` in `packages/importers/src/pdfSheet/`: a pure function from fields to a sheet, warnings, or a problem. Names match with case and spacing ignored (the 2014 sheet's `Race ` and `DEXmod `). Where a name does not say enough, position does: the mark beside a save or skill, and each spell's level from the nearest level header or slot box above it. The rules are in `DATA-FORMATS.md` §5.8.
- **The page's numbers are kept.** A number the sheet would work out differently (AC, with armour not modelled; a skill with Jack of All Trades; a save with a magic item's bonus) becomes an override on the Trifold sheet, shown as set by hand. A Trifold character made this way has no `build`, so Level up does not apply to it.
- **No text-layer reading or OCR now.** A PDF with no fields (printed to PDF, scanned, typeset) gets a plain message that suggests exporting a fillable sheet or filling a blank one by hand. So do unknown fields, an empty template and a password.
- **The official 2024 sheet** has generic field names (`Text64`, `Check Box37`), the same in every copy. They are translated by a fixed table (`sheet2024.ts`), worked out from a copy filled with each field's own name and checked against a filled sheet's printed page. Its spell rows carry their level, and it lists only cantrips and prepared spells.
- **Preview first.** **Import from PDF** (New character › Trifold character) shows the sheet as it would be, with its warnings, the name and the rules, before **Create character**. On a Trifold character, **Update from PDF…** shows the same preview before **Replace sheet**, keeps the player's notes and drops `build`; the change reaches the GM as any sheet change does (ADR 0071).
- **Linked to the compendium.** After reading, main links the sheet's spells, items, feats, species, background and classes to records by key (`linkSheetRecords`), so a row can show the record's text: opening a linked row on the read-only sheet, or its Read button on the sheet being edited, reads the record then. A link to a record that is gone says so and resolves again when the record is back. A row renamed to another name drops its link. Builder sheets, which were already linked, show their text the same way.
- **Fixtures.** Committed tests build their fields, and the PDFs the extraction test reads, in code with SRD-only content (`smoke/fieldPdf.ts`). The corpus stays local; `pdfFields.local.test.ts` runs it when the folder is there and is skipped in CI. No third-party fixture is committed.

## Consequences

- The current D&D Beyond export, the official 2014 and 2024 sheets, and sheets that reuse their field names import with their numbers, proficiencies, attacks, features, spells, slots, equipment, coins and backstory.
- A printed or scanned sheet still has to be typed in. Reading text by position, and OCR, stay possible later behind the same reader output.
- Coins are summed into gold pieces, as the sheet holds only `gp`.
