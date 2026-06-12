const { app, BrowserWindow, Menu, Tray, dialog, globalShortcut, ipcMain, nativeImage, shell, screen } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  createTrayMenuTemplate,
  createTrayToolTip,
  createWindowTitle,
  defaultDesktopPlaybackState,
  sanitizeDesktopPlaybackState
} = require('./playbackState.cjs');
const { createApiPortStatus, createApiUrl } = require('./apiPortStatus.cjs');
const { createSettingsStore, sanitizeDesktopSettings } = require('./settingsStore.cjs');

const isDev = process.env.ELECTRON_DEV === 'true';
const apiHost = '127.0.0.1';
const preferredApiPort = parsePreferredApiPort(process.env.API_PORT);
const iconPath = path.join(__dirname, '..', 'assets', 'icon.ico');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWindow;
let tray;
let apiServer;
let managedApiPort = preferredApiPort;
let managedApiUrl = createApiUrl(apiHost, managedApiPort);
let apiPortStatus = createApiPortStatus({
  preferredPort: preferredApiPort,
  actualPort: managedApiPort,
  host: apiHost,
  managedByApp: false,
  message: '本地 API 尚未启动'
});
let isQuitting = false;
let isMiniMode = false;
let settingsStore;
let desktopSettings;
let desktopPlaybackState = defaultDesktopPlaybackState;
let saveWindowBoundsTimer;
let windowBoundsBeforeMiniMode;
const miniModeBounds = {
  width: 560,
  height: 176
};

const hasSingleInstanceLock = app.requestSingleInstanceLock();

function createMainWindow() {
  const savedBounds = getSavedWindowBounds();
  mainWindow = new BrowserWindow({
    ...savedBounds,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: '#edf3ef',
    icon: iconPath,
    title: 'BiliWave',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required',
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  mainWindow.removeMenu();
  if (desktopSettings.windowBounds?.isMaximized) {
    mainWindow.maximize();
  }

  mainWindow.once('ready-to-show', () => {
    if (!desktopSettings.startMinimized) {
      mainWindow.show();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', (event) => {
    saveWindowBounds();
    sendMediaCommand('flush-playback-state');
    if (!isQuitting && desktopSettings.closeToTray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('resize', scheduleSaveWindowBounds);
  mainWindow.on('move', scheduleSaveWindowBounds);
  mainWindow.on('maximize', scheduleSaveWindowBounds);
  mainWindow.on('unmaximize', scheduleSaveWindowBounds);
  mainWindow.on('closed', () => {
    clearTimeout(saveWindowBoundsTimer);
    mainWindow = null;
  });

  if (isDev) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL || 'http://127.0.0.1:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });

  app.whenReady().then(() => {
    settingsStore = createSettingsStore(app);
    desktopSettings = settingsStore.load();
    startManagedApi()
      .catch((error) => {
        if (error?.code !== 'EADDRINUSE') {
          console.error('Failed to start managed API server:', error);
        }
      })
      .finally(() => {
        createMainWindow();
        createTray();
        registerShortcuts();
      });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
      showMainWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
  sendMediaCommand('flush-playback-state');
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (apiServer) {
    apiServer.close();
  }
});

ipcMain.handle('desktop:toggle-mini-mode', () => {
  toggleMiniMode();
  return {
    isMiniMode
  };
});

ipcMain.handle('desktop:show-main-window', () => {
  showMainWindow();
});

ipcMain.handle('desktop:get-settings', () => desktopSettings);

ipcMain.handle('desktop:get-app-info', () => ({
  name: 'BiliWave',
  version: app.getVersion(),
  apiPort: managedApiPort,
  apiUrl: managedApiUrl,
  apiStatus: apiPortStatus,
  userDataPath: app.getPath('userData'),
  cachePath: app.getPath('cache'),
  settingsPath: settingsStore?.path || '',
  isDev
}));

ipcMain.handle('desktop:get-api-url', () => managedApiUrl);

ipcMain.handle('desktop:get-api-status', () => apiPortStatus);

ipcMain.handle('desktop:get-audible-state', () => ({
  audible: Boolean(mainWindow?.webContents?.isCurrentlyAudible?.()),
  timestamp: Date.now()
}));

ipcMain.handle('desktop:update-settings', (_event, nextSettings) => {
  desktopSettings = sanitizeDesktopSettings({
    ...desktopSettings,
    closeToTray:
      typeof nextSettings?.closeToTray === 'boolean' ? nextSettings.closeToTray : desktopSettings.closeToTray,
    startMinimized:
      typeof nextSettings?.startMinimized === 'boolean' ? nextSettings.startMinimized : desktopSettings.startMinimized,
    defaultProvider:
      typeof nextSettings?.defaultProvider === 'string' && nextSettings.defaultProvider.trim()
        ? nextSettings.defaultProvider
        : desktopSettings.defaultProvider
  });
  settingsStore?.save(desktopSettings);
  return desktopSettings;
});

ipcMain.handle('desktop:update-playback-state', (_event, nextPlaybackState) => {
  desktopPlaybackState = sanitizeDesktopPlaybackState(nextPlaybackState);
  refreshDesktopPlaybackState();
  return desktopPlaybackState;
});

ipcMain.handle('desktop:flush-playback-state', () => {
  sendMediaCommand('flush-playback-state');
  return true;
});

ipcMain.handle('desktop:export-preferences', async (_event, exportPayload) => {
  const defaultPath = path.join(app.getPath('documents'), createPreferenceExportFileName());
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出 BiliWave 本地数据',
    defaultPath,
    filters: [{ name: 'BiliWave 数据备份', extensions: ['json'] }]
  });

  if (result.canceled || !result.filePath) {
    return {
      canceled: true,
      filePath: ''
    };
  }

  await fs.writeFile(result.filePath, JSON.stringify(exportPayload, null, 2), 'utf8');
  return {
    canceled: false,
    filePath: result.filePath
  };
});

ipcMain.handle('desktop:import-preferences', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '导入 BiliWave 本地数据',
    properties: ['openFile'],
    filters: [{ name: 'BiliWave 数据备份', extensions: ['json'] }]
  });

  if (result.canceled || !result.filePaths?.[0]) {
    return {
      canceled: true,
      filePath: '',
      content: ''
    };
  }

  const filePath = result.filePaths[0];
  const content = await fs.readFile(filePath, 'utf8');
  return {
    canceled: false,
    filePath,
    content
  };
});

function createTray() {
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip(createTrayToolTip(desktopPlaybackState));
  tray.setContextMenu(createTrayMenu());
  tray.on('double-click', showMainWindow);
}

function createTrayMenu() {
  return Menu.buildFromTemplate(
    createTrayMenuTemplate({
      playbackState: desktopPlaybackState,
      isMiniMode,
      actions: {
        togglePlay: () => sendMediaCommand('toggle-play'),
        previous: () => sendMediaCommand('previous'),
        next: () => sendMediaCommand('next'),
        showMainWindow,
        toggleMiniMode,
        quit: () => {
          isQuitting = true;
          sendMediaCommand('flush-playback-state');
          app.quit();
        }
      }
    })
  );
}

function registerShortcuts() {
  globalShortcut.register('MediaPlayPause', () => sendMediaCommand('toggle-play'));
  globalShortcut.register('MediaNextTrack', () => sendMediaCommand('next'));
  globalShortcut.register('MediaPreviousTrack', () => sendMediaCommand('previous'));
}

async function startManagedApi() {
  const apiModule = await import(pathToFileUrl(path.join(__dirname, '..', 'server', 'apiServer.js')));

  try {
    await listenApiServer(apiModule, preferredApiPort);
  } catch (error) {
    if (error?.code !== 'EADDRINUSE') {
      throw error;
    }

    if (isDev) {
      setManagedApiAddress(preferredApiPort);
      apiPortStatus = createApiPortStatus({
        preferredPort: preferredApiPort,
        actualPort: preferredApiPort,
        host: apiHost,
        conflictDetected: true,
        managedByApp: false,
        message: `本地 API 端口 ${preferredApiPort} 已被其他进程占用，开发模式将继续使用该端口。`
      });
      console.warn(`Managed API server skipped because ${managedApiUrl} is already in use.`);
      return;
    }

    console.warn(`API port ${preferredApiPort} is in use. Falling back to an available local port.`);
    await listenApiServer(apiModule, 0, {
      conflictDetected: true,
      message: `本地 API 端口 ${preferredApiPort} 已被其他进程占用，BiliWave 已自动切换到备用端口。`
    });
  }
}

function pathToFileUrl(filePath) {
  return `file://${filePath.replace(/\\/g, '/')}`;
}

async function listenApiServer(apiModule, port, options = {}) {
  apiServer = await apiModule.startApiServer({
    port,
    host: apiHost
  });
  const address = apiServer.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  setManagedApiAddress(actualPort);
  apiPortStatus = createApiPortStatus({
    preferredPort: preferredApiPort,
    actualPort,
    host: apiHost,
    conflictDetected: options.conflictDetected || actualPort !== preferredApiPort,
    managedByApp: true,
    message: options.message
  });
  console.log(`Managed API server running at ${managedApiUrl}`);
}

function parsePreferredApiPort(value) {
  const parsedPort = Number(value || 8787);
  if (Number.isFinite(parsedPort) && parsedPort >= 0 && parsedPort <= 65535) {
    return parsedPort;
  }
  return 8787;
}

function createPreferenceExportFileName() {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+$/, '')
    .replace('T', '-');
  return `BiliWave-data-${timestamp}.json`;
}

function setManagedApiAddress(port) {
  managedApiPort = port;
  managedApiUrl = createApiUrl(apiHost, port);
}

function getSavedWindowBounds() {
  const bounds = desktopSettings.windowBounds || {};
  const width = bounds.width || 1360;
  const height = bounds.height || 820;
  const options = {
    width,
    height
  };

  if (Number.isFinite(bounds.x) && Number.isFinite(bounds.y) && isSavedWindowVisible(bounds)) {
    options.x = bounds.x;
    options.y = bounds.y;
  }

  return options;
}

function isSavedWindowVisible(bounds) {
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;

  return screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    return centerX >= area.x && centerX <= area.x + area.width && centerY >= area.y && centerY <= area.y + area.height;
  });
}

function scheduleSaveWindowBounds() {
  if (isMiniMode) return;
  clearTimeout(saveWindowBoundsTimer);
  saveWindowBoundsTimer = setTimeout(saveWindowBounds, 300);
}

function saveWindowBounds() {
  if (!mainWindow || mainWindow.isDestroyed() || isMiniMode || !settingsStore || !desktopSettings) return;
  const nextBounds = getCurrentWindowBounds();
  if (!nextBounds) return;

  desktopSettings = sanitizeDesktopSettings({
    ...desktopSettings,
    windowBounds: nextBounds
  });
  settingsStore.save(desktopSettings);
}

function getCurrentWindowBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const bounds =
    typeof mainWindow.getNormalBounds === 'function' ? mainWindow.getNormalBounds() : mainWindow.getBounds();

  return {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    isMaximized: mainWindow.isMaximized()
  };
}

function restoreWindowBounds(bounds) {
  if (!mainWindow || mainWindow.isDestroyed() || !bounds) return;
  const nextBounds = sanitizeDesktopSettings({
    ...desktopSettings,
    windowBounds: bounds
  }).windowBounds;

  const nextWindowBounds = {
    width: nextBounds.width,
    height: nextBounds.height
  };

  if (Number.isFinite(nextBounds.x) && Number.isFinite(nextBounds.y)) {
    nextWindowBounds.x = nextBounds.x;
    nextWindowBounds.y = nextBounds.y;
  }

  mainWindow.setBounds(nextWindowBounds);

  if (nextBounds.isMaximized) {
    mainWindow.maximize();
  }
}

function sendMediaCommand(command) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('desktop:media-command', command);
  }
}

function refreshDesktopPlaybackState() {
  tray?.setToolTip(createTrayToolTip(desktopPlaybackState));
  tray?.setContextMenu(createTrayMenu());
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setTitle(createWindowTitle(desktopPlaybackState));
  }
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (isMiniMode) toggleMiniMode();
  mainWindow.show();
  mainWindow.focus();
}

function toggleMiniMode() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  isMiniMode = !isMiniMode;
  if (isMiniMode) {
    windowBoundsBeforeMiniMode = getCurrentWindowBounds();
    mainWindow.setMinimumSize(miniModeBounds.width, miniModeBounds.height);
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    }
    mainWindow.setSize(miniModeBounds.width, miniModeBounds.height);
    mainWindow.setAlwaysOnTop(true, 'floating');
    mainWindow.setResizable(false);
  } else {
    mainWindow.setResizable(true);
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setMinimumSize(1180, 720);
    restoreWindowBounds(windowBoundsBeforeMiniMode || desktopSettings.windowBounds);
    windowBoundsBeforeMiniMode = null;
  }

  tray?.setContextMenu(createTrayMenu());
  mainWindow.webContents.send('desktop:media-command', isMiniMode ? 'mini-mode-on' : 'mini-mode-off');
  mainWindow.show();
  mainWindow.focus();
}
