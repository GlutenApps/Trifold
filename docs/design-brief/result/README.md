# Trifold console shell · design result

Output of the shell redesign session (2026-09-28). Drop this folder into the
design-brief folder as `result/` and start a Claude Code session with
`CLAUDE-CODE-PROMPT.md`.

Live canvas (needs your Claude sign-in): https://claude.ai/artifact/6RHcUtkdFZrHdbAjh5aX2e
`screens/` holds a PNG of every board plus standalone HTML pages of the same
boards; `screens/README.md` maps each file to its screen.

| File | What it is |
| --- | --- |
| `SPEC.md` | The shell specification: spaces, chrome, stage, dock, strip, majors, minors, rules, sizes, keyboard, layouts. Build from this. |
| `FEATURE-MAP.md` | Every line of `FEATURES.md` and where it lives now. Nothing dropped; this is the checklist. |
| `IMPLEMENTATION.md` | Phased plan with acceptance criteria, for Claude Code. |
| `CLAUDE-CODE-PROMPT.md` | The prompt to paste into Claude Code. |
| `docs/adr-0004-stage-dock-strip-shell.md` | ADR draft superseding `docs/adr/0003-dm-screen-workspace.md`. |
| `tokens/tf.css` | Reference stylesheet: every class the mockups use, built only from `TOKENS.md` values. Port the values, not the file. |
| `mockups/*.dc.html` | Board sources from the canvas. Design-canvas components (props, `{{holes}}`, `<dc-import>`), not standalone pages: read them for exact markup, sizes and copy. |
| `mockups/canvas.json` | Board index: which file is which screen. |
| `screens/*.png`, `screens/html/*.html` | Renders of every board, and the same boards as standalone pages. |

Decisions taken during the session that the brief did not settle are listed at
the top of `SPEC.md` under "Decisions".
