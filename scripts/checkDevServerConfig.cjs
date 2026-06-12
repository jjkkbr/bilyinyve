const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.join(__dirname, '..');
const desktopDevScript = fs.readFileSync(path.join(rootDir, 'scripts', 'desktopDev.mjs'), 'utf8');
const electronMain = fs.readFileSync(path.join(rootDir, 'electron', 'main.cjs'), 'utf8');

assert(
  desktopDevScript.includes('waitForRendererUrl'),
  'desktop dev script should wait for the actual Vite renderer URL'
);
assert(
  desktopDevScript.includes('ELECTRON_RENDERER_URL'),
  'desktop dev script should pass the renderer URL to Electron'
);
assert(
  electronMain.includes('process.env.ELECTRON_RENDERER_URL'),
  'Electron dev mode should load the renderer URL from the environment'
);

console.log('Dev server config checks passed');
