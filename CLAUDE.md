# CLAUDE.md — Trifold repo conventions

Trifold is a local Windows desktop app (Electron + React + TypeScript) for a Dungeon Master running 5e (2024 rules) sessions: compendium, campaign notes, encounters and combat tracker, a second-screen presenter, and a music controller. Read `docs/DESIGN.md` for what to build and why, and `docs/DATA-FORMATS.md` for every file format and parsing rule. When the two disagree with this file, `DESIGN.md` wins on product decisions and this file wins on code conventions.

## Ground rules

1. **Local only.** No network calls at runtime except the optional, user-enabled "check for app updates". No cloud services, no telemetry, no accounts. If a task seems to need a server, stop and ask.
2. **Files-first.** All user data lives in the Library folder as JSON + media (`DESIGN.md` §4.2). SQLite is a derived index and must be rebuildable from files at any time. Never store anything only in SQLite. Never write to the Library except through `LibraryStore` in the main process; writes are atomic (temp file → fsync → rename).
3. **Content licensing is a hard constraint.** The repo and the package contain only: SRD 5.1 / 5.2.1 content fetched at build time, open third-party documents the user opts into, game-icons SVGs, and our own text. No non-SRD game text, no WotC art or maps, no community compendium files, no token packs, no links to aggregator sites — not in code, tests, fixtures, screenshots, or comments. The full community XML used for local testing lives outside the repo and is git-ignored (`*.local.xml`, `fixtures/local/`).
4. **No WotC trademarks** in the app name, window titles, UI chrome, README or package metadata. Say "5e-compatible". Book names appear only as imported data or SRD attribution.
5. **Lenient importers.** Unknown XML elements are preserved, missing fields warn, nothing throws on a single bad record. Every convention in `DATA-FORMATS.md` §2 has a unit test with a fixture that uses SRD-only content.
6. **Never lose user data.** Autosave on change, daily backup zip, schema versions on every file with forward migrations in `packages/schema/migrations`.
7. **Ask before widening scope.** The one-shot cut (M1 in `DESIGN.md` §10) is the priority. Anything not in M1 goes behind a feature flag or waits.

## Stack (pin versions in package.json; do not add native deps beyond better-sqlite3 without asking)

Electron (current LTS) · electron-builder (NSIS + portable) · Vite · React 18 · TypeScript strict · Zustand · Zod · better-sqlite3 (FTS5) · music-metadata · ulid · Vitest + @testing-library/react · Playwright (Electron) for smoke tests · ESLint + Prettier.

## Repo layout

```
apps/desktop/            Electron main + preload + renderer (two routes: /console, /player)
  src/main/              library store, sqlite index, importers, windows, audio device enum, backups, ipc handlers
  src/preload/           typed bridge → window.trifold (generated from packages/api)
  src/renderer/          React app: features/{shell,library,compendium,campaign,encounters,presenter,music,dice,settings}; shell = top bar + stage (tab groups) + dock + live strip (ADR 0004)
packages/schema/         Zod schemas + TS types for every stored object; migrations
packages/api/            the single TypeScript interface between renderer and main
packages/rules/          pure functions: dice, CR/XP tables, 2024 budgets, condition defs, damage math, parsers (regexes from DATA-FORMATS.md §2.5)
packages/importers/      xml (compendium, campaign, GM export), open5e (build-time), art-matching
resources/               built at build time: srd-2024.jsonl, srd-2014.jsonl, srd-manifest.json, icons/ (svgs, credits.json, mapping.json)
scripts/                 fetch-open5e.ts, fetch-game-icons.ts, build-credits.ts, verify-mapping.ts
fixtures/                small SRD-only XML/JSON samples used by tests
docs/                    DESIGN.md, DATA-FORMATS.md, ADRs
```

Rules of thumb: all parsing and rules math lives in `packages/*` as pure, tested functions; the renderer never imports `fs`, `sqlite`, or `electron` directly; the player window is a pure view of state pushed from the console.

## Commands

`pnpm i` · `pnpm dev` (console + player windows, hot reload) · `pnpm test` (Vitest) · `pnpm typecheck` · `pnpm lint` · `pnpm fetch:content` (Open5e snapshot + game-icons; requires network; commits nothing but `resources/*-manifest.json`) · `pnpm build` (electron-builder → `dist/`) · `pnpm smoke` (Playwright: launch, create Library, import fixture, open player window, run a 3-round mock combat).

## Conventions

- **IDs:** ULIDs. **Keys:** `normalizeKey(name)` = lowercase, strip `[…]`/`(…)` edition tags, strip punctuation, collapse spaces. One implementation in `packages/rules`.
- **Dates:** ISO 8601 UTC strings on disk; `Date` only at the edges.
- **Errors:** importers return `{ records, warnings }`; UI surfaces warnings on the source page. Main-process failures are logged to `Library/logs/` and shown as a toast, never a silent no-op.
- **Performance budgets** (`DESIGN.md` §9) are tests: search < 50 ms on the 5,000-monster fixture set, index rebuild < 10 s on a 31 MB XML, player-window frame updates ≤ 16 ms.
- **UI:** dark theme default; sentence case; every table-time action has a hotkey registered in one `hotkeys.ts`; no modal dialogs during combat. Features render inside workspace panels (ADR 0003): no page-level `h1`, stretch to the panel body, scroll inside it; a control lives in one home (tray or panel), and where it must appear in both, the accessible names differ. Colours come from the tokens in `global.css`, never literals. Keep it compact: 13 px base type, 30 px buttons, 28 px icon buttons (`chrome-btn`, 22 px `xs` for row actions); prefer an icon toolbar with a `title` tooltip and an `aria-label` over a row of text buttons, and reveal per-row actions on hover/selection rather than always.
- **Audio:** one `AudioContext`; per-layer and per-track gain nodes; every transition through a ramp (`linearRampToValueAtTime` on an equal-power curve). Never call `stop()` without a fade.
- **Presenter:** state lives in the console's Zustand store; IPC to main; broadcast to player. The player window never mutates state or reads the Library.
- **Tests:** a convention from `DATA-FORMATS.md` is not done until a fixture exercises it (hp/ac/speed/save formats, recharge codes, bonus-action suffix, legendary header + lair, attack triples incl. blank to-hit and compound dice, both attack regexes, both save regexes, Source line parsing, `[5.5e]` tagging, edition collapse, slots parsing, Proficiency Bonus trait extraction).
- **Commits:** conventional commits (`feat(presenter): …`). One feature per PR; PR description lists which `DESIGN.md` section it implements.
- **ADRs:** any deviation from `DESIGN.md` gets a short ADR in `docs/adr/` and a note in the decision log table.

## Definition of done for M1

Every item in `DESIGN.md` §10 M1 works end to end on Windows 11 with a second display; the acceptance test there passes; `pnpm test`, `typecheck`, `lint`, `smoke` are green; the installer runs on a clean machine; About page shows SRD and game-icons attribution; no non-SRD content anywhere in the repo or package.

## When unsure

Prefer the simpler, local, file-based option. If a format detail is marked **(verify)** in `DATA-FORMATS.md`, write the parser to tolerate both plausible shapes and ask the DM for a real file rather than guessing silently. Do not invent game content, book names, or license texts; use the exact SRD attribution text from the SRD documents fetched at build time.
