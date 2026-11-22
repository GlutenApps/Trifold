# Contributing to Trifold

Thank you for helping. Trifold is a local desktop app for running 5e-compatible games; read
[CLAUDE.md](CLAUDE.md) for the repo's conventions and [docs/DESIGN.md](docs/DESIGN.md) for what
it builds and why.

## Licence and the contributor agreement

Trifold is licensed under the GNU General Public License, version 3 or later ([LICENSE](LICENSE)).
Before your first pull request is merged you will be asked to sign the project's Contributor
License Agreement (CLA), once, through a bot on the pull request. The CLA keeps your copyright
yours and gives the project the right to use your contribution, including under other licences
later. The name and logo are covered separately: see [TRADEMARK.md](TRADEMARK.md).

## Content rules

Only System Reference Document content, game-icons.net icons and your own text and art may go in
the repo (CLAUDE.md, ground rules 3 and 4). No non-SRD game text, art, maps or compendium files,
not even in tests.

## Before you open a pull request

- `pnpm lint`, `pnpm typecheck`, `pnpm test` and, for anything the app shows, `pnpm smoke` pass.
- One feature per pull request, with a conventional commit title (`feat(map): …`) and the
  `docs/DESIGN.md` section it implements in the description.
- A change to how Trifold works gets a short ADR in `docs/adr/`.
