// preload.cjs
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('desktopAudio', {
  listSources: async () => {
    // Passes an immediate dummy object back to React to trigger the capture sequence safely
    return [{ id: 'screen:0:0', name: 'System Audio' }];
  }
});