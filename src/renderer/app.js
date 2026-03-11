// State
let notes = [];
let groupedNotes = []; // New state for sidebar grouping
let currentNoteId = null;
let dirtyNoteIds = new Set(); // Track note IDs with unsaved changes
let expandedTags = new Set(JSON.parse(localStorage.getItem('crabnote-expanded-tags') || '["Untagged"]'));

// Settings State
let appSettings = JSON.parse(localStorage.getItem('crabnote-settings') || JSON.stringify({
    autoSave: true,
    saveInterval: 60000, // default 1 minute
    theme: 'dark'
}));

// DOM Elements
const sidebar = document.getElementById('sidebar');
const toggleSidebarBtn = document.getElementById('toggle-sidebar');
const showSidebarBtn = document.getElementById('show-sidebar');
const noteListElement = document.getElementById('note-list');
const noteTitleInput = document.getElementById('note-title-input');
const noteBodyInput = document.getElementById('note-body-input');
const newNoteBtn = document.getElementById('new-note-btn');
const todayBtn = document.getElementById('today-btn');
const saveStatus = document.getElementById('save-status');
const tabBar = document.getElementById('tab-bar');
const settingsBtn = document.getElementById('settings-btn');
const settingsOverlay = document.getElementById('settings-overlay');
const settingsModalClose = document.getElementById('settings-modal-close');
const autoSaveToggle = document.getElementById('auto-save-toggle');
const saveIntervalSelect = document.getElementById('save-interval');
const saveIntervalRow = document.getElementById('auto-save-interval-row');

let openNoteIds = []; // Array of note IDs currently open as tabs

// Debounce helper for auto-saving
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Theme System
function setTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem('crabnote-theme', themeName);
    
    // Update UI buttons
    document.querySelectorAll('.theme-btn').forEach(btn => {
        if (btn.getAttribute('data-theme') === themeName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Refresh icons if needed
    if (window.lucide) lucide.createIcons();
}

document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        setTheme(btn.getAttribute('data-theme'));
    });
});

// Quick Switcher DOM
const qsOverlay = document.getElementById('quick-switcher-overlay');
const qsInput = document.getElementById('quick-switcher-input');
const qsResults = document.getElementById('quick-switcher-results');
let qsResultsData = [];
let qsSelectedIndex = 0;
let currentWatchedFiles = new Set();

let wikiSelectedIndex = 0;

// Context Menu DOM
const contextMenu = document.getElementById('context-menu');
const contextMenuOverlay = document.getElementById('context-menu-overlay');
const ctxDeleteNote = document.getElementById('ctx-delete-note');
const ctxEditTags = document.getElementById('ctx-edit-tags');
const ctxRenameTag = document.getElementById('ctx-rename-tag');
const tagEditorOverlay = document.getElementById('tag-editor-overlay');
const tagEditorInput = document.getElementById('tag-editor-input');
const tagModalSave = document.getElementById('tag-modal-save');
const tagModalCancel = document.getElementById('tag-modal-cancel');
const tagModalTitle = document.getElementById('tag-modal-title');
const tagModalDesc = document.getElementById('tag-modal-desc');

let contextTargetId = null;
let contextTargetTag = null;
let modalTargetId = null;
let modalTargetTag = null;
let tagModalMode = 'note'; // 'note' or 'global'

// Slash Menu DOM
const slashMenu = document.getElementById('slash-menu');
const slashMenuList = document.getElementById('slash-menu-list');
let slashQuery = '';
let slashSelectedIndex = 0;
let isSlashMenuOpen = false;

const slashCommands = [
    { label: 'Heading 1', icon: 'heading-1', syntax: '# ', search: 'h1 heading1' },
    { label: 'Heading 2', icon: 'heading-2', syntax: '## ', search: 'h2 heading2' },
    { label: 'Heading 3', icon: 'heading-3', syntax: '### ', search: 'h3 heading3' },
    { label: 'Checklist', icon: 'check-square', syntax: '- [ ] ', search: 'checklist todo task' },
    { label: 'Bullet List', icon: 'list', syntax: '- ', search: 'bullet list' },
    { label: 'Numbered List', icon: 'list-ordered', syntax: '1. ', search: 'number list' },
    { label: 'Code Block', icon: 'code', syntax: '```\n\n```', search: 'code block snippet' },
    { label: 'Table', icon: 'table', syntax: '| Column 1 | Column 2 |\n| -------- | -------- |\n| Cell 1 | Cell 2 |', search: 'table grid board' },
    { label: 'Divider', icon: 'minus', syntax: '\n---\n', search: 'divider horizontal rule' }
];

// Unsaved Changes Modal DOM
const unsavedOverlay = document.getElementById('unsaved-changes-overlay');
const unsavedDesc = document.getElementById('unsaved-modal-desc');
const unsavedCancel = document.getElementById('unsaved-modal-cancel');
const unsavedDiscard = document.getElementById('unsaved-modal-discard');
const unsavedSave = document.getElementById('unsaved-modal-save');
let tabIdToClose = null;

// Sidebar toggle logic
function toggleSidebar() {
    sidebar.classList.toggle('collapsed');
    if (sidebar.classList.contains('collapsed')) {
        showSidebarBtn.classList.remove('hidden');
    } else {
        showSidebarBtn.classList.add('hidden');
    }
}

toggleSidebarBtn.addEventListener('click', toggleSidebar);
showSidebarBtn.addEventListener('click', toggleSidebar);

// -- Quick Switcher Logic --
function toggleQuickSwitcher() {
    const isHidden = qsOverlay.classList.contains('hidden');
    if (isHidden) {
        qsOverlay.classList.remove('hidden');
        qsInput.value = '';
        qsResults.innerHTML = '';
        qsInput.focus();
    } else {
        qsOverlay.classList.add('hidden');
    }
}

// Receive Ctrl+K from Main process
if (window.crabNote && window.crabNote.onToggleQuickSwitcher) {
    window.crabNote.onToggleQuickSwitcher(() => {
        toggleQuickSwitcher();
    });
}

if (window.crabNote && window.crabNote.onGoToToday) {
    window.crabNote.onGoToToday(() => {
        openDailyNote();
    });
}

// Receive Live File Updates from Go
if (window.crabNote && window.crabNote.onFileUpdate) {
    window.crabNote.onFileUpdate((data) => {
        if (data.type === 'file_update') {
            const blocks = document.querySelectorAll(`pre[data-path="${CSS.escape(data.path)}"] code`);
            blocks.forEach(block => {
                block.textContent = data.content;
                if (window.Prism) Prism.highlightElement(block);
            });
        } else if (data.type === 'file_error') {
            console.error('[Code Bridge] File Error:', data.error);
        }
    });
}

// Global Escape to close modal
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !qsOverlay.classList.contains('hidden')) {
        toggleQuickSwitcher();
    }
});

// Search input handling
qsInput.addEventListener('input', debounce(async (e) => {
    const query = e.target.value.trim();
    if (query.length < 2) {
        qsResults.innerHTML = '';
        return;
    }

    const response = await window.crabNote.searchNotes(query);
    if (response && response.success) {
        qsResultsData = response.data;
        renderQSResults();
    }
}, 150));

function renderQSResults() {
    qsResults.innerHTML = '';
    qsSelectedIndex = 0;
    
    qsResultsData.forEach((result, index) => {
        const div = document.createElement('div');
        div.className = `search-result-item ${index === 0 ? 'selected' : ''}`;
        div.innerHTML = `
            <div class="search-result-title">${result.title}</div>
            <div class="search-result-snippet">${result.snippet}</div>
        `;
        div.addEventListener('click', () => {
            selectNote(result.id);
            toggleQuickSwitcher();
        });
        qsResults.appendChild(div);
    });
}

// Keyboard navigation for Quick Switcher
qsInput.addEventListener('keydown', (e) => {
    const items = qsResults.querySelectorAll('.search-result-item');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        items[qsSelectedIndex].classList.remove('selected');
        qsSelectedIndex = (qsSelectedIndex + 1) % items.length;
        items[qsSelectedIndex].classList.add('selected');
        items[qsSelectedIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        items[qsSelectedIndex].classList.remove('selected');
        qsSelectedIndex = (qsSelectedIndex - 1 + items.length) % items.length;
        items[qsSelectedIndex].classList.add('selected');
        items[qsSelectedIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (qsResultsData[qsSelectedIndex]) {
            selectNote(qsResultsData[qsSelectedIndex].id);
            toggleQuickSwitcher();
        }
    }
});

// -- Wiki-link Detection --
noteBodyInput.addEventListener('input', (e) => {
    const value = e.target.value;
    const selectionStart = e.target.selectionStart;
    const textBefore = value.substring(0, selectionStart);
    
    if (textBefore.endsWith('[[')) {
        showWikiPopover(e.target);
    } else if (textBefore.endsWith('/')) {
        const lastChar = textBefore[textBefore.length - 2];
        if (!lastChar || lastChar === ' ' || lastChar === '\n') {
            showSlashMenu(e.target);
        }
    } else if (isSlashMenuOpen) {
        const lastSlash = textBefore.lastIndexOf('/');
        slashQuery = textBefore.substring(lastSlash + 1);
        renderSlashMenu();
    } else if (!wikiPopover.classList.contains('hidden')) {
        // Simple search logic for following text
        const lastIndex = textBefore.lastIndexOf('[[');
        const query = textBefore.substring(lastIndex + 2);
        if (query.includes('\n')) {
            hideWikiPopover();
        } else {
            searchWikiLinks(query);
        }
    }
});

async function searchWikiLinks(query) {
    if (query.trim().length === 0) {
        // Show recent notes or nothing
        wikiResults.innerHTML = '';
        return;
    }
    
    const response = await window.crabNote.searchNotes(query);
    if (response && response.success) {
        wikiResultsData = response.data;
        renderWikiResults();
    }
}

function renderWikiResults() {
    wikiResults.innerHTML = '';
    wikiSelectedIndex = 0;
    
    wikiResultsData.forEach((result, index) => {
        const li = document.createElement('li');
        li.className = `wiki-item ${index === 0 ? 'selected' : ''}`;
        li.textContent = result.title;
        li.addEventListener('click', () => insertWikiLink(result.title));
        wikiResults.appendChild(li);
    });
    
    if (wikiResultsData.length === 0) {
        hideWikiPopover();
    }
}

function insertWikiLink(title) {
    const value = noteBodyInput.value;
    const selectionStart = noteBodyInput.selectionStart;
    const textBefore = value.substring(0, selectionStart);
    const lastIndex = textBefore.lastIndexOf('[[');
    
    const newValue = value.substring(0, lastIndex) + `[[${title}]]` + value.substring(selectionStart);
    noteBodyInput.value = newValue;
    hideWikiPopover();
    noteBodyInput.focus();
    saveCurrentNote();
}

function showWikiPopover(textarea) {
    // Basic positioning (can be improved with measuring text)
    wikiPopover.classList.remove('hidden');
    const { offsetLeft, offsetTop } = textarea;
    wikiPopover.style.left = `${offsetLeft + 60}px`;
    wikiPopover.style.top = `${offsetTop + 100}px`;
}

function hideWikiPopover() {
    wikiPopover.classList.add('hidden');
}

// -- Slash Menu Logic --
function showSlashMenu(textarea) {
    const coords = getCaretCoordinates(textarea, textarea.selectionStart);
    slashMenu.style.left = `${coords.left}px`;
    slashMenu.style.top = `${coords.top + 24}px`;
    slashMenu.classList.remove('hidden');
    isSlashMenuOpen = true;
    slashQuery = '';
    renderSlashMenu();
}

function hideSlashMenu() {
    slashMenu.classList.add('hidden');
    isSlashMenuOpen = false;
}

function renderSlashMenu() {
    slashMenuList.innerHTML = '';
    const filtered = slashCommands.filter(cmd => 
        cmd.search.includes(slashQuery.toLowerCase()) || 
        cmd.label.toLowerCase().includes(slashQuery.toLowerCase())
    );

    if (filtered.length === 0) {
        hideSlashMenu();
        return;
    }

    slashSelectedIndex = Math.min(slashSelectedIndex, filtered.length - 1);

    filtered.forEach((cmd, index) => {
        const li = document.createElement('li');
        li.className = `slash-item ${index === slashSelectedIndex ? 'selected' : ''}`;
        li.innerHTML = `<span class="icon"><i data-lucide="${cmd.icon}"></i></span><span class="label">${cmd.label}</span>`;
        li.addEventListener('click', () => applySlashCommand(cmd));
        slashMenuList.appendChild(li);
    });

    if (window.lucide) lucide.createIcons();
}

function applySlashCommand(cmd) {
    const value = noteBodyInput.value;
    const end = noteBodyInput.selectionStart;
    const start = end - slashQuery.length - 1; // -1 for the '/'
    
    const before = value.substring(0, start);
    const after = value.substring(end);
    
    noteBodyInput.value = before + cmd.syntax + after;
    
    hideSlashMenu();
    noteBodyInput.focus();
    
    // Set caret position after syntax
    const newPos = start + cmd.syntax.indexOf('\n') !== -1 ? start + (cmd.syntax.length / 2) : start + cmd.syntax.length;
    // For code blocks we want it inside
    let finalPos = start + cmd.syntax.length;
    if (cmd.syntax.startsWith('```')) finalPos = start + 4;
    
    noteBodyInput.setSelectionRange(finalPos, finalPos);
    saveCurrentNote();
}

/**
 * Robust Caret Coordinate Calculation for Textarea
 * Inspired by textarea-caret-position library patterns
 */
function getCaretCoordinates(element, position) {
    const properties = [
        'direction', 'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
        'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
        'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontSizeAdjust', 'lineHeight', 'fontFamily',
        'textAlign', 'textTransform', 'textIndent', 'textDecoration', 'letterSpacing', 'wordSpacing', 'tabSize', 'MozTabSize'
    ];

    const div = document.createElement('div');
    div.id = 'input-textarea-caret-position-mirror-div';
    document.body.appendChild(div);

    const style = div.style;
    const computed = window.getComputedStyle(element);

    style.whiteSpace = 'pre-wrap';
    style.wordWrap = 'break-word';
    style.position = 'absolute';
    style.visibility = 'hidden';

    properties.forEach(prop => {
        style[prop] = computed[prop];
    });

    div.textContent = element.value.substring(0, position);
    
    const span = document.createElement('span');
    span.textContent = element.value.substring(position) || '.';
    div.appendChild(span);

    const coords = {
        top: span.offsetTop + parseInt(computed['borderTopWidth']),
        left: span.offsetLeft + parseInt(computed['borderLeftWidth'])
    };

    const rect = element.getBoundingClientRect();
    coords.top += rect.top + window.scrollY - element.scrollTop;
    coords.left += rect.left + window.scrollX - element.scrollLeft;

    document.body.removeChild(div);
    return coords;
}

// Keyboard navigation for Wiki/Slash popovers
noteBodyInput.addEventListener('keydown', (e) => {
    // 1. Handle Slash Menu
    if (isSlashMenuOpen) {
        const filtered = slashCommands.filter(cmd => 
            cmd.search.includes(slashQuery.toLowerCase()) || 
            cmd.label.toLowerCase().includes(slashQuery.toLowerCase())
        );

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            slashSelectedIndex = (slashSelectedIndex + 1) % filtered.length;
            renderSlashMenu();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            slashSelectedIndex = (slashSelectedIndex - 1 + filtered.length) % filtered.length;
            renderSlashMenu();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filtered[slashSelectedIndex]) {
                applySlashCommand(filtered[slashSelectedIndex]);
            }
        } else if (e.key === 'Escape' || e.key === ' ') {
            hideSlashMenu();
        }
        return;
    }

    // 2. Handle Wiki Popover
    if (!wikiPopover.classList.contains('hidden')) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            updateWikiSelection(1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            updateWikiSelection(-1);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (wikiResultsData[wikiSelectedIndex]) {
                insertWikiLink(wikiResultsData[wikiSelectedIndex].title);
            }
        } else if (e.key === 'Escape') {
            hideWikiPopover();
        }
        return;
    }
});

function updateWikiSelection(dir) {
    const items = wikiResults.querySelectorAll('.wiki-item');
    if (items.length === 0) return;
    
    items[wikiSelectedIndex].classList.remove('selected');
    wikiSelectedIndex = (wikiSelectedIndex + dir + items.length) % items.length;
    items[wikiSelectedIndex].classList.add('selected');
}

// Preview Logic
const notePreview = document.getElementById('note-preview');
const togglePreviewBtn = document.getElementById('toggle-preview');

togglePreviewBtn.addEventListener('click', async () => {
    const isShowingPreview = !notePreview.classList.contains('hidden');
    if (isShowingPreview) {
        // Switch to Edit
        notePreview.classList.add('hidden');
        noteBodyInput.classList.remove('hidden');
        togglePreviewBtn.textContent = 'Preview';
        noteBodyInput.focus();
    } else {
        // Switch to Preview
        await renderPreview();
        notePreview.classList.remove('hidden');
        noteBodyInput.classList.add('hidden');
        togglePreviewBtn.textContent = 'Edit';
    }
});

async function renderPreview() {
    let content = noteBodyInput.value;
    
    // 1. Unwatch old files
    for (const path of currentWatchedFiles) {
        window.crabNote.unwatchFile(path);
    }
    currentWatchedFiles.clear();

    // 2. Simple Wiki-link parser
    const wikiLinkRegex = /\[\[(.*?)\]\]/g;
    content = content.replace(wikiLinkRegex, (match, title) => {
        return `<span class="wiki-link" data-title="${title}">${title}</span>`;
    });
    
    // 3. Very basic markdown (bold/italic)
    content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    content = content.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // 3.5 Interactive Checklists
    // We parse these before the code block protection if they are simple, 
    // but better to do them carefully.
    const checklistRegex = /^(\s*)-\s\[(x| )\]\s(.*)$/gm;
    let checkboxIndex = 0;
    content = content.replace(checklistRegex, (match, indent, checked, text) => {
        const isChecked = checked.toLowerCase() === 'x';
        // We embed the original match so we can find it back in the text
        return `<div class="task-list-item ${isChecked ? 'checked' : ''}" data-task-id="${checkboxIndex++}">
            <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleTask(this, \`${match.replace(/`/g, '\\`')}\`)">
            <span class="task-text">${text}</span>
        </div>`;
    });
    
    // 4. Custom Code/Embed Parser
    // Process code blocks first to protect from <br> injection
    const codeBlocks = [];
    const codeRegex = /```(\w+)?\n([\s\S]*?)```/g;
    
    let match;
    while ((match = codeRegex.exec(content)) !== null) {
        const lang = match[1] || 'plaintext';
        const code = match[2];
        const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
        
        if (lang === 'embed') {
            const filePath = code.trim();
            const response = await window.crabNote.readFile(filePath);
            const fileContent = response.success ? response.data : `Error: ${response.error || 'File not found'}`;
            
            // Watch it
            window.crabNote.watchFile(filePath);
            currentWatchedFiles.add(filePath);

            codeBlocks.push(`
                <div class="embed-header">
                    <span>${filePath.split(/[\\/]/).pop()}</span>
                    <span style="font-size: 10px; opacity: 0.6;">LIVE</span>
                </div>
                <pre class="language-cpp" data-path="${filePath}"><code class="language-cpp">${fileContent}</code><button class="copy-btn" onclick="copyCode(this)">Copy</button></pre>
                <div class="embed-footer">${filePath}</div>
            `);
        }
        
        content = content.slice(0, match.index) + placeholder + content.slice(codeRegex.lastIndex);
        codeRegex.lastIndex = match.index + placeholder.length;
    }

    // 5. Table Parser
    const tableRegex = /^\|(.+)\|$\n^\|([- :|]+)\|$\n(^\|(.+)\|$\n?)+/gm;
    content = content.replace(tableRegex, (match) => {
        const rows = match.trim().split('\n');
        const headerRow = rows[0].split('|').filter(cell => cell.trim() !== '').map(cell => cell.trim());
        const bodyRows = rows.slice(2).map(row => row.split('|').filter(cell => cell.trim() !== '').map(cell => cell.trim()));

        let html = '<div class="table-container"><table><thead><tr>';
        headerRow.forEach(header => {
            html += `<th>${header}</th>`;
        });
        html += '</tr></thead><tbody>';
        
        bodyRows.forEach(row => {
            html += '<tr>';
            row.forEach(cell => {
                html += `<td>${cell}</td>`;
            });
            html += '</tr>';
        });

        html += '</tbody></table></div>';
        return html;
    });

    // Replace newlines with <br> EXCEPT in placeholders and table containers
    content = content.split(/\n/).map(line => {
        if (line.startsWith('__CODE_BLOCK_')) return line;
        if (line.includes('<div class="table-container">') || line.includes('</div>') || line.includes('<table>') || line.includes('</table>') || line.includes('<tr>') || line.includes('</tr>') || line.includes('<td>') || line.includes('</td>') || line.includes('<th>') || line.includes('</th>') || line.includes('<thead>') || line.includes('</thead>') || line.includes('<tbody>') || line.includes('</tbody>')) return line;
        return line + '<br>';
    }).join('');
    
    // Restore code blocks
    codeBlocks.forEach((html, i) => {
        content = content.replace(`__CODE_BLOCK_${i}__`, html);
    });
    
    notePreview.innerHTML = content;
    
    // Highlight all blocks
    if (window.Prism) Prism.highlightAllUnder(notePreview);

    // Add click listeners to wiki-links
    notePreview.querySelectorAll('.wiki-link').forEach(link => {
        link.addEventListener('click', async () => {
            const title = link.getAttribute('data-title');
            const note = notes.find(n => n.title.toLowerCase() === title.toLowerCase());
            if (note) {
                selectNote(note.id);
                renderPreview();
            }
        });
    });
}

function copyCode(btn) {
    const code = btn.parentElement.querySelector('code').textContent;
    navigator.clipboard.writeText(code);
    const originalText = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = originalText, 2000);
}

async function openDailyNote() {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    // Check if it exists
    let note = notes.find(n => n.title === todayStr);
    
    if (!note) {
        // Create it
        const template = `# Daily Note: ${todayStr}\n\n## Tasks\n- [ ] `;
        const newNote = {
            id: 0,
            title: todayStr,
            content: template,
            tags: ['daily']
        };
        
        if (window.crabNote && window.crabNote.saveNote) {
            const response = await window.crabNote.saveNote(newNote);
            if (response && response.success) {
                note = response.data;
                notes.unshift(note);
            }
        } else {
            // Fallback for dev without backend
            notes.unshift(newNote);
            note = newNote;
        }
    }
    
    if (note) {
        await selectNote(note.id);
        // Automatically switch to Preview for daily notes? Maybe not, let user decide.
        // But let's ensure the view is updated.
        renderNotesList();
    }
}

async function toggleTask(checkbox, originalMarkdownLine) {
    const isChecked = checkbox.checked;
    const newMarkdownLine = isChecked ? originalMarkdownLine.replace('[ ]', '[x]') : originalMarkdownLine.replace('[x]', '[ ]');
    
    // Update raw content
    const rawContent = noteBodyInput.value;
    const updatedContent = rawContent.replace(originalMarkdownLine, newMarkdownLine);
    
    noteBodyInput.value = updatedContent;
    
    // UI Feedback
    checkbox.parentElement.classList.toggle('checked', isChecked);
    
    // Save
    saveStatus.textContent = 'Saving task...';
    await saveCurrentNote();
}

todayBtn.addEventListener('click', openDailyNote);

// Render notes list with tag grouping
async function renderNotesList() {
    if (window.crabNote && window.crabNote.getNotesGrouped) {
        const response = await window.crabNote.getNotesGrouped();
        if (response && response.success) {
            groupedNotes = response.data;
        }
    }

    noteListElement.innerHTML = '';

    // Group notes by tag
    const groups = {};
    groupedNotes.forEach(item => {
        if (!groups[item.tag]) groups[item.tag] = [];
        groups[item.tag].push(item);
    });

    // Sort tags: Untagged first, then others alphabetically
    const tags = Object.keys(groups).sort((a, b) => {
        if (a === 'Untagged') return -1;
        if (b === 'Untagged') return 1;
        return a.localeCompare(b);
    });

    tags.forEach(tag => {
        const section = document.createElement('div');
        section.className = `tag-group ${expandedTags.has(tag) ? 'expanded' : ''}`;
        
        const header = document.createElement('div');
        header.className = 'tag-header';
        header.innerHTML = `
            <i data-lucide="chevron-right" class="chevron"></i>
            <span class="tag-name">${tag}</span>
            <span class="tag-count">${groups[tag].length}</span>
        `;
        header.addEventListener('click', () => toggleTagSection(tag));
        
        const content = document.createElement('div');
        content.className = 'tag-content';
        const inner = document.createElement('div');
        inner.className = 'tag-content-inner';

        groups[tag].forEach(note => {
            const li = document.createElement('div');
            li.className = `note-item ${note.id === currentNoteId ? 'active' : ''}`;
            li.addEventListener('click', (e) => {
                // Do NOT stop propagation here so global click to hide context menu works
                selectNote(note.id);
            });

            // Context Menu Listener for Note
            li.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showContextMenu(e, 'note', { id: note.id, tag: note.tag });
            });

            const titleSpan = document.createElement('div');
            titleSpan.className = 'note-item-title';
            titleSpan.textContent = note.title || 'Untitled';

            li.appendChild(titleSpan);
            inner.appendChild(li);
        });

        // Context Menu Listener for Tag Header
        header.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showContextMenu(e, 'tag', tag);
        });

        content.appendChild(inner);
        section.appendChild(header);
        section.appendChild(content);
        noteListElement.appendChild(section);
    });

    if (window.lucide) lucide.createIcons();
}

/** Context Menu Logic **/
function showContextMenu(e, type, target) {
    e.preventDefault();
    e.stopPropagation();

    contextTargetId = type === 'note' ? target.id : null;
    const activeTag = type === 'note' ? target.tag : target;
    contextTargetTag = activeTag;

    // Show/Hide relevant items
    ctxDeleteNote.classList.toggle('hidden', type !== 'note');
    ctxEditTags.classList.toggle('hidden', type !== 'note');
    
    // Rename Tag Globally: show if it's a real tag OR a note under a real tag
    const isRealTag = activeTag && activeTag !== 'Untagged';
    ctxRenameTag.classList.toggle('hidden', !isRealTag); // Re-enabled for notes too!

    // Show menu and overlay
    contextMenu.classList.remove('hidden');
    contextMenuOverlay.classList.remove('hidden');
    
    // Initialize icons immediately while visible
    if (window.lucide) lucide.createIcons();
    
    // Positioning
    const posX = e.clientX;
    const posY = e.clientY;
    contextMenu.style.left = `${posX}px`;
    contextMenu.style.top = `${posY}px`;

    // Boundary check
    const rect = contextMenu.getBoundingClientRect();
    if (posX + rect.width > window.innerWidth) {
        contextMenu.style.left = `${window.innerWidth - rect.width - 5}px`;
    }
    if (posY + rect.height > window.innerHeight) {
        contextMenu.style.top = `${window.innerHeight - rect.height - 5}px`;
    }
}

function hideContextMenu() {
    contextMenu.classList.add('hidden');
    contextMenuOverlay.classList.add('hidden');
    contextTargetId = null;
    contextTargetTag = null;
}

// Global Overlay and Escape Key closing
contextMenuOverlay.addEventListener('mousedown', hideContextMenu);
window.addEventListener('keydown', (e) => { 
    if(e.key === 'Escape') hideContextMenu(); 
});

ctxDeleteNote.addEventListener('click', (e) => {
    e.stopPropagation();
    const targetId = contextTargetId;
    hideContextMenu();
    if (targetId) deleteNoteById(targetId);
});

ctxEditTags.addEventListener('click', async (e) => {
    e.stopPropagation();
    const targetId = contextTargetId;
    hideContextMenu(); 
    if (!targetId) return;

    modalTargetId = targetId;
    
    // Fetch existing note to get current tags precisely
    const response = await window.crabNote.getNotes();
    if (!response || !response.success) {
        saveStatus.textContent = 'Failed to fetch tags';
        return;
    }
    
    const allNotes = response.data;
    const targetNote = allNotes.find(n => n.id === targetId);
    if (!targetNote) return;

    tagModalMode = 'note';
    tagModalTitle.textContent = 'Edit Note\'s Tags';
    tagModalDesc.textContent = `Update tags for "${targetNote.title}" (comma separated)`;
    tagEditorInput.value = targetNote.tags ? targetNote.tags.join(', ') : '';
    tagEditorOverlay.classList.remove('hidden');
    tagEditorInput.focus();
});

ctxRenameTag.addEventListener('click', async (e) => {
    e.stopPropagation();
    const targetTag = contextTargetTag;
    hideContextMenu(); 
    if (!targetTag || targetTag === 'Untagged') return;

    modalTargetTag = targetTag;
    tagModalMode = 'global';
    tagModalTitle.textContent = 'Rename Tag Globally';
    tagModalDesc.textContent = `Rename "${targetTag}" across all notes`;
    tagEditorInput.value = targetTag;
    tagEditorOverlay.classList.remove('hidden');
    tagEditorInput.focus();
});

// Tag Modal Handlers
tagModalSave.addEventListener('click', async () => {
    const inputVal = tagEditorInput.value.trim();
    
    if (tagModalMode === 'note') {
        const newTags = inputVal.split(',').map(t => t.trim()).filter(t => t !== "");
        if (window.crabNote && window.crabNote.updateNoteTags) {
            saveStatus.textContent = 'Updating tags...';
            const response = await window.crabNote.updateNoteTags(modalTargetId, newTags);
            if (response && response.success) {
                renderNotesList();
                saveStatus.textContent = 'Tags updated';
            } else {
                saveStatus.textContent = 'Update failed';
            }
        }
    } else if (tagModalMode === 'global') {
        const newName = inputVal;
        const oldName = modalTargetTag;
        if (newName && newName !== oldName) {
            if (window.crabNote && window.crabNote.renameTag) {
                saveStatus.textContent = 'Renaming tag...';
                const response = await window.crabNote.renameTag(oldName, newName);
                if (response && response.success) {
                    if (expandedTags.has(oldName)) {
                        expandedTags.delete(oldName);
                        expandedTags.add(newName);
                        localStorage.setItem('crabnote-expanded-tags', JSON.stringify(Array.from(expandedTags)));
                    }
                    renderNotesList();
                    saveStatus.textContent = 'Tag renamed';
                } else {
                    saveStatus.textContent = 'Rename failed';
                }
            }
        }
    }
    closeTagModal();
});

tagModalCancel.addEventListener('click', closeTagModal);
tagEditorOverlay.addEventListener('mousedown', (e) => {
    if (e.target === tagEditorOverlay) closeTagModal();
});

function closeTagModal() {
    tagEditorOverlay.classList.add('hidden');
}

tagEditorInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') tagModalSave.click();
    if (e.key === 'Escape') tagModalCancel.click();
});

function toggleTagSection(tag) {
    if (expandedTags.has(tag)) {
        expandedTags.delete(tag);
    } else {
        expandedTags.add(tag);
    }
    localStorage.setItem('crabnote-expanded-tags', JSON.stringify(Array.from(expandedTags)));
    renderNotesList();
}

async function deleteNoteById(id) {
    const note = notes.find(n => n.id === id);
    if (!note) return;

    if (!confirm(`Are you sure you want to delete "${note.title || 'Untitled'}"?`)) {
        return;
    }

    if (window.crabNote && window.crabNote.deleteNote) {
        const response = await window.crabNote.deleteNote(id);
        if (response && response.success) {
            notes = notes.filter(n => n.id !== id);
            
            if (currentNoteId === id) {
                if (notes.length > 0) {
                    await selectNote(notes[0].id);
                } else {
                    createNewNote();
                }
            }
            renderNotesList();
            closeTab(id); // Close the tab if deleted
            saveStatus.textContent = 'Note deleted';
        } else {
            saveStatus.textContent = 'Delete failed';
        }
    }
}

// Select a note
// Select a note
async function selectNote(id) {
    // 0. Stash current note's unsaved changes into memory before switching
    if (currentNoteId !== null) {
        const currentNote = notes.find(n => n.id === currentNoteId);
        if (currentNote) {
            currentNote.title = noteTitleInput.value;
            currentNote.content = noteBodyInput.value;
        }
    }

    // 1. Unwatch current files immediately
    for (const path of currentWatchedFiles) {
        if (window.crabNote.unwatchFile) window.crabNote.unwatchFile(path);
    }
    currentWatchedFiles.clear();

    // Add to open tabs if not already there
    if (!openNoteIds.includes(id)) {
        if (currentNoteId !== null && !dirtyNoteIds.has(currentNoteId) && openNoteIds.includes(currentNoteId)) {
            // Replace the current "clean" tab with the new one
            const index = openNoteIds.indexOf(currentNoteId);
            if (index !== -1) {
                openNoteIds[index] = id;
            } else {
                openNoteIds.push(id);
            }
        } else {
            openNoteIds.push(id);
        }
    }

    currentNoteId = id;

    const note = notes.find(n => n.id === id);

    if (note) {
        noteTitleInput.value = note.title;
        noteBodyInput.value = note.content;
        
        // If preview is active, re-render it
        if (!notePreview.classList.contains('hidden')) {
            await renderPreview();
        }
    }

    renderNotesList(); // Update active state
    renderTabs(); // Update tab bar
}

// Render the tab bar
function renderTabs() {
    if (!tabBar) return;
    tabBar.innerHTML = '';

    openNoteIds.forEach(id => {
        const note = notes.find(n => n.id === id);
        if (!note && id !== 0) return; // Note might have been deleted

        const tab = document.createElement('div');
        tab.className = `tab ${id === currentNoteId ? 'active' : ''}`;
        
        const titleSpan = document.createElement('span');
        titleSpan.className = 'tab-title';
        titleSpan.textContent = (id === 0 ? 'Untitled' : (note ? note.title : 'Untitled')) || 'Untitled';
        
        const closeBtn = document.createElement('div');
        closeBtn.className = 'tab-close';
        closeBtn.innerHTML = '<i data-lucide="x"></i>';
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeTab(id);
        });

        tab.addEventListener('click', () => {
            selectNote(id);
        });

        tab.appendChild(titleSpan);
        tab.appendChild(closeBtn);
        tabBar.appendChild(tab);
    });

    if (window.lucide) lucide.createIcons();
}

// Close a tab
async function closeTab(id, force = false) {
    if (!force && dirtyNoteIds.has(id)) {
        const note = notes.find(n => n.id === id);
        tabIdToClose = id;
        unsavedDesc.textContent = `"${(id === 0 ? 'Untitled' : (note ? note.title : 'Untitled')) || 'Untitled'}" has unsaved changes. Do you want to save them before closing?`;
        unsavedOverlay.classList.remove('hidden');
        return;
    }

    const index = openNoteIds.indexOf(id);
    if (index === -1) return;

    openNoteIds.splice(index, 1);
    dirtyNoteIds.delete(id); // Clean up dirty state if closing anyway

    if (currentNoteId === id) {
        if (openNoteIds.length > 0) {
            // Switch to the next available tab or the previous one
            const nextId = openNoteIds[index] || openNoteIds[index - 1];
            await selectNote(nextId);
        } else {
            // No more tabs, show empty state or create new note
            currentNoteId = null;
            noteTitleInput.value = '';
            noteBodyInput.value = '';
            renderNotesList();
            renderTabs();
        }
    } else {
        renderTabs();
    }
}

// Unsaved Modal Handlers
unsavedCancel.addEventListener('click', () => {
    unsavedOverlay.classList.add('hidden');
    tabIdToClose = null;
});

unsavedDiscard.addEventListener('click', () => {
    unsavedOverlay.classList.add('hidden');
    if (tabIdToClose !== null) {
        closeTab(tabIdToClose, true);
        tabIdToClose = null;
    }
});

unsavedSave.addEventListener('click', async () => {
    unsavedOverlay.classList.add('hidden');
    if (tabIdToClose !== null) {
        // If it's the current note, we can just save it.
        // If it's a background tab, we'd need to switch to it or handle partial save.
        // For now, let's assume we save the target note.
        const id = tabIdToClose;
        if (id === currentNoteId) {
            await performSave();
        } else {
            // Partial support: switch to it then save
            await selectNote(id);
            await performSave();
        }
        closeTab(id, true);
        tabIdToClose = null;
    }
});

// Create new note
function createNewNote() {
    const newNote = {
        id: 0, // Using 0 so backend knows to Auto-Increment
        title: '',
        content: '',
        tags: []
    };
    notes.unshift(newNote); // Add to top of list
    
    // For new note, we add it to tabs if not already opening one
    if (!openNoteIds.includes(0)) {
        openNoteIds.push(0);
    }
    
    selectNote(newNote.id);
    noteTitleInput.focus();
}

newNoteBtn.addEventListener('click', createNewNote);

// Save logic
async function performSave() {
    if (currentNoteId === null) return;

    saveStatus.textContent = 'Saving...';
    
    const noteIndex = notes.findIndex(n => n.id === currentNoteId);
    if (noteIndex > -1) {
        // Optimistic UI update
        notes[noteIndex].title = noteTitleInput.value;
        notes[noteIndex].content = noteBodyInput.value;
        renderNotesList();
        
        // API call to main process via context bridge
        if (window.crabNote && window.crabNote.saveNote) {
            const response = await window.crabNote.saveNote(notes[noteIndex]);
            if (response && response.success) {
                const savedNote = response.data;
                if (notes[noteIndex].id === 0) {
                    const tabIndex = openNoteIds.indexOf(0);
                    if (tabIndex !== -1) openNoteIds[tabIndex] = savedNote.id;
                    
                    // Update dirtyNoteIds mapping if it was 0
                    if (dirtyNoteIds.has(0)) {
                        dirtyNoteIds.delete(0);
                        dirtyNoteIds.add(savedNote.id);
                    }

                    notes[noteIndex].id = savedNote.id;
                    currentNoteId = savedNote.id;
                    dirtyNoteIds.delete(savedNote.id);
                    renderNotesList();
                    renderTabs();
                }
                dirtyNoteIds.delete(notes[noteIndex].id);
                saveStatus.textContent = 'Saved';
            } else {
                saveStatus.textContent = 'Save Failed. Retrying...';
                console.error('Failed to save:', response.error);
            }
        }
    }
}

// Global debounced save function that can be updated based on settings
let debouncedSave = debounce(performSave, appSettings.saveInterval);

function saveCurrentNote(isManual = false) {
    if (isManual) {
        performSave();
    } else if (appSettings.autoSave) {
        debouncedSave();
    }
}

// Manual Save (Ctrl+S)
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveCurrentNote(true);
    }
});

// Settings Modal Logic
function openSettings() {
    autoSaveToggle.checked = appSettings.autoSave;
    saveIntervalSelect.value = appSettings.saveInterval >= 60000 ? appSettings.saveInterval : 60000;
    saveIntervalRow.style.display = appSettings.autoSave ? 'flex' : 'none';
    settingsOverlay.classList.remove('hidden');
}

function closeSettings() {
    settingsOverlay.classList.add('hidden');
}

settingsBtn.addEventListener('click', openSettings);
settingsModalClose.addEventListener('click', closeSettings);
settingsOverlay.addEventListener('mousedown', (e) => {
    if (e.target === settingsOverlay) closeSettings();
});

autoSaveToggle.addEventListener('change', () => {
    appSettings.autoSave = autoSaveToggle.checked;
    saveIntervalRow.style.display = appSettings.autoSave ? 'flex' : 'none';
    saveSettings();
});

saveIntervalSelect.addEventListener('change', () => {
    appSettings.saveInterval = parseInt(saveIntervalSelect.value);
    saveSettings();
});

function saveSettings() {
    localStorage.setItem('crabnote-settings', JSON.stringify(appSettings));
    // Update debounced function with new interval
    debouncedSave = debounce(performSave, appSettings.saveInterval);
}

// Input listeners
noteTitleInput.addEventListener('input', () => {
    if (currentNoteId !== null) dirtyNoteIds.add(currentNoteId);
    saveStatus.textContent = 'Unsaved changes';
    
    // Update tab title live
    renderTabs();
    
    saveCurrentNote();
});

noteBodyInput.addEventListener('input', () => {
    if (currentNoteId !== null) dirtyNoteIds.add(currentNoteId);
    saveStatus.textContent = 'Unsaved changes';
    saveCurrentNote();
});

// Initialize app
async function init() {
    // Attempt to load from Electron process
    if (window.crabNote && window.crabNote.getNotes) {
        try {
            const response = await window.crabNote.getNotes();
            if (response && response.success) {
                notes = response.data;
            } else {
                console.error('Failed to fetch notes:', response.error);
                saveStatus.textContent = 'Offline';
            }
        } catch (error) {
            console.error('Failed to load notes', error);
        }
    }

    // Select first note or create a new one
    if (notes.length > 0) {
        await selectNote(notes[0].id);
    } else {
        createNewNote();
    }

    if (window.lucide) lucide.createIcons();
}

    // Start
    init();

    // Load Theme
    const savedTheme = localStorage.getItem('crabnote-theme') || 'dark';
    setTheme(savedTheme);
