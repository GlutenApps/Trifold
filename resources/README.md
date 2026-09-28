# resources

Built at build time by `pnpm fetch:content` (Open5e SRD snapshot and game-icons SVGs). Only the manifests and `icons/mapping.json` are committed; the generated `*.jsonl` files, `icons/svg/`, `icons/credits.json` and `icons/license.txt` are git-ignored.

`icons/mapping.json` holds the glyph tables (DATA-FORMATS.md §6). Every icon name in it must exist in the fetched set; `pnpm verify:mapping` checks.
