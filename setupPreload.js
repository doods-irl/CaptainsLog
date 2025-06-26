const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    openFileDialog: () => ipcRenderer.send('open-file-dialog'),
    sendPath: (path) => ipcRenderer.send('receive-setup-path', path),
    receiveSelectedDirectory: (callback) => ipcRenderer.on('selected-directory', (event, path) => callback(path)),
});
