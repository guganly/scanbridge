// desktop/preload.js - Electron 预加载脚本
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('scanbridge', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  onServerStopped: (callback) => {
    ipcRenderer.on('server-stopped', (_, data) => callback(data));
  },
});
