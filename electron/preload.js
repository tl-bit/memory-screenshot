const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  openOverlay: () => ipcRenderer.invoke('open-overlay'),
  closeOverlay: () => ipcRenderer.invoke('close-overlay'),
  captureRegion: (rect) => ipcRenderer.invoke('capture-region', rect),
  getLastRect: () => ipcRenderer.invoke('get-last-rect'),
  onStatus: (callback) => {
    const subscription = (_event, value) => callback(value)
    ipcRenderer.on('status', subscription)
    return () => ipcRenderer.removeListener('status', subscription)
  }
})
