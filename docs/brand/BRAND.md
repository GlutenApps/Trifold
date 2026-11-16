# Brand

The Trifold logo kit: the mark, the wordmark, their colors, and which file goes where.

The design master is `source/trifold-logo-color.svg` (dark mark and dark lockup), with a PDF copy. The light version is derived from it by color swap only (section 2): same shapes, light-surface colors. Every file in this folder is generated from that master. If the logo changes, update the master and regenerate everything; never edit individual exports or trace a PNG. `contact-sheet.png` shows every version side by side.

The kit lives in `docs/brand/` rather than `resources/`, because everything under `resources/` is packaged with the app. The files the app uses are copied from here, unchanged unless noted:

- `apps/desktop/build/`: the app icons, NSIS sidebars and header, and the DMG background (wired in `apps/desktop/electron-builder.yml`; `build/installer.nsh` adds the installer's welcome page so the sidebar shows first). `icon.ico` is the exception: it is the bare `mark-on-dark` with no tile, filling the frame, so it sits at the same size as other taskbar icons. `pnpm make:ico` builds it from `png/mark/mark-on-dark-*.png`. macOS uses the tiled `icon.icns`, as macOS icons expect a tile.
- `apps/desktop/src/renderer/features/shell/TrifoldMark.tsx`: the mark as a component, generated from the master's path data. `Brand.tsx` beside it picks the on-dark or on-light version from the Library theme.
- `apps/desktop/src/renderer/assets/brand/`: the lockups and wordmarks as SVG.

Where the brand shows: the mark and wordmark in the top bar while in the Library, and the mark alone inside a campaign (the campaign switcher needs the room); the horizontal lockup on the About card; the README banner. The Outfit font is bundled under `apps/desktop/src/renderer/assets/fonts/` and credited on the About page.

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

There is no one-color version. The macOS menu-bar template icon uses the sword's solid silhouette.

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

The master SVG still carries three values just off the palette: the grip `#8E3923`, bone `#E3D3B1` and slate `#14171C`. Every export uses the palette values instead (`#A84A30`, so the hilt doesn't vanish into the slate tile at small sizes; `#E3D3B0`; `#14181D`). Make the same change in the master the next time it is edited.

## 3. Which file for what

| Context | File |
|---|---|
| Windows exe, shortcuts, taskbar, installer | `apps/desktop/build/icon.ico` (the bare mark, built by `pnpm make:ico`) |
| Window icon in unpackaged runs | `apps/desktop/build/icon.ico` on Windows, `icon.png` elsewhere |
| macOS app | `apps/desktop/build/icon.icns` |
| Generic 512 px icon | `apps/desktop/build/icon.png` |
| NSIS installer and uninstaller sidebars | `apps/desktop/build/installerSidebar.bmp`, `uninstallerSidebar.bmp` (164×314) |
| NSIS header | `apps/desktop/build/installerHeader.bmp` (150×57) |
| macOS DMG window | `apps/desktop/build/background.png`, `background@2x.png` |
| README and social preview | `splash/readme-banner.png` (1280×640) |
| Top bar, About card | `svg/lockup-horizontal-on-dark.svg` (or `-on-light`), or the mark beside `svg/wordmark-on-*.svg` |
| Centered empty states, loading | `svg/lockup-stacked-on-dark.svg` (or `-on-light`) |
| Text-only placements | `svg/wordmark-on-dark.svg` / `-on-light` |
| The mark inside the UI | `TrifoldMark` (`variant="dark"` on slate surfaces, `"light"` on paper) |
| Splash or first-run window | `splash/splash.png` (+ `@2x`, `.svg`) |
| Player-window watermark | `TrifoldMark variant="dark"` at 6–10% opacity |
| Windows tray | `png/tray/tray-for-dark-taskbar-{16,24,32}.png` and `tray-for-light-taskbar-*`; pick with `nativeTheme.shouldUseDarkColors` and update on `nativeTheme` `updated` |
| macOS menu bar | `png/tray/trayTemplate.png` + `trayTemplate@2x.png` (template image: the sword's solid silhouette) |

The app has no splash window, player-window watermark or tray icon yet; the last four rows are the files to use when it does.

PNG renders of every mark, app-icon tile and lockup are in `png/` (marks 16–1024 px, lockups 48, 96 and 192 px tall), each rendered at its final size from the SVGs. The app-icon tiles (`svg/app-icon*.svg`, `png/app-icon/`) are only for app icons.

## 4. electron-builder

`apps/desktop/electron-builder.yml` uses the files in `apps/desktop/build/` (its `buildResources`):

```yaml
win:
  icon: build/icon.ico
mac:
  icon: build/icon.icns
nsis:
  installerIcon: build/icon.ico
  uninstallerIcon: build/icon.ico
  installerSidebar: build/installerSidebar.bmp
  uninstallerSidebar: build/uninstallerSidebar.bmp
  installerHeader: build/installerHeader.bmp
dmg:
  background: build/background.png
```

## 5. Usage rules

- **Clear space:** at least half the mark's width on every side.
- **Minimum sizes:** mark 16 px tall, horizontal lockup 24 px tall.
- **Background match:** `-on-dark` files on dark surfaces, `-on-light` on light ones. Never tint the marks or lockups; they carry their own colors.
- **Don't:** stretch or skew it, lengthen the hilt, add a second accent color, recolor the hilt, swap the lit and shadow sides, add outlines to the color mark, add effects (glows, bevels, shadows inside the UI), or retype the wordmark in a font. The i-dot is always the rust hexagon.
- **App-icon tiles are only for app icons.** Inside the UI, use the bare mark or a lockup.
- **Seams:** where shapes touch (center panel and blade), every export and `TrifoldMark` give each shape a thin stroke in its own color so no hairlines show. Keep that in new exports.
- **Check new icons** at 16, 24, 32 and 48 px on Windows 11 in both light and dark taskbar modes: the rust hilt stays visible and no seams show at any zoom level.

## 6. Font

The UI font is Outfit (SIL Open Font License; the variable font and `Outfit-OFL.txt` are in `apps/desktop/src/renderer/assets/fonts/`, and the license travels with the packaged app). The wordmark is custom outlined lettering, so no font is needed to display it.
