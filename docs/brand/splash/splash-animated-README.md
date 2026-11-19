# Trifold animated splash

`splash.html` is a self-contained loading screen: no fonts, images or network requests (the wordmark is outlined), so it works offline and loads instantly. The three frame segments turn 120° and pause, on a loop; the rust core and the wordmark stay still. Because the frame has three-fold symmetry, each turn ends exactly where it began, so the loop is seamless. With Windows "show animations" turned off (`prefers-reduced-motion`), it gently pulses instead of spinning.

## Wiring it up (Electron main process)

Show the splash only if startup is actually slow, so fast launches don't flash it:

```ts
import { BrowserWindow } from "electron";
import path from "node:path";

export function createWindows() {
  const splash = new BrowserWindow({
    width: 480, height: 360,
    frame: false, resizable: false, movable: true,
    show: false, center: true,
    backgroundColor: "#14181D",
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  splash.loadFile(path.join(__dirname, "splash.html"));

  const main = new BrowserWindow({ show: false, backgroundColor: "#14181D" /* …existing options… */ });

  // Only show the splash if the main window isn't ready within 250 ms.
  const timer = setTimeout(() => { if (!splash.isDestroyed()) splash.show(); }, 250);

  main.once("ready-to-show", () => {
    clearTimeout(timer);
    if (!splash.isDestroyed()) splash.destroy();
    main.show();
  });

  return { splash, main };
}
```

Optional status line (e.g. while the library index rebuilds):

```ts
splash.webContents.executeJavaScript(`setSplashStatus(${JSON.stringify("Indexing compendium…")})`);
```

## Tuning

- Speed: change `--turn` at the top of the file (default `1.8s` per turn including the pause).
- Size: the lockup is `min(46vw, 300px)` wide, so it scales with the window.
