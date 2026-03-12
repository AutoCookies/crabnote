/**
 * Crab Note IPC Shim for Cheesecrab Microkernel
 * Translates window.crabNote (Electron IPC) calls into standard fetch requests
 * aimed at the Cheesecrab Backend Proxy.
 */
const BACKEND_URL = 'http://127.0.0.1:11435/v1/spaces/plugins/ipc/crabnote';

window.crabNote = {
    getNotes: async (query) => {
        const url = `${BACKEND_URL}/notes${query ? '?q=' + encodeURIComponent(query) : ''}`;
        const resp = await fetch(url);
        const data = await resp.json();
        return { success: true, data };
    },
    getNotesGrouped: async () => {
        const resp = await fetch(`${BACKEND_URL}/notes/grouped`);
        const data = await resp.json();
        return { success: true, data };
    },
    saveNote: async (note) => {
        const resp = await fetch(`${BACKEND_URL}/notes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(note)
        });
        const data = await resp.json();
        return { success: true, data };
    },
    searchNotes: async (query) => {
        const resp = await fetch(`${BACKEND_URL}/notes?q=${encodeURIComponent(query)}`);
        const data = await resp.json();
        return { success: true, data };
    },
    deleteNote: async (id) => {
        const resp = await fetch(`${BACKEND_URL}/notes?id=${id}`, {
            method: 'DELETE'
        });
        const data = await resp.json();
        return { success: true, data };
    },
    renameTag: async (oldName, newName) => {
        const resp = await fetch(`${BACKEND_URL}/notes/rename-tag`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldName, newName })
        });
        const data = await resp.json();
        return { success: true, data };
    },
    updateNoteTags: async (id, tags) => {
        const resp = await fetch(`${BACKEND_URL}/notes/update-tags`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, tags })
        });
        const data = await resp.json();
        return { success: true, data };
    },
    readFile: async (path) => {
        const resp = await fetch(`${BACKEND_URL}/file?path=${encodeURIComponent(path)}`);
        const data = await resp.text();
        return { success: true, data };
    },
    watchFile: async (path) => {
        await fetch(`${BACKEND_URL}/watch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });
        return { success: true };
    },
    unwatchFile: async (path) => {
        await fetch(`${BACKEND_URL}/unwatch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });
        return { success: true };
    },

    // Event listeners - Currently stubs as Cheesecrab core needs event-stream support
    onToggleQuickSwitcher: (cb) => { console.log("[Shim] onToggleQuickSwitcher registered"); },
    onGoToToday: (cb) => { console.log("[Shim] onGoToToday registered"); },
    onFileUpdate: (cb) => { console.log("[Shim] onFileUpdate registered"); }
};
