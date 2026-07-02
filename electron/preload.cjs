const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('biliwaveDesktop', {
  isDesktop: true,
  toggleMiniMode: () => ipcRenderer.invoke('desktop:toggle-mini-mode'),
  showMainWindow: () => ipcRenderer.invoke('desktop:show-main-window'),
  minimizeWindow: () => ipcRenderer.invoke('desktop:minimize-window'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('desktop:toggle-maximize-window'),
  closeWindow: () => ipcRenderer.invoke('desktop:close-window'),
  getWindowState: () => ipcRenderer.invoke('desktop:get-window-state'),
  getSettings: () => ipcRenderer.invoke('desktop:get-settings'),
  getAppInfo: () => ipcRenderer.invoke('desktop:get-app-info'),
  getApiUrl: () => ipcRenderer.invoke('desktop:get-api-url'),
  getApiStatus: () => ipcRenderer.invoke('desktop:get-api-status'),
  getAudibleState: () => ipcRenderer.invoke('desktop:get-audible-state'),
  updateSettings: (settings) => ipcRenderer.invoke('desktop:update-settings', settings),
  updatePlaybackState: (state) => ipcRenderer.invoke('desktop:update-playback-state', state),
  flushPlaybackState: () => ipcRenderer.invoke('desktop:flush-playback-state'),
  exportPreferences: (payload) => ipcRenderer.invoke('desktop:export-preferences', payload),
  importPreferences: () => ipcRenderer.invoke('desktop:import-preferences'),
  onMediaCommand: (callback) => {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on('desktop:media-command', listener);
    return () => ipcRenderer.removeListener('desktop:media-command', listener);
  },
  onWindowStateChange: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('desktop:window-state', listener);
    return () => ipcRenderer.removeListener('desktop:window-state', listener);
  }
});
