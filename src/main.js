const { app, BrowserWindow, ipcMain, globalShortcut, dialog, Menu } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');
const http = require('node:http');

let mainWindow;
let goProcess;
let PORT = 0; // Will be assigned dynamically

// Helper to find an available port
const getFreePort = () => {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.listen(0, () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#121212',
    icon: path.join(__dirname, '..', 'assets', 'favicon.ico'),
    show: false, // Start hidden
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  const menu = Menu.buildFromTemplate([
    {
      label: 'Crab Note',
      submenu: [
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ]);
  Menu.setApplicationMenu(menu);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

const startGoBackend = async () => {
  PORT = await getFreePort();
  const dbPath = path.join(app.getPath('userData'), 'notes.db');
  console.log(`[Electron] Data Path: ${dbPath}`);
  console.log(`[Electron] Starting Go Backend on port ${PORT}`);

  let goProcessCommand;
  let goProcessArgs;

  if (app.isPackaged) {
    const platform = process.platform;
    const arch = process.arch;
    const binaryName = platform === 'win32' ? 'crabnote-backend.exe' : 'crabnote-backend';
    const binaryPath = path.join(process.resourcesPath, 'bin', `${platform}-${arch}`, binaryName);
    
    goProcessCommand = binaryPath;
    goProcessArgs = ['-port', PORT.toString(), '-dbpath', dbPath];
  } else {
    goProcessCommand = 'go';
    goProcessArgs = ['run', 'main.go', '-port', PORT.toString(), '-dbpath', 'notes.db'];
  }

  const spawnOptions = { 
    detached: false,
    windowsHide: app.isPackaged, // Hide ONLY in production
    shell: !app.isPackaged      // Use shell in dev for easier command resolution
  };

  if (!app.isPackaged) {
    spawnOptions.cwd = path.join(__dirname, '..', 'backend');
  }

  console.log(`[Electron] Spawning: ${goProcessCommand} ${goProcessArgs.join(' ')}`);
  console.log(`[Electron] CWD: ${spawnOptions.cwd || process.cwd()}`);

  goProcess = spawn(goProcessCommand, goProcessArgs, spawnOptions);
  
  goProcess.on('error', (err) => {
    console.error(`[Electron] Failed to start Go process: ${err.message}`);
  });

  goProcess.stdout.on('data', (data) => {
    const output = data.toString();
    console.log(`[Go Output]: ${output}`);

    // Parse EVENT: prefix for real-time file updates
    const lines = output.split('\n');
    lines.forEach(line => {
      if (line.trim().startsWith('EVENT:')) {
        try {
          const eventData = JSON.parse(line.trim().substring(6));
          if (mainWindow) {
            mainWindow.webContents.send('file-update', eventData);
          }
        } catch (e) {
          console.error('[Electron] Failed to parse Go event:', e);
        }
      }
    });
  });
  goProcess.stderr.on('data', (data) => console.error(`[Go Error]: ${data}`));
  goProcess.on('close', (code) => {
    console.log(`[Go] Process exited with code ${code}`);
    goProcess = null;
  });

  // Wait for backend to be ready (Polling with Timeout)
  const maxAttempts = 40;
  const delay = 300;
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 500); // Increased timeout
      
      const resp = await fetch(`http://localhost:${PORT}/notes`, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (resp.ok) {
        console.log(`[Electron] Backend is ready after ${i + 1} attempts.`);
        return true;
      }
    } catch (e) {
      // Not ready yet or timeout
    }
    await new Promise(r => setTimeout(r, delay));
  }

  throw new Error(`Backend stalled or died. Last Command: ${goProcessCommand}`);
};

app.whenReady().then(async () => {
  try {
    await startGoBackend();
    createWindow();
  } catch (err) {
    dialog.showErrorBox('Backend Error', `Failed to start the Go backend.\n\nError: ${err.message}\n\nPlease ensure the app has permission to run binaries and write to the AppData folder.`);
    app.quit();
    return;
  }

  // Register Quick Switcher Shortcut
  globalShortcut.register('CommandOrControl+K', () => {
    if (mainWindow) {
      mainWindow.webContents.send('toggle-quick-switcher');
    }
  });

  // Register Today shortcut
  globalShortcut.register('CommandOrControl+T', () => {
    if (mainWindow) {
      mainWindow.webContents.send('go-to-today');
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Robust cleanup to strictly prevent zombie processes
const killGoProcess = () => {
  if (goProcess) {
    console.log('[Electron] Terminating Go Backend...');
    try {
      // Windows-specific kill if standard kill fails, but try standard first
      goProcess.kill();
    } catch (e) {
      console.error('Failed to kill Go process:', e);
    }
    goProcess = null;
  }
};

app.on('will-quit', killGoProcess);
process.on('exit', killGoProcess);

// Catch unexpected crashes
process.on('uncaughtException', (err) => {
  console.error('[Electron] Uncaught Exception:', err);
  killGoProcess();
  process.exit(1);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Helper for backend requests
async function fetchData(endpoint, method = 'GET', body = null) {
  if (!PORT) return { success: false, error: 'Backend not ready' };
  try {
    const options = { method };
    if (body) {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(body);
    }
    const response = await fetch(`http://localhost:${PORT}${endpoint}`, options);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json().catch(() => null) || await response.text();
    return { success: true, data };
  } catch (error) {
    console.error(`[Electron] Error fetching ${endpoint}:`, error.message);
    return { success: false, error: error.message };
  }
}

// IPC handlers to talk to Go Backend
ipcMain.handle('notes:getAll', () => fetchData('/notes'));
ipcMain.handle('notes:save', (event, note) => fetchData('/notes', 'POST', note));
ipcMain.handle('notes:get', async (event, query) => {
    return await fetchData('/notes' + (query ? '?q=' + encodeURIComponent(query) : ''));
});

ipcMain.handle('notes:getGrouped', async (event) => {
    return await fetchData('/notes/grouped');
});
ipcMain.handle('notes:renameTag', (event, oldName, newName) => fetchData('/notes/rename-tag', 'POST', { oldName, newName }));
ipcMain.handle('notes:updateTags', (event, id, tags) => fetchData('/notes/update-tags', 'POST', { id, tags }));
ipcMain.handle('notes:search', (event, query) => fetchData(`/notes?q=${encodeURIComponent(query)}`));
ipcMain.handle('notes:delete', (event, id) => fetchData(`/notes?id=${id}`, 'DELETE'));

// New File Bridge IPC
ipcMain.handle('file:read', (event, filePath) => fetchData(`/file?path=${encodeURIComponent(filePath)}`));
ipcMain.handle('file:watch', (event, filePath) => fetchData('/watch', 'POST', { path: filePath }));
ipcMain.handle('file:unwatch', (event, filePath) => fetchData('/unwatch', 'POST', { path: filePath }));
