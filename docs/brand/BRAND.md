# Trifold brand — logo spec and asset guide

> **In this repo.** The kit lives here in `docs/brand/` rather than `resources/brand/`, because everything under `resources/` is packaged with the app. The files the app uses are copied, unchanged, to:
>
> - `apps/desktop/build/`: icons, NSIS sidebar and header, DMG background (wired in `apps/desktop/electron-builder.yml`; `build/installer.nsh` adds the installer's welcome page so the sidebar shows first). One deliberate change from the kit: `icon.ico` (Windows exe, shortcuts, taskbar, installer) is the bare `mark-on-dark` with no tile, filling the frame, so it sits at the same size as other taskbar icons. `pnpm make:ico` builds it from `png/mark/mark-on-dark-*.png`; the kit's tiled `.ico` is not used. macOS keeps the kit's tiled `icon.icns`, as macOS icons expect a tile.
> - `apps/desktop/src/renderer/features/shell/TrifoldMark.tsx`: the mark component; `Brand.tsx` beside it picks the on-dark or on-light version from the Library theme.
> - `apps/desktop/src/renderer/assets/brand/`: the horizontal and stacked lockups.
>
> Placements today: the horizontal lockup in the top bar while in the Library and on the About card; the mark alone in the top bar inside a campaign (the campaign switcher needs the room); the README banner. Not built yet: the tray icon, a splash window and the player-window watermark (§3 lists the files for them). The Outfit font is already bundled under `apps/desktop/src/renderer/assets/fonts/` and credited on the About page, so the kit's `fonts/` folder is not copied.

This folder replaces every earlier Trifold logo asset. The design master is `source/trifold-logo-color.svg` (dark mark and dark lockup), with a PDF copy. The light version is derived from it by color swap only (section 2): same shapes, light-surface colors. Every file here was generated from that master. If the logo changes, update the master and regenerate everything; never edit individual exports or trace a PNG.

Copy the folder into the repo at `resources/brand/` (spec and sources) and copy `build/` into the app's build resources. Use the right file for each context below instead of one image scaled everywhere.

## 1. The mark

A sword whose crossguard is a folded three-panel DM screen. Together they form a **T**.

- **Weight:** the crossguard is about 14% of the mark's height thick, matching the wordmark's stroke weight. Don't thin it; that's what keeps the mark solid at 16 px.
- **Crossguard:** the screen. A bright center panel with two darker wings folding down and away; the wing tips are rounded.
- **Blade:** the stem of the T. Two bevels meet at a central ridge: the left bevel is lit, the right is in shadow. It ends in a sharp point.
- **Hilt:** a short rust grip and a rust hexagon pommel (a nod to the d20). The hilt is the mark's only accent color, and it is kept short so the mark stays nearly square.
- **Lighting rule:** lit faces (the center panel and the left bevel) share one tone; faces turned away (the wings and the right bevel) share a darker one. The same rule applies on dark and light backgrounds.
- **Corners:** the wing tips are rounded; the blade point, center panel and hilt stay crisp.

### Wordmark

Custom lettering, not a font. The dot on the **i** is the same rust hexagon as the pommel. Keep that link in every lockup.

### Versions

| Version | Use |
|---|---|
| `mark-on-dark` | Default. Dark surfaces, the app icon at every size (holds up at 16 px). |
| `mark-on-light` | Light surfaces. Derived from the dark master by swapping colors (section 2). |

There is no one-color version for now. The macOS menu-bar template icon uses the sword's solid silhouette.

## 2. Colors

App palette: Slate & bone.

| Token | Hex | Use |
|---|---|---|
| `slate` | `#14181D` | App background, icon tile |
| `surface` | `#1C2229` | Panels, cards |
| `bone` | `#E3D3B0` | Primary accent; mark on dark |
| `text` | `#E6E1D6` | Wordmark and body text on dark |
| `ink` | `#14181D` | Wordmark on light |
| `paper` | `#F4F1EA` | Light background |
| `rust` | `#C45C45` | Pommel, i-dot hexagon |
| `rust-deep` | `#A84A30` | Grip |

Mark tones:

| Part | On dark | On light |
|---|---|---|
| Center panel, lit blade bevel | `#E3D3B0` | `#6E7377` |
| Wings, shadow blade bevel | `#8C846F` | `#383C3F` |
| Grip | `#A84A30` | `#A84A30` |
| Pommel | `#C45C45` | `#C45C45` |

Note: two values in the source SVGs were snapped to the palette in every export: the grip (`#8E3923` → `#A84A30`, so the hilt doesn't vanish into the slate tile at small sizes) and bone/slate (`#E3D3B1` → `#E3D3B0`, `#14171C` → `#14181D`). Make the same changes in the master next time it's edited.

## 3. Which file for what

| Context | File |
|---|---|
| Windows exe, shortcuts, taskbar, `BrowserWindow({ icon })` | `build/icon.ico` (16–256; frames ≤32 px use a full-bleed tile) |
| macOS app | `build/icon.icns` |
| Linux / generic 512 icon | `build/icon.png` |
| NSIS installer and uninstaller sidebars | `build/installerSidebar.bmp`, `build/uninstallerSidebar.bmp` (164×314) |
| NSIS header | `build/installerHeader.bmp` (150×57) |
| macOS DMG window | `build/background.png`, `build/background@2x.png` |
| Splash / first-run setup window | `splash/splash.png` (+ `@2x`, `.svg`) |
| README / social preview | `splash/readme-banner.png` (1280×640) |
| Console title bar, sidebar header, About page | `svg/lockup-horizontal-on-dark.svg` (or `-on-light`) |
| Centered empty states, About hero, loading | `svg/lockup-stacked-on-dark.svg` |
| Text-only placements | `svg/wordmark-on-dark.svg` / `-on-light` |
| Mark inside the renderer UI | `react/TrifoldMark.tsx` (`variant="dark"` on slate surfaces) |
| Player-window watermark | `TrifoldMark variant="dark"` at 6–10% opacity |
| Windows tray | `png/tray/tray-for-dark-taskbar-{16,24,32}.png` and `tray-for-light-taskbar-*`; pick with `nativeTheme.shouldUseDarkColors` and update on `nativeTheme` `updated` |
| macOS menu bar | `png/tray/trayTemplate.png` + `trayTemplate@2x.png` (template image: the sword's solid silhouette) |

PNG renders of every mark, tile and lockup are in `png/` (marks 16–1024, lockups 48/96/192 px tall). Each was rendered at its final size from the SVGs.

## 4. electron-builder

```yaml
directories:
  buildResources: build
win:
  icon: build/icon.ico
mac:
  icon: build/icon.icns
linux:
  icon: build/icon.png
nsis:
  installerIcon: build/icon.ico
  uninstallerIcon: build/icon.ico
  installerHeaderIcon: build/icon.ico
  installerSidebar: build/installerSidebar.bmp
  uninstallerSidebar: build/uninstallerSidebar.bmp
  installerHeader: build/installerHeader.bmp
dmg:
  background: build/background.png
```

## 5. Usage rules

- **Clear space:** at least half the mark's width on every side.
- **Minimum sizes:** mark 16 px tall, horizontal lockup 24 px tall.
- **Background match:** `-on-dark` files on dark surfaces, `-on-light` on light ones.
- **Don't:** stretch or skew it, lengthen the hilt, add a second accent color, recolor the hilt, swap the lit and shadow sides, add outlines to the color mark, add effects (glows, bevels, shadows inside the UI), or retype the wordmark in a font. The i-dot is always the rust hexagon.
- **App-icon tiles are only for app icons.** Inside the UI, use the bare mark or a lockup.
- **Seams:** where shapes touch (center panel and blade), every export and `TrifoldMark` give each shape a thin stroke in its own color so no hairlines show. Keep that in new exports.

## 6. Font

The UI font is Outfit (SIL Open Font License, `fonts/Outfit-OFL.txt`; the variable font is included). The wordmark is custom outlined lettering, so no font is needed to display it.

## 7. Implementation checklist for Claude Code

1. Remove every earlier logo asset and reference (the previous screen-and-die mark, any earlier brand kit, any one-color/mono assets and the `mono` variant of `TrifoldMark`, any single reused logo image), so nothing old is left behind.
2. Copy `build/` into the app's build resources and apply the electron-builder config above.
3. Replace the existing `TrifoldMark` component with `react/TrifoldMark.tsx` and use it for in-app marks.
4. Replace the console header, About page, splash/setup window and empty states with the lockups in section 3.
5. Wire the tray icon to switch between dark and light taskbar versions with `nativeTheme`, and use the template image on macOS.
6. Keep the Outfit OFL notice on the About page credits alongside the SRD and game-icons attribution.
7. Check the icon at 16, 24, 32 and 48 px on Windows 11 in both light and dark taskbar modes, and confirm the rust hilt is visible and no seams show at any zoom level.
