# Trifold brand — logo spec and asset guide

> **In this repo.** The kit lives here in `docs/brand/` rather than `resources/brand/`, because everything under `resources/` is packaged with the app. The files the app uses are copied, unchanged, to:
>
> - `apps/desktop/build/`: icons, NSIS sidebar and header, DMG background (wired in `apps/desktop/electron-builder.yml`; `build/installer.nsh` adds the installer's welcome page so the sidebar shows first).
> - `apps/desktop/src/renderer/features/shell/TrifoldMark.tsx`: the mark component; `Brand.tsx` beside it picks the on-dark or on-light version from the Library theme.
> - `apps/desktop/src/renderer/assets/brand/`: the horizontal and stacked lockups.
>
> Placements today: the horizontal lockup in the top bar while in the Library and on the About card; the mark alone in the top bar inside a campaign (the campaign switcher needs the room); the README banner. Not built yet: the tray icon, a splash window and the player-window watermark (§3 lists the files for them). The Outfit font is already bundled under `apps/desktop/src/renderer/assets/fonts/` and credited on the About page, so the kit's `fonts/` folder is not copied.

This folder replaces every earlier Trifold logo asset. The design master is `source/trifold-logo-master.svg` (from Illustrator; a PDF copy sits beside it). Every file here was generated from that master. If the logo changes, update the master and regenerate everything; never edit individual exports or trace a PNG.

Copy the folder into the repo at `resources/brand/` (spec and sources) and copy `build/` into the app's build resources. Use the right file for each context below instead of one image scaled everywhere.

## 1. The mark

A three-panel DM screen seen from above, with a d20 standing behind it. The top edge of each side panel catches the light as a brighter band, so the bright center panel and the two bands still read as a folded T.

- **One drawing system.** Every angle is 30° (isometric): the panel tops and bottoms and every facet of the die. Keep any new artwork on the same angles.
- **One lighting rule.** Faces pointing at the viewer are brightest. Faces angled away step darker, symmetrically left and right, on both the screen and the die.
- **The gap.** A single band of background color separates the die from the screen. It is negative space, not a drawn shape, so the mark works on any background in its family.
- **Corners.** Only the outer corners of the overall silhouette are rounded.
- **The wordmark** is custom lettering. Only the corners on the word's outer edge are rounded, echoing the mark, and the r and f have angled cuts.

### Versions

| Version | Use |
|---|---|
| `mark-on-dark` | Default. Dark surfaces, app icon at every size (holds up at 16 px). |
| `mark-on-light` | Light surfaces. |
| `mark-mono-*` | One-color uses only: tray template icons, print, engraving, watermarks. Surfaces are separated by gaps instead of tone. At 24 px and below the gaps close up, so prefer the shaded mark at small sizes wherever color is allowed. |

## 2. Colors

App palette: Slate & bone.

| Token | Hex | Use |
|---|---|---|
| `slate` | `#14181D` | App background, icon tile |
| `surface` | `#1C2229` | Panels, cards |
| `bone` | `#E3D3B0` | Primary accent |
| `text` | `#E6E1D6` | Wordmark and body text on dark; light-mode background in the lockups |
| `ink` | `#14181D` | Wordmark on light |

Mark tones (solid colors, taken from the master):

| Part | On dark | On light |
|---|---|---|
| Center panel | `#E3D3B0` | `#53595E` |
| Die top face | `#E3D3B0` | `#6E7377` |
| Die upper faces, die front band | `#BAAE93` | `#53595E` |
| Side-panel top bands | `#BAAE93` | `#414549` |
| Side panels | `#8C846F` | `#2C3135` |
| Die lower corners | `#8C846F` | `#414549` |
| Die side bands | `#6D6858` | `#2C3135` |
| One-color mark | `#E3D3B0` on slate | `#1C2229` on light |

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
| Player-window watermark | `TrifoldMark variant="mono"` at 6–10% opacity |
| Windows tray | `png/tray/tray-for-dark-taskbar-{16,24,32}.png` and `tray-for-light-taskbar-*`; pick with `nativeTheme.shouldUseDarkColors` and update on `nativeTheme` `updated` |
| macOS menu bar | `png/tray/trayTemplate.png` + `trayTemplate@2x.png` (template image) |
| One-color contexts | `svg/mark-mono-white.svg` / `mark-mono-black.svg`, `svg/lockup-horizontal-mono-*` |

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
- **Minimum sizes:** shaded mark 16 px tall, one-color mark 32 px, horizontal lockup 24 px tall.
- **Background match:** `-on-dark` files on dark surfaces, `-on-light` on light ones.
- **Don't:** stretch or skew it, change the 30° angles, close or fill the gap between the die and the screen, add outlines or lines between facets, add new tones, recolor outside the palette, add effects (glows, bevels, shadows inside the UI), or retype the wordmark in a font.
- **App-icon tiles are only for app icons.** Inside the UI, use the bare mark or a lockup.
- **Seams:** facets share edges exactly. Every generated asset and `TrifoldMark` give each facet a thin stroke in its own color so no hairlines show between them. Keep that if you build new exports.

## 6. Font

The UI font is Outfit (SIL Open Font License, `fonts/Outfit-OFL.txt`; the variable font is included). The wordmark is custom outlined lettering, so no font is needed to display it.

## 7. Implementation checklist for Claude Code

1. Remove every earlier logo asset and reference (any single reused logo image and any previous brand kit), so nothing old is left behind.
2. Copy `build/` into the app's build resources and apply the electron-builder config above.
3. Add `react/TrifoldMark.tsx` to the renderer (e.g. `apps/desktop/src/renderer/components/brand/`), replacing any previous mark component, and use it for in-app marks.
4. Replace the console header, About page, splash/setup window and empty states with the lockups in section 3.
5. Wire the tray icon to switch between dark and light taskbar versions with `nativeTheme`, and use the template image on macOS.
6. Add the Outfit OFL notice to the About page credits alongside the SRD and game-icons attribution.
7. Check the icon at 16, 24, 32 and 48 px on Windows 11 in both light and dark taskbar modes, and confirm no seams show between facets at any zoom level.
