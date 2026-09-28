Implement the console shell redesign described in `result/SPEC.md`.

Start by reading, in this order: `result/SPEC.md`, `result/FEATURE-MAP.md`,
`result/IMPLEMENTATION.md`, then `docs/adr/0003-dm-screen-workspace.md` and the
current shell in `apps/desktop/src/renderer/features/shell/`. Look at
`result/screens/<board>.png` for every screen you build (open
`result/screens/html/<board>.html` in a browser when you need it at real
size), and use `result/mockups/*.dc.html` for exact markup, sizes and copy of any piece you
are building; `result/mockups/canvas.json` maps files to screens. Use
`TOKENS.md` / `tokens.json` for every colour, size and font; `result/tokens/tf.css`
shows how the tokens combine into components but port values, not the file.

Work through `result/IMPLEMENTATION.md` phase by phase. Before each phase, list
the files you will touch and the acceptance criteria you are targeting; after
each phase, run the app at 1600×900 and 1366×768 and tick the criteria. Do not
add features beyond `FEATURES.md`; where the spec marks a "decision", follow it;
where it marks "open", ask me before choosing. Keep everything local: no
accounts, no network. Write `docs/adr/0004-stage-dock-strip-shell.md` from
`result/docs/adr-0004-stage-dock-strip-shell.md` and mark 0003 superseded when
the shell lands.
