# ADR 0001 — Electron and better-sqlite3 version pins

**Status:** accepted, 2026-09-27.

## Context

`CLAUDE.md` asks for "Electron (current LTS)". Electron has no LTS line; it supports the three most recent majors. `better-sqlite3` is the one native dependency and it must load inside Electron's ABI. Version 13 of better-sqlite3 publishes no prebuilt binaries, so installing it needs a C++ toolchain on every machine that runs `pnpm i`. The newest 12.x on npm, 12.11.1, publishes prebuilt binaries for Electron ABIs up to 146 (Electron 42) but not for Electron 43 or 44.

## Decision

- Pin `electron` to 42.x and `better-sqlite3` to 12.11.1. Move both together, and only when a better-sqlite3 release ships a prebuild for the new Electron ABI.
- `scripts/rebuild-native.mjs` runs as the desktop postinstall (and as `pnpm rebuild:native`). It downloads Electron's binary when `node_modules/electron/dist` is missing (pnpm skips Electron's own postinstall once it believes the package is installed) and fetches the better-sqlite3 prebuild for the Electron ABI with `prebuild-install`. electron-builder's `install-app-deps` is not used: it cannot find modules in pnpm's hoisted layout and silently does nothing.
- Because that binary cannot load under plain Node, unit tests never import `better-sqlite3`. The index is exercised by the Playwright smoke test, which runs inside Electron.

## Consequences

- `pnpm i` needs no compiler.
- Electron upgrades are gated on better-sqlite3 prebuilds. Check the release assets before bumping.
- SQLite-dependent code is kept thin and behind a class so everything around it stays unit-testable.
