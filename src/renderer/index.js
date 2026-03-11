let appContainer = null;

export async function mount(container) {
    console.log("[CrabNote] Mounting...");

    // 1. Create the plugin's root element
    appContainer = document.createElement('div');
    appContainer.id = 'crab-note-plugin-root';
    appContainer.className = 'w-full h-full overflow-hidden';

    // 2. Fetch the HTML template (we can just embed the essential part or fetch it)
    // For this refactor, we'll embed the core layout from index.html
    appContainer.innerHTML = `
    <div class="app-container" style="height: 100%; display: flex; flex-direction: column;">
        <div class="flex flex-1 overflow-hidden">
            <aside id="sidebar" class="sidebar">
                <div class="sidebar-header">
                    <div class="sidebar-title">
                        <span>Crab Note</span>
                    </div>
                </div>
                <div class="sidebar-tools">
                    <button id="today-btn" class="tool-btn">Today</button>
                    <button id="new-note-btn" class="tool-btn primary">New Note</button>
                </div>
                <div class="sidebar-nav">
                    <ul id="note-list" class="note-list"></ul>
                </div>
            </aside>
            <main class="editor-container flex-1 flex flex-col p-4 bg-[#1e1e1e]">
                <div class="editor-header mb-4">
                    <input type="text" id="note-title-input" class="text-2xl font-bold bg-transparent border-none outline-none text-white w-full" placeholder="Untitled">
                </div>
                <div class="editor-body-container flex-1">
                    <textarea id="note-body-input" class="w-full h-full bg-transparent border-none outline-none text-gray-300 resize-none" placeholder="Start typing..."></textarea>
                </div>
                <div id="save-status" class="text-xs text-gray-500 mt-2">Saved</div>
            </main>
        </div>
    </div>
  `;

    container.appendChild(appContainer);

    // 3. Initialize the plugin logic
    // we would normally import/require the refactored app.js here
    // For now, let's keep it simple and just do a basic wire-up
    setupEventListeners();
}

export async function unmount() {
    console.log("[CrabNote] Unmounting...");
    if (appContainer) {
        appContainer.remove();
        appContainer = null;
    }
}

function setupEventListeners() {
    const newNoteBtn = document.getElementById('new-note-btn');
    const noteBody = document.getElementById('note-body-input');
    const saveStatus = document.getElementById('save-status');

    newNoteBtn?.addEventListener('click', () => {
        document.getElementById('note-title-input').value = '';
        noteBody.value = '';
        saveStatus.textContent = 'New note created';
    });

    noteBody?.addEventListener('input', () => {
        saveStatus.textContent = 'Saving...';
        setTimeout(() => { saveStatus.textContent = 'Saved locally'; }, 1000);
    });
}
