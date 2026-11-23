# ADR 0061 — Books are the unit; starred books replace the source order

**Status:** accepted, 2026-11-23. Supersedes the DM-ordered list of ADR 0027; its default order stays.

## Context

Library › Compendium › Sources listed files, and a GM ordered them by dragging to decide which copy of a record answers. Files are how content arrives, not how a GM thinks about it: one compendium file can hold well over a hundred books, and a GM can as easily import the same books one file each. Either way, a long drag list of files or books is unmanageable, and per-file controls cannot reach the books inside a file.

The DM decided (Ian, 2026-11-23): books are the main unit, files are secondary; a GM stars books rather than ordering everything, and settles clashes as they come up with a Duplicates tool; books can be gathered into collections.

## Decision

**A book's identity.** Every record keeps the book its Source line names (DATA-FORMATS.md §2.9). Its key is `bookKey(name)` in `packages/rules`: lowercased, punctuation dropped, spaces collapsed, with what is in brackets kept, so a book's 2014 and 2025 printings stay apart (unlike `normalizeKey`, which drops bracketed tags). The same book in two files is one book with two copies. An imported file's records that name no book are that file's own unnamed book, `file:<sourceId>`. Bracketed words other than a year are the book's tags (`Third Party`, `Homebrew`).

**Settings live in the Library.** `library.json` gains `books`, keyed by book key: `starred` and `off`, only for books that differ from the default. They hold whichever file a book came from, and through Re-parse and re-import.

**Which copy answers.** Homebrew first; then a starred book's copy; then the default source order (imported files, the 2024 SRD, the legacy SRD). The campaign's preferred edition breaks ties as before. The saved drag order (`sourcePriority`) is no longer read; the setting stays so existing files parse.

**Off.** A book that is off leaves the compendium, search and stat block lookups; its file keeps it, and turning it on brings it back.

**The index.** `records` gains `book_key`, `book`, `starred` and `book_off`; `applyBookSettings` marks the last two after every sync. `CompendiumQuery.bookKeys` limits a search to books. The index version goes to 5, so it is rebuilt once.

**The page.** Sources opens on **Books**: every book across the imported files with search, filters (starred, on or off, tag, file), a selection with Star, Unstar, Turn on, Turn off and Rules, a star and an on switch on each row, Browse (the compendium limited to that book, kept across the kind tabs, with a chip to lift it), and a line for what needs a look. **Files** holds what is file-shaped: re-parse, warnings, Edit source (books' rules, the campaigns a file shows in, sharing) and removal. Bundled SRD and homebrew are on Files.

**Rules from the Books tab.** Marking books as 2024 rules writes each holding file's `edition2024Books` list (ADR 0028) and re-reads those files. The list is still compared by record key, so a book's printings that differ only in a bracketed year share the mark; this is ADR 0028's behaviour, unchanged.

## Consequences

- One file with many books and many one-book files are managed the same way.
- A GM stars a handful of books instead of ordering every source.
- Book settings are Library-wide. A campaign that wants different books uses collections (next).

## Next

- **Collections:** built, ADR 0062.
- **Duplicates:** built, ADR 0063.
- Sharing and "shows in" by book, replacing the per-file choices on Files.
