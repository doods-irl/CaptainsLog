const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    refreshLogs: () => ipcRenderer.send('refresh-logs'),
    sendText: (formData) => ipcRenderer.send('text-submitted', formData),
});