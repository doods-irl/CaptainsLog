const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    closeWindow: () => ipcRenderer.send('close-settings-window'),
    openExplorer: (path) => ipcRenderer.send('open-explorer', path),
    sendColor: (colorId) => ipcRenderer.send('commit-color-to-config', colorId),
    sendTheme: (themeId) => ipcRenderer.send('commit-theme-to-config', themeId),
});