const fs = require('node:fs');
const path = require('node:path');

const defaultDesktopSettings = {
  closeToTray: true,
  startMinimized: false,
  defaultProvider: 'bilibili',
  providerDefaultMigratedToBilibili: true,
  windowBounds: {
    width: 1360,
    height: 820,
    x: null,
    y: null,
    isMaximized: false
  }
};

function createSettingsStore(app) {
  const settingsPath = path.join(app.getPath('userData'), 'desktop-settings.json');

  return {
    load() {
      return loadDesktopSettings(settingsPath);
    },
    save(settings) {
      return saveDesktopSettings(settingsPath, settings);
    },
    path: settingsPath
  };
}

function loadDesktopSettings(settingsPath) {
  try {
    if (!fs.existsSync(settingsPath)) return { ...defaultDesktopSettings };
    const rawValue = fs.readFileSync(settingsPath, 'utf8');
    return sanitizeDesktopSettings(JSON.parse(rawValue));
  } catch {
    return { ...defaultDesktopSettings };
  }
}

function saveDesktopSettings(settingsPath, settings) {
  const nextSettings = sanitizeDesktopSettings(settings);
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(nextSettings, null, 2), 'utf8');
  return nextSettings;
}

function sanitizeDesktopSettings(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const requestedDefaultProvider =
    typeof raw.defaultProvider === 'string' && raw.defaultProvider.trim()
      ? raw.defaultProvider
      : defaultDesktopSettings.defaultProvider;
  const shouldMigrateLegacyDefaultProvider =
    requestedDefaultProvider === 'demo' && raw.providerDefaultMigratedToBilibili !== true;

  return {
    closeToTray:
      typeof raw.closeToTray === 'boolean' ? raw.closeToTray : defaultDesktopSettings.closeToTray,
    startMinimized:
      typeof raw.startMinimized === 'boolean' ? raw.startMinimized : defaultDesktopSettings.startMinimized,
    defaultProvider: shouldMigrateLegacyDefaultProvider ? 'bilibili' : requestedDefaultProvider,
    providerDefaultMigratedToBilibili: true,
    windowBounds: sanitizeWindowBounds(raw.windowBounds)
  };
}

function sanitizeWindowBounds(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const defaults = defaultDesktopSettings.windowBounds;

  return {
    width: clampInteger(raw.width, 1180, 3840, defaults.width),
    height: clampInteger(raw.height, 720, 2160, defaults.height),
    x: Number.isFinite(raw.x) ? Math.round(raw.x) : defaults.x,
    y: Number.isFinite(raw.y) ? Math.round(raw.y) : defaults.y,
    isMaximized: typeof raw.isMaximized === 'boolean' ? raw.isMaximized : defaults.isMaximized
  };
}

function clampInteger(value, min, max, fallback) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numberValue)));
}

module.exports = {
  createSettingsStore,
  defaultDesktopSettings,
  loadDesktopSettings,
  sanitizeDesktopSettings,
  saveDesktopSettings
};
