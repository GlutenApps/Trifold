Board sources from the Design canvas. Each file is one board: a fixed-size
root, a `data-props` block declaring its props (`w`, `h`, variants such as
`narrow`, `prompt`, `homebrew`, `empty`, `edit`, `compact`, `space`, `mode`),
`{{holes}}` filled from `renderVals()`, and `<dc-import name="X" …>` mounting a
sibling `X.dc.html` with attributes as props. Classes come from
`../tokens/tf.css`. They are not standalone pages; read them for markup,
dimensions and copy. `canvas.json` maps each file to a screen and its title.
Screens compose components: TopBar, LiveStrip, DockTabs, the majors
(Campaign, Compendium, Encounters, Combat, Map) and the minors (DockDice,
DockTV, DockMusic, DockScenes, DockHotkeys, DockLayouts).
