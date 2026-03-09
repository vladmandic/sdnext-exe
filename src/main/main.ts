import path from 'node:path';
import { app, BrowserWindow, screen } from 'electron';
import { registerIpc, stopActiveOperation } from './ipc';
import { getWindowIconPath } from './services/runtime-paths';
import { debugLog, isDebugEnabled, debugTimer, debugTimerEnd } from './services/debug';
import { loadConfig, saveConfig } from './services/config-service';

// Global error handlers for production robustness
process.on('uncaughtException', (error) => {
  debugLog('main', '[FATAL] Uncaught exception', error);
  console.error('Uncaught exception:', error);
  // Don't exit immediately - allow cleanup handlers to run
});

process.on('unhandledRejection', (reason, promise) => {
  debugLog('main', '[ERROR] Unhandled promise rejection', { reason, promise });
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

interface PersistedWindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
}

const DEFAULT_WINDOW_WIDTH = 980;
const DEFAULT_WINDOW_HEIGHT = 720;
const MIN_WINDOW_WIDTH = 720;
const MIN_WINDOW_HEIGHT = 480;

function rectsIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function isWindowStateVisibleOnAnyDisplay(state: PersistedWindowState): boolean {
  if (state.x === undefined || state.y === undefined) {
    return true;
  }

  const candidate = {
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
  };

  return screen.getAllDisplays().some((display) => rectsIntersect(candidate, display.workArea));
}

function loadWindowState(): PersistedWindowState {
  const defaults: PersistedWindowState = {
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
  };

  try {
    const raw = loadConfig().windowState;
    if (!raw) {
      return defaults;
    }

    const width = typeof raw.width === 'number' ? Math.max(Math.round(raw.width), MIN_WINDOW_WIDTH) : DEFAULT_WINDOW_WIDTH;
    const height = typeof raw.height === 'number' ? Math.max(Math.round(raw.height), MIN_WINDOW_HEIGHT) : DEFAULT_WINDOW_HEIGHT;
    const loaded: PersistedWindowState = {
      width,
      height,
      x: typeof raw.x === 'number' ? Math.round(raw.x) : undefined,
      y: typeof raw.y === 'number' ? Math.round(raw.y) : undefined,
    };

    if (!isWindowStateVisibleOnAnyDisplay(loaded)) {
      return { width, height };
    }

    return loaded;
  } catch (error) {
    debugLog('main', '[WINDOW] Failed to load persisted window state', error);
    return defaults;
  }
}

function saveWindowState(window: BrowserWindow): void {
  try {
    const bounds = window.isMaximized() ? window.getNormalBounds() : window.getBounds();
    const state = {
      width: Math.max(bounds.width, MIN_WINDOW_WIDTH),
      height: Math.max(bounds.height, MIN_WINDOW_HEIGHT),
      x: bounds.x,
      y: bounds.y,
    };
    const config = loadConfig();
    saveConfig({
      ...config,
      windowState: state,
    });
  } catch (error) {
    debugLog('main', '[WINDOW] Failed to save persisted window state', error);
  }
}

function createMainWindow(): BrowserWindow {
  const totalTimerId = 'main-window-total';
  const ctorTimerId = 'main-window-constructor';
  const loadTimerId = 'main-window-load';
  debugTimer(totalTimerId);
  debugLog('main', '[WINDOW] Creating main window...');

  const windowState = loadWindowState();
  debugLog('main', '[WINDOW] Loaded persisted state', windowState);
  
  debugTimer(ctorTimerId);
  const window = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    title: 'SD.Next Launcher',
    icon: getWindowIconPath(),
    backgroundColor: '#333333',
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
    // when packaged or running in prod mode, app.getAppPath() is the safest base path
    // it points inside the ASAR when packaged, or to the project root during development.
    const htmlPath = path.join(app.getAppPath(), 'dist', 'index.html');
    debugLog('main', '[WINDOW] HTML path', { htmlPath });
    void window.loadFile(htmlPath);
  }

  if (isDebugEnabled()) {
    debugLog('main', '[WINDOW] Debug mode enabled, opening DevTools');
    window.webContents.openDevTools({ mode: 'detach' });
  }

  let saveStateTimeout: NodeJS.Timeout | null = null;
  const scheduleWindowStateSave = (): void => {
    if (saveStateTimeout) {
      clearTimeout(saveStateTimeout);
    }
    saveStateTimeout = setTimeout(() => {
      saveWindowState(window);
      saveStateTimeout = null;
    }, 200);
  };

  window.on('move', scheduleWindowStateSave);
  window.on('resize', scheduleWindowStateSave);
  window.on('close', () => {
    if (saveStateTimeout) {
      clearTimeout(saveStateTimeout);
      saveStateTimeout = null;
    }
    saveWindowState(window);
  });

  return window;
}



app.whenReady().then(() => {
  const appStartTimerId = 'app-startup-total';
  debugTimer(appStartTimerId);
  debugLog('main', '[APP] Electron app ready', { argv: process.argv, isDev: !app.isPackaged });
  
  debugLog('main', '[APP] Creating main window...');
  // Create main window first (IPC handlers registered after)
  mainWindow = createMainWindow();
  
  debugLog('main', '[APP] Registering IPC handlers...');
  registerIpc(mainWindow);
  
  
  debugLog('main', '[APP] Setting up window activation handlers...');
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
      registerIpc(mainWindow);
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
