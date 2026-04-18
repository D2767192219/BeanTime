const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  dbGetAll:    () => ipcRenderer.invoke('db:getAll'),
  dbPut:       (ns, data) => ipcRenderer.invoke('db:put', ns, data),
  dbDel:       (ns, id)   => ipcRenderer.invoke('db:del', ns, id),
  dbPutFull:   (data)     => ipcRenderer.invoke('db:putFull', data),
  dbPutBatch:  (ns, items) => ipcRenderer.invoke('db:putBatch', ns, items),
  notify:      (title, body) => ipcRenderer.invoke('app:notify', title, body),
  openExternal: (url)       => ipcRenderer.invoke('app:openExternal', url),
  onDataImported: (callback) => ipcRenderer.on('data-imported', (event, data) => callback(data)),
  onShowToast:    (callback) => ipcRenderer.on('show-toast', (event, msg) => callback(msg)),
});
