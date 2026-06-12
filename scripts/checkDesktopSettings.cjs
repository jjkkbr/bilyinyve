const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  loadDesktopSettings,
  saveDesktopSettings,
  sanitizeDesktopSettings
} = require('../electron/settingsStore.cjs');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biliwave-settings-'));
const settingsPath = path.join(tempDir, 'desktop-settings.json');

const savedSettings = saveDesktopSettings(settingsPath, {
  closeToTray: false,
  startMinimized: true,
  defaultProvider: 'bilibili',
  windowBounds: {
    width: 1440,
    height: 900,
    x: 80,
    y: 60,
    isMaximized: true
  }
});

assert(savedSettings.closeToTray === false, 'closeToTray should persist false');
assert(savedSettings.startMinimized === true, 'startMinimized should persist true');
assert(savedSettings.defaultProvider === 'bilibili', 'defaultProvider should persist');
assert(savedSettings.windowBounds.width === 1440, 'window width should persist');
assert(savedSettings.windowBounds.height === 900, 'window height should persist');
assert(savedSettings.windowBounds.x === 80, 'window x should persist');
assert(savedSettings.windowBounds.y === 60, 'window y should persist');
assert(savedSettings.windowBounds.isMaximized === true, 'maximized state should persist');

const loadedSettings = loadDesktopSettings(settingsPath);
assert(loadedSettings.closeToTray === false, 'closeToTray should load false');
assert(loadedSettings.startMinimized === true, 'startMinimized should load true');
assert(loadedSettings.defaultProvider === 'bilibili', 'defaultProvider should load');
assert(loadedSettings.windowBounds.width === 1440, 'window width should load');
assert(loadedSettings.windowBounds.height === 900, 'window height should load');
assert(loadedSettings.windowBounds.x === 80, 'window x should load');
assert(loadedSettings.windowBounds.y === 60, 'window y should load');
assert(loadedSettings.windowBounds.isMaximized === true, 'maximized state should load');

const sanitizedSettings = sanitizeDesktopSettings({
  closeToTray: 'yes',
  startMinimized: null,
  defaultProvider: '',
  windowBounds: {
    width: 100,
    height: 100,
    x: 'left',
    y: 'top',
    isMaximized: 'yes'
  }
});
assert(sanitizedSettings.closeToTray === true, 'invalid closeToTray should fallback');
assert(sanitizedSettings.startMinimized === false, 'invalid startMinimized should fallback');
assert(sanitizedSettings.defaultProvider === 'bilibili', 'invalid defaultProvider should fallback');
assert(sanitizedSettings.windowBounds.width === 1180, 'invalid window width should clamp');
assert(sanitizedSettings.windowBounds.height === 720, 'invalid window height should clamp');
assert(sanitizedSettings.windowBounds.x === null, 'invalid window x should fallback');
assert(sanitizedSettings.windowBounds.y === null, 'invalid window y should fallback');
assert(sanitizedSettings.windowBounds.isMaximized === false, 'invalid maximized state should fallback');

fs.rmSync(tempDir, { recursive: true, force: true });
console.log('Desktop settings checks passed');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
