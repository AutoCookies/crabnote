const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('crabNote', {
    getNotes: (query) => ipcRenderer.invoke('notes:get', query),
    getNotesGrouped: () => ipcRenderer.invoke('notes:getGrouped'),
    saveNote: (note) => ipcRenderer.invoke('notes:save', note),
    searchNotes: (query) => ipcRenderer.invoke('notes:search', query),
    deleteNote: (id) => ipcRenderer.invoke('notes:delete', id),
    onToggleQuickSwitcher: (callback) => ipcRenderer.on('toggle-quick-switcher', callback),
    onGoToToday: (callback) => ipcRenderer.on('go-to-today', callback),
    
    // Code Bridge
    renameTag: (oldName, newName) => ipcRenderer.invoke('notes:renameTag', oldName, newName),
    updateNoteTags: (id, tags) => ipcRenderer.invoke('notes:updateTags', id, tags),
    readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
    watchFile: (path) => ipcRenderer.invoke('file:watch', path),
    unwatchFile: (path) => ipcRenderer.invoke('file:unwatch', path),
    onFileUpdate: (callback) => ipcRenderer.on('file-update', (event, data) => callback(data))
});
