import path from 'node:path';
import { app, BrowserWindow, Menu, Tray } from 'electron';
import { registerIpc, stopActiveOperation, setTrayUpdateFunction } from './ipc';
import { getWindowIconPath, getLogoPath } from './services/runtime-paths';
import { debugLog, isDebugEnabled, debugTimer, debugTimerEnd } from './services/debug';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let currentStatus = 'Idle';

function createMainWindow(): BrowserWindow {
  const totalTimerId = 'main-window-total';
  const ctorTimerId = 'main-window-constructor';
  const loadTimerId = 'main-window-load';
  debugTimer(totalTimerId);
  debugLog('main', '[WINDOW] Creating main window...');
  
  debugTimer(ctorTimerId);
  const window = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 720,
    minHeight: 480,
    title: 'SD.Next Launcher',
    icon: getWindowIconPath(),
    backgroundColor: '#171717',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    autoHideMenuBar: true,
  });
  debugTimerEnd(ctorTimerId);

  window.setMenuBarVisibility(false);

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  
  window.webContents.on('did-start-loading', () => {
    debugLog('main', '[WINDOW] Renderer started loading');
  });

  window.webContents.on('did-finish-load', () => {
    debugLog('main', '[WINDOW] Renderer finished loading');
    debugTimerEnd(loadTimerId);
    debugTimerEnd(totalTimerId);
  });

  debugTimer(loadTimerId);
  if (devServerUrl) {
    debugLog('main', '[WINDOW] Loading renderer from Vite dev server', { devServerUrl });
    void window.loadURL(devServerUrl);
  } else {
    debugLog('main', '[WINDOW] Loading renderer from dist/index.html');
    const htmlPath = path.join(process.cwd(), 'dist', 'index.html');
    debugLog('main', '[WINDOW] HTML path', { htmlPath });
    void window.loadFile(htmlPath);
  }

  if (isDebugEnabled()) {
    debugLog('main', '[WINDOW] Debug mode enabled, opening DevTools');
    window.webContents.openDevTools({ mode: 'detach' });
  }

  return window;
}

function createTray(): void {
  try {
    // Try to use window icon (logo.png) for tray if logo path fails
    let iconPath = getLogoPath();
    
    // In dev mode, use window icon as fallback since sdnext.png might not work for tray
    if (!app.isPackaged) {
      iconPath = getWindowIconPath();
    }
    
    tray = new Tray(iconPath);
    debugLog('main', 'Tray icon created', { iconPath });

    const contextMenu = Menu.buildFromTemplate([
    {
      label: `Status: ${currentStatus}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Show',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: 'Hide',
      click: () => {
        if (mainWindow) {
          mainWindow.hide();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip('SD.Next');

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  } catch (error) {
    debugLog('main', 'Tray creation failed', error);
    console.error('[Tray] Failed to create tray icon:', error);
    // Continue without tray - not critical for app functionality
  }
}

function updateTrayMenu(status: string): void {
  currentStatus = status;
  if (tray) {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: `Status: ${status}`,
        enabled: false,
      },
      { type: 'separator' },
      {
        label: 'Show',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      {
        label: 'Hide',
        click: () => {
          if (mainWindow) {
            mainWindow.hide();
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Exit',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);
    tray.setContextMenu(contextMenu);
  }
}

app.whenReady().then(() => {
  const appStartTimerId = 'app-startup-total';
  debugTimer(appStartTimerId);
  debugLog('main', '[APP] Electron app ready', { argv: process.argv, isDev: !app.isPackaged });
  
  debugLog('main', '[APP] Creating main window...');
  // Register IPC handlers FIRST, before creating window
  mainWindow = createMainWindow();
  
  debugLog('main', '[APP] Setting up tray updates...');
  setTrayUpdateFunction(updateTrayMenu);
  
  debugLog('main', '[APP] Registering IPC handlers...');
  registerIpc(mainWindow);
  
  // Create tray after IPC is set up
  debugLog('main', '[APP] Creating tray icon...');
  createTray();
  
  debugLog('main', '[APP] Setting up window activation handlers...');
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
      setTrayUpdateFunction(updateTrayMenu);
      registerIpc(mainWindow);
      createTray();
    }
  });
  
  debugTimerEnd(appStartTimerId);
});

app.on('before-quit', (event) => {
  debugLog('main', 'before-quit event received', { isQuitting });
  if (isQuitting) {
    return;
  }
  event.preventDefault();
  isQuitting = true;
  void stopActiveOperation().finally(() => {
    app.exit(0);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
