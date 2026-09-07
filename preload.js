// preload.js
// Add safe, minimal APIs here if you need IPC later.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Example: send messages with ipcRenderer.invoke
});
