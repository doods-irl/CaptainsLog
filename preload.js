const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    refreshLogs: () => ipcRenderer.send('refresh-logs'),
    sendText: (formData) => ipcRenderer.send('text-submitted', formData),
    markDone: (logData) => ipcRenderer.send('modify-log-done', logData),
    deleteLog: (logData) => ipcRenderer.send('modify-log-delete', logData),
    editLog: (logData) => ipcRenderer.send('modify-log-edit', logData),
    deleteCategory: (category) => ipcRenderer.send('modify-category-delete', category),
    emptyCategory: (category) => ipcRenderer.send('modify-category-empty', category),
    moveCategory: (content, number) => ipcRenderer.send('modify-category-move', content, number),
    requestHide: () => ipcRenderer.send('request-hide'),
});
