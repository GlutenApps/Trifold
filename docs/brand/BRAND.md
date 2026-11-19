# Trifold brand — logo spec and asset guide

> **In this repo.** The kit lives here in `docs/brand/` rather than `resources/brand/`, because everything under `resources/` is packaged with the app. Its `fonts/` and `react/` folders are not copied: Outfit is already bundled under `apps/desktop/src/renderer/assets/fonts/` and credited on the About page, and the mark component lives in the shell. The files the app uses are copied, unchanged, to:
>
> - `apps/desktop/build/`: the kit's whole `build/` folder (`icon.ico`, `icon.icns`, `icon.png`, the NSIS sidebars and header, the DMG background), wired in `apps/desktop/electron-builder.yml`; `build/installer.nsh` adds the installer's welcome page so the sidebar shows first.
> - `apps/desktop/src/renderer/features/shell/TrifoldMark.tsx`: the kit's `react/TrifoldMark.tsx` (same path data); `Brand.tsx` beside it picks the on-dark or on-light version from the Library theme and places the wordmark beside the mark by the lockup rules (§1).
> - `apps/desktop/src/renderer/assets/brand/`: the horizontal and stacked lockups and the wordmarks.
> - `apps/desktop/src/main/splash.html`: `splash/splash-animated.html`, shown by `apps/desktop/src/main/splash.ts` when startup takes longer than 250 ms, with a status line while the Library opens. `TRIFOLD_NO_SPLASH=1` turns it off (the smoke tests do).
>
> Placements today: the horizontal lockup on the About card; the mark and wordmark in the top bar while in the Library, the mark alone inside a campaign (the campaign switcher needs the room); the loading splash; the README banner. Not built: a tray icon (the app has no system-tray presence), the player-window watermark and the static first-run splash. §7 is the kit's checklist for adopting it, kept as the kit ships it.

This folder replaces every earlier Trifold logo asset. The design master is `source/trifold-logo-color.svg` (the dark lockup), with a PDF copy. The light version is derived from it by color swap only (section 2): same shapes, light-surface colors. Note: in the master, the mark is drawn at its full icon size next to the word; every lockup in this kit applies the lockup rules in section 1 instead. Apply the same rules if the master's lockup is edited. Every file here was generated from it. If the logo changes, update the master and regenerate everything; never edit individual exports or trace a PNG.

Copy the folder into the repo at `resources/brand/` (spec and source) and copy `build/` into the app's build resources. Use the right file for each context below instead of one image scaled everywhere.

## 1. The mark

A rust hexagon held inside a three-part frame.

- **The frame:** a heavy hexagon broken into three segments. The segments are the trifold DM screen; the three breaks are its hinges. Each segment ends in a straight cut with softened inner corners, echoing the wordmark's terminals.
- **The center:** a solid rust hexagon, the simplest form of a die. It is the same shape and color as the dot on the wordmark's **i**, so the mark and the word share a piece.
- **Two colors, two roles:** the center is the accent color; the frame takes the text color of the surface it sits on.
- **One mark at every size.** It is simple enough that no separate small-size version is needed; it stays clear at 16 px.
- **Corners:** everything has the same soft rounding, matching the wordmark.

### Wordmark

Custom lettering, not a font. Its corners are softened to match the mark, so the mark and the word share one level of roundness. The dot on the **i** is a rust hexagon matching the mark's center. Keep that link in every lockup.

### Lockup rules

The mark is drawn to work alone as an app icon. Next to the word it is scaled down so the two read as equals:

- **Size:** the mark is 85% of its drawn size, which makes it about **1.5× the cap height** of "Trifold" (the height of the T).
- **Vertical alignment:** the mark's center sits on the **middle of the cap height** (halfway between the top of the T and the baseline), not on the middle of the whole word.
- **Gap:** the space between the mark's right edge and the T is **1.9× the width of a letter stem** (the i's stem).
- At this size the frame's line is close to the letters' stroke weight. Don't enlarge the mark in lockups to make it "pop"; use the bare mark or app icon for that.

### Versions

| Version | Use |
|---|---|
| `mark-on-dark` | Default. Dark surfaces, the app icon at every size. |
| `mark-on-light` | Light surfaces. Derived from the dark master by swapping colors (section 2). |

There is no one-color version for now. The macOS menu-bar template icon uses the mark's solid silhouette.

## 2. Colors

App palette: Slate & bone.

| Token | Hex | Use |
|---|---|---|
| `slate` | `#14181D` | App background, icon tile; frame and wordmark on light |
| `surface` | `#1C2229` | Panels, cards |
| `bone` | `#E3D3B0` | UI accent |
| `text` | `#E6E1D6` | Frame and wordmark on dark |
| `paper` | `#F4F1EA` | Light background |
| `rust` | `#C45C45` | Center hexagon and i-dot on dark |
| `rust-deep` | `#A84A30` | Center hexagon and i-dot on light |

| Part | On dark | On light |
|---|---|---|
| Frame | `#E6E1D6` | `#14181D` |
| Center hexagon, i-dot | `#C45C45` | `#A84A30` |
| Wordmark | `#E6E1D6` | `#14181D` |

## 3. Which file for what

| Context | File |
|---|---|
| Windows exe, shortcuts, taskbar, `BrowserWindow({ icon })` | `build/icon.ico` (16–256; frames ≤32 px use a full-bleed tile) |
| macOS app | `build/icon.icns` |
| Linux / generic 512 icon | `build/icon.png` |
| NSIS installer and uninstaller sidebars | `build/installerSidebar.bmp`, `build/uninstallerSidebar.bmp` (164×314) |
| NSIS header | `build/installerHeader.bmp` (150×57) |
| macOS DMG window | `build/background.png`, `build/background@2x.png` |
| Loading splash window (animated) | `splash/splash-animated.html`: self-contained, offline; the frame turns while the core and wordmark stay still. Wiring notes in `splash/splash-animated-README.md`. |
| Static splash / first-run setup image | `splash/splash.png` (+ `@2x`, `.svg`) |
| README / social preview | `splash/readme-banner.png` (1280×640) |
| Console title bar, sidebar header, About page | `svg/lockup-horizontal-on-dark.svg` (or `-on-light`) |
| Centered empty states, About hero, loading | `svg/lockup-stacked-on-dark.svg` |
| Text-only placements | `svg/wordmark-on-dark.svg` / `-on-light` |
| Mark inside the renderer UI | `react/TrifoldMark.tsx` (`variant="dark"` on slate surfaces) |
| Player-window watermark | `TrifoldMark variant="dark"` at 6–10% opacity |
| Windows tray | `png/tray/tray-for-dark-taskbar-{16,24,32}.png` and `tray-for-light-taskbar-*`; pick with `nativeTheme.shouldUseDarkColors` and update on `nativeTheme` `updated` |
| macOS menu bar | `png/tray/trayTemplate.png` + `trayTemplate@2x.png` (template image: the mark's solid silhouette) |

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
- **Don't:** use the mark at its full drawn size next to the word, align it to the word's full height instead of the cap height, thin the frame, round off the straight cuts at the segment ends, close or move the three breaks in the frame, add detail or facets to the center hexagon, change the center's size relative to the frame, recolor the center anything but rust, add effects (glows, bevels, shadows inside the UI), or retype the wordmark in a font. The i-dot is always the rust hexagon.
- **App-icon tiles are only for app icons.** Inside the UI, use the bare mark or a lockup.

## 6. Font

The UI font is Outfit (SIL Open Font License, `fonts/Outfit-OFL.txt`; the variable font is included). The wordmark is custom outlined lettering, so no font is needed to display it.

## 7. Implementation checklist for Claude Code

1. Remove every earlier logo asset and reference (the faceted d20 mark, the sword mark, the screen-and-die mark, any earlier brand kit, any one-color/mono assets, any single reused logo image), so nothing old is left behind.
2. Copy `build/` into the app's build resources and apply the electron-builder config above.
3. Replace the existing `TrifoldMark` component with `react/TrifoldMark.tsx` and use it for in-app marks.
4. Replace the console header, About page and empty states with the lockups in section 3, and add the animated loading splash from `splash/splash-animated.html` (show it only when startup takes longer than ~250 ms; see its README).
5. Wire the tray icon to switch between dark and light taskbar versions with `nativeTheme`, and use the template image on macOS.
6. Keep the Outfit OFL notice on the About page credits alongside the SRD and game-icons attribution.
7. Check the icon at 16, 24, 32 and 48 px on Windows 11 in both light and dark taskbar modes.
