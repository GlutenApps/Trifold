# ADR 0002 — Window routes use the URL hash

**Status:** accepted, 2026-09-27.

## Context

`CLAUDE.md` describes two renderer routes, `/console` and `/player`, served from one bundle. The packaged app loads `index.html` from disk, where a path-based route has no server to fall back to.

## Decision

The route is carried in the hash: `index.html#/console` and `index.html#/player`. The main process picks the hash when it creates each window; the renderer reads it once at startup. No router library is added.

## Consequences

- Both windows share one HTML entry and one bundle, as designed.
- In-app navigation inside the console is store state, not URL state. If deep links are ever needed, a hash router can be added without changing the window setup.
