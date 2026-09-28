// Runs `electron-vite dev` with ELECTRON_RUN_AS_NODE removed from the environment.
// Editor and extension-host terminals often export it, which makes Electron start
// as plain Node and exit with "bad option" instead of opening windows.
import { spawn } from 'node:child_process';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn('electron-vite', ['dev', ...process.argv.slice(2)], {
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0));
});
