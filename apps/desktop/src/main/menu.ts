import { app, Menu, type MenuItemConstructorOptions } from 'electron';

/**
 * Application menu (ADR 0006). macOS needs one: without an Edit menu the standard Cmd+C/V/X/A
 * and Cmd+Q do nothing inside the renderer, and the app menu is where the OS expects Quit and
 * Hide. Windows keeps Electron's hidden default menu in development, so Ctrl+R and the devtools
 * shortcut work there; a packaged build gets no menu at all, so Alt cannot reveal Electron's
 * stock File/View/Help entries and the reload and devtools shortcuts are gone.
 */
export function installApplicationMenu(): void {
  if (process.platform !== 'darwin') {
    if (app.isPackaged) Menu.setApplicationMenu(null);
    return;
  }
  const developer: MenuItemConstructorOptions[] = app.isPackaged
    ? []
    : [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }];
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [...developer, { role: 'togglefullscreen' }],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
