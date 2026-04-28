const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  requestShellState: () => ipcRenderer.send("request-shell-state"),
  requestHide: () => ipcRenderer.send("request-hide"),
  invokeHost: (method, params) => ipcRenderer.invoke("shell:invoke", { method, params }),
  onShellState: (callback) => ipcRenderer.on("shell-state", (_event, payload) => callback(payload)),
  onEditorCommand: (callback) => ipcRenderer.on("editor-command", (_event, payload) => callback(payload)),
});
