import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { shell } from 'electron';
import type { InstallOptions, SdNextConfig, TerminalDimensions, UiStatus, StartupState, ExtractionProgressEvent } from '../shared/types';
import { loadConfig, saveConfig } from './services/config-service';
import { getLogoPath, isBootstrapAvailable, getGitExecutablePath } from './services/runtime-paths';
import { readInstalledVersion } from './services/version-service';
import { ProcessRunner } from './services/process-runner';
import { runInstallWorkflow } from './services/install-workflow';
import { runLaunchWorkflow } from './services/launch-workflow';
import {
  isBootstrapComplete,
  getBootstrapError,
  startBootstrapAsync,
  setBootstrapOutputCallback,
  setBootstrapStatusCallback,
  setBootstrapProgressCallback,
  resetBootstrapState,
  cleanupPortableRuntimes,
} from './services/portable-bootstrap';
import { getToolVersions } from './services/tool-version-service';
import { debugLog, debugTimer, debugTimerEnd } from './services/debug';
import { detectGPUs, type GPUDetectionResult } from './services/gpu-detection';
import { STATUS, formatError, formatInstallError, formatBootstrapRequired } from '../shared/status-constants';
import { getErrorMessage } from '../shared/type-guards';

const runner = new ProcessRunner();
let status: UiStatus = STATUS.IDLE as UiStatus;
let handlersRegistered = false;
let activeWindow: BrowserWindow | null = null;
let stopRequested = false;
let cachedGPUDetection: GPUDetectionResult | null = null;
let cachedVersionUpdate: { installed: boolean; version: string } | null = null;
let cachedToolsUpdate: {
  python: string;
  git: string;
  pythonOk: boolean;
  gitOk: boolean;
} | null = null;
let backgroundChecksInFlight = false;
let lastBackgroundChecksAt = 0;
const BACKGROUND_CHECK_DEDUPE_MS = 2000;

// Operation lock to prevent parallel install/start/bootstrap operations
let operationInProgress: 'bootstrap' | 'install' | 'launch' | null = null;

/**
 * Retrieves cached GPU detection results or performs detection if not cached
 * @returns GPU detection results including detected GPUs and recommended backend
 */
function getGPUDetection(): GPUDetectionResult {
  if (!cachedGPUDetection) {
    cachedGPUDetection = detectGPUs();
  }
  return cachedGPUDetection;
}

/**
 * Updates the application status and notifies renderer and tray
 * @param nextStatus - The new status to set
 */
function setStatus(nextStatus: UiStatus): void {
  debugLog('ipc', 'Status update', { from: status, to: nextStatus });
  status = nextStatus;
  activeWindow?.webContents.send('launcher:status', status);
}

/**
 * Emits terminal output to the renderer process
 * @param text - The output text to emit
 * @param isError - Whether this is an error message
 */
function emitTerminal(text: string, isError?: boolean): void {
  activeWindow?.webContents.send('launcher:terminal', { text, isError });
}

/**
 * Emits file extraction progress updates to the renderer process
 * @param progress - The extraction progress event details
 */
function emitExtractionProgress(progress: ExtractionProgressEvent): void {
  activeWindow?.webContents.send('launcher:extraction-progress', progress);
}

/**
 * Constructs the full path to log files based on operation type
 * @param kind - The type of log file (install or start)
 * @param config - The sdnext configuration containing installation path
 * @returns The full path to the log file
 */
function getLogPath(kind: 'install' | 'launch', config: SdNextConfig): string {
  const appPath = path.join(config.installationPath, 'app');
  return path.join(appPath, kind === 'install' ? 'install.log' : 'sdnext.log');
}


/**
 * Registers all IPC handlers for main-renderer communication
 * @param window - The browser window instance to attach handlers to
 */
export function registerIpc(window: BrowserWindow): void {
  activeWindow = window;
  debugLog('ipc', 'Registering IPC handlers');

  if (handlersRegistered) {
    return;
  }
  handlersRegistered = true;

  /**
   * Handler: launcher:start-bootstrap
   * Starts the bootstrap process to extract and install required runtime dependencies
   * @returns Promise resolving to success status and optional error message
   */
  ipcMain.handle('launcher:start-bootstrap', async (_event, payload: { installationPath?: string } = {}) => {
    const timerId = `bootstrap-${Date.now()}`;
    debugTimer(timerId);
    debugLog('ipc', '[BOOTSTRAP] launcher:start-bootstrap invoked', { installationPath: payload.installationPath });
    
    // Prevent parallel operations
    if (operationInProgress) {
      debugLog('ipc', '[BOOTSTRAP] Operation already in progress', { operation: operationInProgress });
      return { success: false, message: `Cannot bootstrap while ${operationInProgress} is in progress` };
    }
    
    operationInProgress = 'bootstrap';
    
    // Reset bootstrap state to force full extraction
    debugLog('ipc', '[BOOTSTRAP] Resetting bootstrap state');
    resetBootstrapState();
    
    // Set status to Bootstrapping
    setStatus(STATUS.BOOTSTRAPPING as UiStatus);
    
    // Set output callback for terminal display
    setBootstrapOutputCallback(emitTerminal);
    setBootstrapStatusCallback(setStatus);
    setBootstrapProgressCallback(emitExtractionProgress);
    
    // Clean up existing non-functional installations
    debugLog('ipc', '[BOOTSTRAP] Cleaning up existing portable runtimes');
    cleanupPortableRuntimes(payload.installationPath, (text) => emitTerminal(text, false));
    
    try {
      debugLog('ipc', '[BOOTSTRAP] Starting bootstrap extraction...');
      await startBootstrapAsync(payload.installationPath);
      debugLog('ipc', '[BOOTSTRAP] Bootstrap extraction completed');
      // Keep completion visible briefly before returning to idle.
      setStatus(STATUS.BOOTSTRAP_COMPLETE as UiStatus);
      await new Promise((resolve) => setTimeout(resolve, 500));
      debugTimerEnd(timerId);
      setStatus(STATUS.IDLE as UiStatus);
      
      // Trigger background checks to update tools and version immediately after bootstrap
      // Small delay to allow filesystem to settle after extraction
      debugLog('ipc', '[BOOTSTRAP] Scheduling post-bootstrap checks');
      setTimeout(() => {
        debugLog('ipc', '[BOOTSTRAP] Running post-bootstrap checks (forced)');
        // Force background checks to run, bypassing de-duplication
        performBackgroundChecks(true);
      }, 100);
      
      return { success: true };
    } catch (error) {
      debugLog('ipc', '[BOOTSTRAP] Bootstrap failed', error);
      debugTimerEnd(timerId);
      const message = getErrorMessage(error);
      emitTerminal(`Bootstrap error: ${message}\n`, true);
      setStatus(formatError(message) as UiStatus);
      return { success: false, message };
    } finally {
      operationInProgress = null;
    }
  });

  /**
   * Handler: launcher:get-startup-state
   * Retrieves the initial application state including installation status, tools, and GPU info
   * Performs expensive checks asynchronously to avoid blocking startup
   * @returns Promise resolving to StartupState with current application status
   */
  ipcMain.handle('launcher:get-startup-state', async () => {
    const timerId = `startup-state-${Date.now()}`;
    debugTimer(timerId);
    debugLog('ipc', '[STARTUP] launcher:get-startup-state invoked');
    try {
      // Return immediately with minimal state - don't wait for GPU detection or tool checks
      debugLog('ipc', '[STARTUP] Building initial state...');
      const initialState: StartupState = {
        logoPath: getLogoPath(),
        installed: cachedVersionUpdate?.installed ?? false,
        version: cachedVersionUpdate?.version ?? 'N/A',
        status: status,
        tools: {
          python: cachedToolsUpdate?.python ?? 'Checking...',
          git: cachedToolsUpdate?.git ?? 'Checking...',
        },
        gpus: cachedGPUDetection?.gpus ?? [],
        recommendedBackend: cachedGPUDetection?.recommendedBackend ?? 'autodetect',
        bootstrapAvailable: isBootstrapAvailable(),
      };

      // Check if bootstrap is still in progress
      debugLog('ipc', '[STARTUP] Checking bootstrap state...');
      const cfg = loadConfig();
      if (!isBootstrapComplete(cfg.installationPath)) {
        const error = getBootstrapError();
        if (error) {
          // Bootstrap failed
          debugLog('ipc', '[STARTUP] Bootstrap error detected', { error: error.message });
          const nextStatus: UiStatus = `Error: ${error.message}`;
          setStatus(nextStatus);
          initialState.status = nextStatus;
          initialState.version = 'N/A';
        } else {
          // Bootstrap not complete yet
          debugLog('ipc', '[STARTUP] Bootstrap in progress or not started');
          initialState.installed = false;
          initialState.version = 'N/A';
        }
        
        // Still do background checks for GPU and tools
        setImmediate(() => {
          performBackgroundChecks();
        });
        
        debugLog('ipc', '[STARTUP] Returning initial state (bootstrap pending)');
        debugTimerEnd(timerId);
        return initialState;
      }

      debugLog('ipc', '[STARTUP] Bootstrap complete, returning initial state');
      // Return immediately - all checks including version will be done asynchronously
      if (!cachedVersionUpdate) {
        initialState.version = 'Checking...';
      }

      // Do all expensive checks in background (non-blocking)
      setImmediate(() => {
        performBackgroundChecks();
      });

      debugTimerEnd(timerId);
      return initialState;
    } catch (error) {
      debugLog('ipc', 'Failed to build startup state', error);
      const message = getErrorMessage(error);
      const nextStatus: UiStatus = formatError(message) as UiStatus;
      setStatus(nextStatus);
      return {
        logoPath: getLogoPath(),
        installed: false,
        version: 'N/A',
        status: nextStatus,
        tools: {
          python: 'N/A',
          git: 'N/A',
        },
        gpus: [],
        recommendedBackend: 'cpu',
        bootstrapAvailable: isBootstrapAvailable(),
      };
    }
  });

  // Helper function to perform time-consuming checks asynchronously
  function performBackgroundChecks(force = false): void {
    const now = Date.now();
    if (!force && (backgroundChecksInFlight || now - lastBackgroundChecksAt < BACKGROUND_CHECK_DEDUPE_MS)) {
      debugLog('ipc', '[BACKGROUND] Skipping duplicate background checks', {
        inFlight: backgroundChecksInFlight,
        elapsedMs: now - lastBackgroundChecksAt,
      });
      if (cachedGPUDetection) {
        activeWindow?.webContents.send('launcher:gpu-update', {
          gpus: cachedGPUDetection.gpus,
          recommendedBackend: cachedGPUDetection.recommendedBackend,
        });
      }
      if (cachedToolsUpdate) {
        activeWindow?.webContents.send('launcher:tools-update', cachedToolsUpdate);
      }
      if (cachedVersionUpdate) {
        activeWindow?.webContents.send('launcher:version-update', cachedVersionUpdate);
      }
      return;
    }

    backgroundChecksInFlight = true;
    lastBackgroundChecksAt = now;
    debugLog('ipc', '[BACKGROUND] Starting background checks');

    setImmediate(() => {
      // GPU detection
      const gpuTimerId = 'background:gpu-detection';
      debugTimer(gpuTimerId);
      try {
        debugLog('ipc', '[BACKGROUND:GPU] Starting GPU detection');
        const gpuDetection = getGPUDetection();
        debugLog('ipc', '[BACKGROUND:GPU] GPU detection complete', { gpuCount: gpuDetection.gpus.length, recommendedBackend: gpuDetection.recommendedBackend });
        debugTimerEnd(gpuTimerId);
        activeWindow?.webContents.send('launcher:gpu-update', {
          gpus: gpuDetection.gpus,
          recommendedBackend: gpuDetection.recommendedBackend,
        });
      } catch (error) {
        debugLog('ipc', '[BACKGROUND:GPU] GPU detection failed', error);
        debugTimerEnd(gpuTimerId);
      }

      // Tool checks (version check depends on this)
      const timerId = 'background:tool-versions';
      debugTimer(timerId);
      try {
        debugLog('ipc', '[BACKGROUND:TOOLS] Loading config for tool check');
        const config = loadConfig();
        debugLog('ipc', '[BACKGROUND:TOOLS] Starting tool version checks', { installationPath: config.installationPath });
        const tools = getToolVersions(config.installationPath, (errorMsg) => {
          emitTerminal(errorMsg, true);
        });
        debugLog('ipc', '[BACKGROUND:TOOLS] Tool version checks complete', { git: tools.git, python: tools.python, gitOk: tools.gitOk, pythonOk: tools.pythonOk });
        debugTimerEnd(timerId);
        cachedToolsUpdate = {
          python: tools.python,
          git: tools.git,
          pythonOk: tools.pythonOk,
          gitOk: tools.gitOk,
        };
        
        // Check if tools are missing and bootstrap is required.
        // Do not reset bootstrap state while bootstrap is actively running,
        // otherwise this background path can abort the in-flight extraction.
        if (!tools.gitOk || !tools.pythonOk) {
          debugLog('ipc', '[BACKGROUND:TOOLS] Bootstrap required due to missing tools', {
            gitOk: tools.gitOk,
            pythonOk: tools.pythonOk,
            operationInProgress,
          });
          if (operationInProgress !== 'bootstrap') {
            resetBootstrapState();
            const failedTools = [];
            if (!tools.gitOk) failedTools.push('Git');
            if (!tools.pythonOk) failedTools.push('Python');
            const requiredStatus: UiStatus = formatBootstrapRequired(failedTools) as UiStatus;
            setStatus(requiredStatus);
          }
        }
        
        activeWindow?.webContents.send('launcher:tools-update', {
          python: tools.python,
          git: tools.git,
          pythonOk: tools.pythonOk,
          gitOk: tools.gitOk,
        });

        // Run version check only after tools are confirmed usable.
        if (tools.gitOk && tools.pythonOk) {
          const cfg2 = loadConfig();
          if (isBootstrapComplete(cfg2.installationPath)) {
            const versionTimerId = 'background:version-check';
            debugTimer(versionTimerId);
            try {
              debugLog('ipc', '[BACKGROUND:VERSION] Loading config...');
              const configStart = Date.now();
              const config = loadConfig();
              debugLog('ipc', '[BACKGROUND:VERSION] Config loaded', { installationPath: config.installationPath, elapsed: `${Date.now() - configStart}ms` });

              debugLog('ipc', '[BACKGROUND:VERSION] Starting version check...');
              const versionStart = Date.now();
              const version = readInstalledVersion(config.installationPath);
              const installed = Boolean(version);
              const versionText = version ? `${version.date} (${version.commit})` : 'N/A';

              debugLog('ipc', '[BACKGROUND:VERSION] Version check complete', { installed, version: versionText, elapsed: `${Date.now() - versionStart}ms` });
              debugTimerEnd(versionTimerId);
              cachedVersionUpdate = {
                installed,
                version: versionText,
              };

              activeWindow?.webContents.send('launcher:version-update', {
                installed,
                version: versionText,
              });
            } catch (error) {
              debugLog('ipc', '[BACKGROUND:VERSION] Version check / config load failed', error);
              debugTimerEnd(versionTimerId);
              cachedVersionUpdate = {
                installed: false,
                version: 'N/A',
              };
              activeWindow?.webContents.send('launcher:version-update', {
                installed: false,
                version: 'N/A',
              });
            }
          }
        }
      } catch (error) {
        debugLog('ipc', '[BACKGROUND:TOOLS] Tool version checks failed', error);
        debugTimerEnd(timerId);
      } finally {
        backgroundChecksInFlight = false;
        lastBackgroundChecksAt = Date.now();
      }
    });
  }

  /**
   * Handler: launcher:load-config
   * Loads the persisted configuration from disk
   * @returns Promise resolving to the loaded SdNextConfig
   */
  ipcMain.handle('launcher:load-config', async () => {
    debugLog('ipc', 'launcher:load-config invoked');
    return loadConfig();
  });

  /**
   * Handler: launcher:save-config
   * Persists the configuration to disk
   * @param config - The configuration object to save
   * @returns Promise resolving to the saved configuration
   */
  ipcMain.handle('launcher:save-config', async (_event, config: SdNextConfig) => {
    debugLog('ipc', 'launcher:save-config invoked', {
      installationPath: config.installationPath,
      modelsPath: config.modelsPath,
      backend: config.backend,
    });
    return saveConfig(config);
  });

  /**
   * Handler: launcher:browse-directory
   * Opens a native directory selection dialog
   * @returns Promise resolving to selected directory path or null if cancelled
   */
  ipcMain.handle('launcher:browse-directory', async () => {
    debugLog('ipc', 'launcher:browse-directory invoked');
    const result = await dialog.showOpenDialog(activeWindow ?? window, {
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  /**
   * Handler: launcher:install
   * Runs the installation workflow to set up SD.Next with specified options
   * @param payload - Contains config, install options, and optional terminal dimensions
   * @returns Promise resolving to success status and exit code
   */
  ipcMain.handle('launcher:install', async (_event, payload: { config: SdNextConfig; options: InstallOptions; terminalDimensions?: TerminalDimensions }) => {
    const timerId = `install-workflow-${Date.now()}`;
    debugTimer(timerId);
    debugLog('ipc', '[INSTALL] launcher:install invoked', { ...payload.options, backend: payload.config.backend });
    
    // Prevent parallel operations
    if (operationInProgress) {
      debugLog('ipc', '[INSTALL] Operation already in progress', { operation: operationInProgress });
      return { success: false, code: 1, message: `Cannot install while ${operationInProgress} is in progress` };
    }
    
    operationInProgress = 'install';
    const config = saveConfig(payload.config);
    setStatus(STATUS.INITIALIZING as UiStatus);
    let lastPackageName = '';
    stopRequested = false;

    try {
      debugLog('ipc', '[INSTALL] Starting install workflow...');
      const code = await runInstallWorkflow(
        runner,
        config,
        payload.options,
        (text, isError) => {
          emitTerminal(text, isError);
          
          // Skip status updates if stop was requested
          if (stopRequested) {
            return;
          }
          
          // Remove ANSI escape codes more aggressively
          // Handle all ANSI sequences: CSI, OSC, and single char escapes
          let cleanText = text
            .replace(/\u001B\[[0-9;?]*[ -/]*[@-~]/g, '') // CSI sequences
            .replace(/\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)/g, '') // OSC sequences
            .replace(/\u001B[@-Z\\-_]/g, ''); // Single char escapes
          
          // Also handle embedded ANSI codes that might split the pattern
          cleanText = cleanText.replace(/\x1b\[[0-9;]*m/g, ''); // Color codes
          cleanText = cleanText.replace(/\x1b\[K/g, ''); // Clear line
          cleanText = cleanText.replace(/\x1b\[H/g, ''); // Cursor home
          
          debugLog('ipc', '[INSTALL] onOutput callback', { 
            textFragment: text.substring(0, 100),
            cleanFragment: cleanText.substring(0, 100),
            hasInstall: cleanText.includes('Install:'),
            hasPackage: cleanText.includes('package=')
          });
          
          // Monitor for package installation progress
          if (cleanText.includes('Install:') || cleanText.toLowerCase().includes('install:')) {
            debugLog('ipc', '[INSTALL] Found Install: marker', { cleanText: cleanText.substring(0, 500) });
            
            // More flexible regex: Install: can be followed by anything, then package="name"
            let packageMatch = cleanText.match(/Install:.*?package=["']?([a-zA-Z0-9_\.\-]+)/i);
            
            if (!packageMatch) {
              // Try simpler pattern: just look for package="name"
              packageMatch = cleanText.match(/package=["']?([a-zA-Z0-9_\.\-]+)/i);
            }
            
            if (packageMatch && packageMatch[1]) {
              const packageName = packageMatch[1];
              debugLog('ipc', '[INSTALL] Package matched', { packageName, fullMatch: packageMatch[0] });
              if (packageName !== lastPackageName) {
                lastPackageName = packageName;
                debugLog('ipc', '[INSTALL] Status change', { from: 'Installing...', to: `Installing: ${packageName}` });
                setStatus(`Installing: ${packageName}`);
              }
            }
          }
        },
        setStatus,
        payload.terminalDimensions,
      );
      debugLog('ipc', '[INSTALL] Install workflow completed', { code });
      debugTimerEnd(timerId);
      if (code !== 0) {
        debugLog('ipc', '[INSTALL] Install failed with error', { code });
        setStatus(formatInstallError(code) as UiStatus);
        return { success: false, code };
      }
      setStatus(STATUS.IDLE as UiStatus);
      return { success: true, code };
    } catch (error) {
      debugLog('ipc', '[INSTALL] Install workflow failed', error);
      debugTimerEnd(timerId);
      setStatus(formatError(getErrorMessage(error)) as UiStatus);
      emitTerminal(`${getErrorMessage(error)}\n`, true);
      return { success: false, code: 1 };
    } finally {
      stopRequested = false;
      operationInProgress = null;
    }
  });

  /**
   * Handler: launcher:launch
   * Starts the SD.Next web UI server (launch workflow)
   * @param payload - Contains config and optional terminal dimensions
   * @returns Promise resolving to success status and exit code
   */
  ipcMain.handle('launcher:launch', async (_event, payload: { config: SdNextConfig; terminalDimensions?: TerminalDimensions }) => {
    const timerId = `launch-workflow-${Date.now()}`;
    debugTimer(timerId);
    debugLog('ipc', '[LAUNCH] launcher:launch invoked', { backend: payload.config.backend, repositoryBranch: payload.config.repositoryBranch });
    
    // Prevent parallel operations
    if (operationInProgress) {
      debugLog('ipc', '[LAUNCH] Operation already in progress', { operation: operationInProgress });
      return { success: false, code: 1, message: `Cannot launch while ${operationInProgress} is in progress` };
    }
    
    operationInProgress = 'launch';
    const config = saveConfig(payload.config);
    setStatus(STATUS.INITIALIZING as UiStatus);
    let startupTimeBuffer = '';
    let startingStatusEmitted = false;
    let readyStatusEmitted = false;

    try {
      debugLog('ipc', '[LAUNCH] Starting application workflow...');
      const code = await runLaunchWorkflow(
        runner,
        config,
        (text, isError) => {
          emitTerminal(text, isError);
          if (readyStatusEmitted) {
            return;
          }

          // Keep a rolling, normalized buffer to detect marker text across chunk boundaries.
          // Strip ANSI and collapse whitespace so matches remain stable across terminal formatting.
          const normalizedText = text
            .replace(/\u001B\[[0-9;?]*[ -/]*[@-~]/g, '')
            .replace(/\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)/g, '')
            .replace(/\u001B[@-Z\\-_]/g, '')
            .replace(/\s+/g, ' ')
            .toLowerCase();
          startupTimeBuffer = `${startupTimeBuffer} ${normalizedText}`.trim();
          if (startupTimeBuffer.length > 1024) {
            startupTimeBuffer = startupTimeBuffer.slice(-1024);
          }

          if (!startingStatusEmitted && /starting\s*module/.test(startupTimeBuffer)) {
            startingStatusEmitted = true;
            debugLog('ipc', '[LAUNCH] Module start marker detected, setting Launching status');
            setStatus(STATUS.LAUNCHING as UiStatus);
          }

          if (/startup\s*time/.test(startupTimeBuffer)) {
            readyStatusEmitted = true;
            debugLog('ipc', '[LAUNCH] Startup marker detected, setting Ready status');
            setStatus(STATUS.READY as UiStatus);
          }
        },
        payload.terminalDimensions,
      );
      debugLog('ipc', '[LAUNCH] Launch workflow completed', { code });
      debugTimerEnd(timerId);
      
      // Always reset to Idle when process terminates, regardless of exit code
      setStatus(STATUS.IDLE as UiStatus);
      
      if (code !== 0) {
        debugLog('ipc', '[LAUNCH] Launch failed with error', { code });
        emitTerminal(`\n[error] Process exited with code ${code}\n`, true);
        return { success: false, code };
      }
      return { success: true, code };
    } catch (error) {
      debugLog('ipc', '[LAUNCH] Launch workflow failed', error);
      debugTimerEnd(timerId);
      setStatus(STATUS.IDLE as UiStatus);
      emitTerminal(`\n[error] ${getErrorMessage(error)}\n`, true);
      return { success: false, code: 1 };
    } finally {
      operationInProgress = null;
    }
  });

  /**
   * Handler: launcher:stop  
   * Stops the currently running operation (bootstrap, install, or start)
   * @returns Promise resolving to success status
   */
  ipcMain.handle('launcher:stop', async () => {
    debugLog('ipc', 'launcher:stop invoked');
    stopRequested = true;
    emitTerminal('\n[stop] Stopping process...\n', false);
    
    // Check if bootstrap is in progress and abort it
    const bootstrapAbortController = (globalThis as unknown as { bootstrapAbortController?: AbortController }).bootstrapAbortController;
    if (bootstrapAbortController && !bootstrapAbortController.signal.aborted) {
      debugLog('ipc', '[STOP] Aborting bootstrap process');
      bootstrapAbortController.abort();
      emitTerminal('[stop] Bootstrap aborted\n', false);
      setStatus(STATUS.IDLE as UiStatus);
      // CRITICAL FIX: Clear operation lock after abort
      operationInProgress = null;
      return { success: true };
    }
    
    await runner.stop();
    emitTerminal('[stop] Process terminated\n', false);
    setStatus(STATUS.IDLE as UiStatus);
    // CRITICAL FIX: Clear operation lock after stop
    operationInProgress = null;
    return { success: true };
  });

  /**
   * Handler: launcher:exit
   * Quits the application gracefully
   * @returns Promise resolving to success status
   */
  ipcMain.handle('launcher:exit', async () => {
    debugLog('ipc', 'launcher:exit invoked');
    setImmediate(() => {
      app.quit();
    });
    return { success: true };
  });

  /**
   * Handler: launcher:read-log
   * Reads the content of a log file (install or launch)
   * @param payload - Contains log kind and config with installation path
   * @returns Promise resolving to log file existence status, path, and content
   */
  ipcMain.handle('launcher:read-log', async (_event, payload: { kind: 'install' | 'launch'; config: SdNextConfig }) => {
    debugLog('ipc', 'launcher:read-log invoked', { kind: payload.kind });
    const filePath = getLogPath(payload.kind, payload.config);
    if (!fs.existsSync(filePath)) {
      return { exists: false, path: filePath, content: '' };
    }
    return { exists: true, path: filePath, content: fs.readFileSync(filePath, 'utf8') };
  });

  /**
   * Handler: launcher:open-log
   * Opens a log file in the system's default text editor
   * @param payload - Contains log kind and config with installation path
   * @returns Promise resolving to success status and optional error message
   */
  ipcMain.handle('launcher:open-log', async (_event, payload: { kind: 'install' | 'launch'; config: SdNextConfig }) => {
    debugLog('ipc', 'launcher:open-log invoked', { kind: payload.kind });
    const filePath = getLogPath(payload.kind, payload.config);
    if (!fs.existsSync(filePath)) {
      return { success: false, message: `Log does not exist: ${filePath}` };
    }
    const result = await shell.openPath(filePath);
    if (result) {
      return { success: false, message: result };
    }
    return { success: true, message: '' };
  });

  /**
   * Handler: launcher:open-external
   * Opens a URL in the system's default browser
   * @param payload - Contains the URL to open
   * @returns Promise resolving to success status and optional error message
   */
  ipcMain.handle('launcher:open-external', async (_event, payload: { url: string }) => {
    let url = payload.url.trim();
    // strip ANSI sequences which may sneak in from logs
    const ANSI_ESCAPE_RE = /[\u001B\u009B][[\]()#;?]*(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007|(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~])/g;
    url = url.replace(ANSI_ESCAPE_RE, '').trim();

    debugLog('ipc', 'launcher:open-external invoked', { url });
    // automatically prepend http if scheme missing
    if (url && !/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(url)) {
      url = 'http://' + url;
      debugLog('ipc', 'added http scheme to url', { url });
    }
    try {
      // simple validation: only allow http/https
      const parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol)) {
        throw new Error('Unsupported protocol: ' + parsed.protocol);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: 'Invalid URL: ' + msg };
    }
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      const message = getErrorMessage(error);
      return { success: false, message };
    }
  });

  /**
   * Handler: launcher:wipe-path
   * Deletes a specific directory (venv, bin, or app) from the installation
   * @param payload - Contains installation path and target directory to wipe
   * @returns Promise resolving to success status, wiped path, and optional error message
   */
  ipcMain.handle('launcher:wipe-path', async (_event, payload: { installationPath: string; target: 'venv' | 'bin' | 'app' }) => {
    debugLog('ipc', 'launcher:wipe-path invoked', payload);
    const wipeTimerStart = Date.now();

    try {
      const installDir = payload.installationPath.trim();
      if (!installDir) {
        return { success: false, path: '', message: 'Installation path is required' };
      }

      const targetName = payload.target;
      if (!['venv', 'bin', 'app'].includes(targetName)) {
        return { success: false, path: '', message: 'Invalid wipe target' };
      }

      const resolvedInstallDir = path.resolve(installDir);
      const wipePath = path.resolve(path.join(resolvedInstallDir, targetName));
      const allowedPrefix = `${resolvedInstallDir}${path.sep}`;
      if (!wipePath.startsWith(allowedPrefix)) {
        return { success: false, path: wipePath, message: 'Refusing to wipe path outside installation directory' };
      }

      emitTerminal(`[wipe] Starting cleanup of '${targetName}' at: ${wipePath}\n`, false);

      if (fs.existsSync(wipePath)) {
        // Async rm keeps the Electron main thread responsive during large deletes.
        await fs.promises.rm(wipePath, { recursive: true, force: true });
      }

      const elapsedMs = Date.now() - wipeTimerStart;
      emitTerminal(`[wipe] Completed cleanup of '${targetName}' in ${elapsedMs}ms\n`, false);
      return { success: true, path: wipePath };
    } catch (error) {
      const message = getErrorMessage(error);
      const elapsedMs = Date.now() - wipeTimerStart;
      emitTerminal(`[wipe] Failed cleanup after ${elapsedMs}ms: ${message}\n`, true);
      return { success: false, path: '', message };
    }
  });

  /**
   * Handler: launcher:get-version-info
   * Retrieves version information from the installed SD.Next application
   * Reads package.json and git commit info
   * @param payload - Contains the installation path where app is located
   * @returns Promise resolving to version info (app version, commit hash, date, branch)
   */
  ipcMain.handle('launcher:get-version-info', async (_event, payload: { installationPath: string }) => {
    debugLog('ipc', 'launcher:get-version-info invoked', payload);
    const result = {
      appVersion: 'N/A',
      commitHash: 'N/A',
      commitDate: 'N/A',
      branch: 'N/A',
    };

    try {
      const tools = getToolVersions(payload.installationPath);
      if (!tools.gitOk) {
        debugLog('ipc', 'launcher:get-version-info skipped: git not ready', { git: tools.git });
        return result;
      }

      const appDir = path.join(payload.installationPath, 'app');
      if (!fs.existsSync(appDir)) {
        return result;
      }

      // Read app version from package.json
      const packageJsonPath = path.join(appDir, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        try {
          const packageData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
          result.appVersion = packageData.version || 'N/A';
        } catch (error) {
          debugLog('ipc', 'Failed to read package.json', error);
        }
      }

      // Get git commit hash (short)
      try {
        const gitExe = getGitExecutablePath(payload.installationPath);
        const commitHash = execSync(`${gitExe} rev-parse --short HEAD`, {
          cwd: appDir,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'ignore'],
        }).trim();
        result.commitHash = commitHash;
      } catch (error) {
        debugLog('ipc', 'Failed to get git commit hash', error);
      }

      // Get git branch
      try {
        const gitExe = getGitExecutablePath(payload.installationPath);
        const branch = execSync(`${gitExe} rev-parse --abbrev-ref HEAD`, {
          cwd: appDir,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'ignore'],
        }).trim();
        result.branch = branch;
      } catch (error) {
        debugLog('ipc', 'Failed to get git branch', error);
      }

      // Get git commit date (try multiple approaches for robustness)
      try {
        let commitDate = '';
        try {
          commitDate = execSync('git show -s --format=%ai HEAD', {
            cwd: appDir,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'ignore'],
          }).trim();
        } catch {
          // Fallback to git log if show fails
          commitDate = execSync('git log -1 --format=%ai HEAD', {
            cwd: appDir,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'ignore'],
          }).trim();
        }
        // Format: YYYY-MM-DD HH:MM:SS +0000 -> YYYY-MM-DD
        const dateOnly = commitDate.split(' ')[0];
        result.commitDate = dateOnly && dateOnly.length > 0 ? dateOnly : 'N/A';
      } catch (error) {
        debugLog('ipc', 'Failed to get git commit date', error);
        result.commitDate = 'N/A';
      }

      return result;
    } catch (error) {
      debugLog('ipc', 'launcher:get-version-info failed', error);
      return result;
    }
  });
}

export async function stopActiveOperation(): Promise<void> {
  debugLog('ipc', 'stopActiveOperation invoked');
  await runner.stop();
}
