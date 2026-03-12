let appContainer = null;

export async function mount(container) {
    console.log("[CrabNote] Mounting...");

    // 1. Inject Styles & Scripts
    if (!document.getElementById('crab-note-styles')) {
        const lucide = document.createElement('script');
        lucide.src = 'https://unpkg.com/lucide@latest';
        lucide.onload = () => { if (window.lucide) window.lucide.createIcons(); };
        document.head.appendChild(lucide);

        const link = document.createElement('link');
        link.id = 'crab-note-styles';
        link.rel = 'stylesheet';
        link.href = '/plugins/crabnote/dist/styles.css';
        document.head.appendChild(link);

        const prismLink = document.createElement('link');
        prismLink.rel = 'stylesheet';
        prismLink.href = '/plugins/crabnote/dist/lib/prism.css';
        document.head.appendChild(prismLink);
    }

    // 2. Create the plugin's root element
    appContainer = document.createElement('div');
    appContainer.id = 'crab-note-plugin-root';
    appContainer.className = 'w-full h-full overflow-hidden';

    // 3. Inject Full HTML
    appContainer.innerHTML = `
    <div class="app-container" style="height: 100%; display: flex; flex-direction: column;">
        <div class="flex flex-1 overflow-hidden">
            <aside id="sidebar" class="sidebar">
                <div class="sidebar-header">
                    <div class="sidebar-title">
                        <img src="/plugins/crabnote/assets/logo.png" alt="Crab" width="24" height="24">
                        <span>Crab Note</span>
                    </div>
                </div>

                <div class="sidebar-tools">
                    <button id="today-btn" class="tool-btn">
                        <span>Today</span>
                    </button>
                    <button id="new-note-btn" class="tool-btn primary">
                        <span>New Note</span>
                    </button>
                </div>

                <div class="sidebar-nav">
                    <div class="nav-section">
                        <h3 class="section-title">NOTES</h3>
                        <ul id="note-list" class="note-list"></ul>
                    </div>
                </div>
            </aside>

            <main class="editor-container flex-1">
                <div class="editor-header">
                    <div class="status-indicator" id="save-status">Saved</div>
                </div>

                <div class="editor-content p-8">
                    <input type="text" id="note-title-input" class="editor-title w-full text-4xl font-bold bg-transparent border-none outline-none mb-4" placeholder="Untitled">
                    <div class="editor-body-container">
                        <textarea id="note-body-input" class="editor-body w-full h-[60vh] bg-transparent border-none outline-none resize-none" placeholder="Start typing..."></textarea>
                    </div>
                </div>
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
