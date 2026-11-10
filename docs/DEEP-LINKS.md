# Deep links

How one feature opens another feature's item (ADR 0017). Global search uses this and nothing
else; note-to-note links, backlinks and "open on the map" buttons should too. The code is one
module, `apps/desktop/src/renderer/navigate.ts`.

## The contract

```ts
navigate({ type, id, anchor? });
```

`type` names what the item is, `id` is its ULID, and `anchor` (optional, per type) says where
inside the item to land. One call does three things, in order:

1. **Brings the home forward.** Every type has a home: a stage tab or a dock tool (`homeOf`).
   An open tab is activated where the DM put it and never moved. A closed tab joins a group by
   `landingGroup`: the only group when there is one; otherwise the group that does not hold the
   VTT, then the group that does not hold a running fight, then the focused group. A maximized
   stage switches to that group; a folded stage shows it. A dock tool opens as a section or a
   flyout, whichever the dock is showing. Any pop-up or flyout that was open closes first.
2. **Posts the target.** The target waits in `useNavStore` until the panel that owns the type
   lands it. It survives the panel mounting late (a sub-tab that had to be switched to first).
3. **The panel lands it.** The panel shows the item (selects the row, opens the editor, expands
   folders, switches sub-tab), then calls `landOn(navKey(type, id))`, which scrolls to every
   element marked `data-nav="<type>:<id>"` and flashes it for a moment. An anchor is applied
   here too: a note's phrase and occurrence through the editor's highlight, an encounter's
   DM-notes phrase through `selectPhrase`.

Only the console has these homes. In the Library, `navigate` does nothing.

## Targets

| `type`      | Home                       | Lands on                                      | Anchor                              |
| ----------- | -------------------------- | --------------------------------------------- | ----------------------------------- |
| `note`      | Campaign › Notes           | the tree row and the open note pane           | `{ phrase, occurrence }`            |
| `folder`    | Campaign › Notes           | the tree row and the folder pane              |                                     |
| `npc`       | Campaign › NPCs            | the NPC row                                   |                                     |
| `pc`        | Campaign › Party           | the PC row                                    |                                     |
| `encounter` | Encounters                 | the builder, or the list row of a paused fight; the running fight comes back | `{ field: 'notes', phrase, occurrence }` |
| `scene`     | Scenes (dock)              | the scene row; a map also opens the VTT       |                                     |
| `record`    | Compendium                 | the record pane, after switching to its kind  |                                     |
| `webTab`    | the web tab itself         | nothing further                               |                                     |

## Consuming a target in a panel

```tsx
import { landOn, navKey, useNavTarget } from '../../navigate';

useNavTarget('npc', (target) => {
  setTab('npcs');
  landOn(navKey('npc', target.id));
  return true; // landed: the target is cleared
});
```

- `useNavTarget(types, handler)` runs the handler when a target of one of `types` is posted,
  and again on mount while one is still pending. Return `true` once the item is on screen; the
  target is cleared. Return `false` when the panel only moved towards the item (the Campaign tab
  switching to the Notes sub-tab) and a panel inside it will land it.
- Mark the landing element with `data-nav={navKey(type, id)}`. Several elements may carry the
  same key (a row and a pane); all of them flash, the first is scrolled to.
- `landOn` retries for a few frames, so posting before React has drawn the item is fine. It
  takes an optional callback with the first element, for anchors that need the DOM.
- Read fresh store state inside the handler (`useCampaignStore.getState()`) rather than closing
  over render-time values; the handler ref is updated every render, but the item may have moved.

## Adding a type

1. Add the variant to `NavTarget` in `navigate.ts`, with its anchor shape if it has one.
2. Map its home in `homeOf`.
3. Give its panel a `useNavTarget` and its landing element a `data-nav`.
4. If search should find it, add a `SearchResult` producer in `stores/searchStore.ts`
   (`searchLocal` for in-memory data) and a group label.
5. Add a row to the table above.

## Why not a URL router

The console is one window with a layout the DM arranges; there is nothing to put in an address
bar and the hash routes (ADR 0002) only pick the console or the player window. A typed target
plus "the panel lands it" keeps each panel's selection state where it already lives (local
state or its own store) instead of lifting all of it into a router, and the placement rule
lives in one pure function the layout tests cover.
