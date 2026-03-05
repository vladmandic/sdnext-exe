import { BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { shell } from 'electron';
import type { InstallOptions, SdNextConfig, TerminalDimensions, UiStatus, StartupState } from '../shared/types';
import { loadConfig, saveConfig } from './services/config-service';
import { getLogoPath } from './services/runtime-paths';
import { readInstalledVersion } from './services/version-service';
import { ProcessRunner } from './services/process-runner';
import { runInstallWorkflow } from './services/install-workflow';
import { runStartWorkflow } from './services/start-workflow';
import {
  isBootstrapComplete,
  getBootstrapError,
  startBootstrapAsync,
  setBootstrapOutputCallback,
  setBootstrapStatusCallback,
  resetBootstrapState,
  cleanupPortableRuntimes,
} from './services/portable-bootstrap';
import { getToolVersions } from './services/tool-version-service';
import { debugLog, debugTimer, debugTimerEnd } from './services/debug';
import { detectGPUs, type GPUDetectionResult } from './services/gpu-detection';

const runner = new ProcessRunner();
let status: UiStatus = 'Idle';
let handlersRegistered = false;
let activeWindow: BrowserWindow | null = null;
let trayUpdateFn: ((status: string) => void) | null = null;
let cachedGPUDetection: GPUDetectionResult | null = null;

function getGPUDetection(): GPUDetectionResult {
  if (!cachedGPUDetection) {
    cachedGPUDetection = detectGPUs();
  }
  return cachedGPUDetection;
}

function setStatus(nextStatus: UiStatus): void {
  debugLog('ipc', 'Status update', { from: status, to: nextStatus });
  status = nextStatus;
  activeWindow?.webContents.send('launcher:status', status);
  
  // Update tray status if available
  if (trayUpdateFn) {
    trayUpdateFn(nextStatus);
  }
}

function emitTerminal(text: string, isError?: boolean): void {
  debugLog('ipc', 'Terminal output forwarded', { isError, bytes: text.length });
  activeWindow?.webContents.send('launcher:terminal', { text, isError });
}

function getLogPath(kind: 'install' | 'start', config: SdNextConfig): string {
  const appPath = path.join(config.installationPath, 'app');
  return path.join(appPath, kind === 'install' ? 'install.log' : 'sdnext.log');
}

export function setTrayUpdateFunction(fn: (status: string) => void): void {
  trayUpdateFn = fn;
}

export function registerIpc(window: BrowserWindow): void {
  activeWindow = window;
  debugLog('ipc', 'Registering IPC handlers');

  if (handlersRegistered) {
    return;
  }
  handlersRegistered = true;

  ipcMain.handle('launcher:start-bootstrap', async () => {
    const timerId = `bootstrap-${Date.now()}`;
    debugTimer(timerId);
    debugLog('ipc', '[BOOTSTRAP] launcher:start-bootstrap invoked');
    // Reset bootstrap state to force full extraction
    debugLog('ipc', '[BOOTSTRAP] Resetting bootstrap state');
    resetBootstrapState();
    
    // Set status to Bootstrapping
    setStatus('Bootstrapping...');
    
    // Set output callback for terminal display
    setBootstrapOutputCallback(emitTerminal);
    setBootstrapStatusCallback(setStatus);
    
    // Clean up existing non-functional installations
    debugLog('ipc', '[BOOTSTRAP] Cleaning up existing portable runtimes');
    cleanupPortableRuntimes((text) => emitTerminal(text, false));
    
    try {
      debugLog('ipc', '[BOOTSTRAP] Starting bootstrap extraction...');
      await startBootstrapAsync();
      debugLog('ipc', '[BOOTSTRAP] Bootstrap extraction completed');
      // Keep completion visible briefly before returning to idle.
      setStatus('Bootstrap complete');
      await new Promise((resolve) => setTimeout(resolve, 500));
      debugTimerEnd(timerId);
      setStatus('Idle');
      return { success: true };
    } catch (error) {
      debugLog('ipc', '[BOOTSTRAP] Bootstrap failed', error);
      debugTimerEnd(timerId);
      const message = error instanceof Error ? error.message : String(error);
      emitTerminal(`Bootstrap error: ${message}\n`, true);
      setStatus(`Error: ${message}`);
      return { success: false, message };
    }
  });

  ipcMain.handle('launcher:get-startup-state', async () => {
    const timerId = `startup-state-${Date.now()}`;
    debugTimer(timerId);
    debugLog('ipc', '[STARTUP] launcher:get-startup-state invoked');
    try {
      // Return immediately with minimal state - don't wait for GPU detection or tool checks
      debugLog('ipc', '[STARTUP] Building initial state...');
      const initialState: StartupState = {
        logoPath: getLogoPath(),
        installed: false,
        version: 'N/A',
        status: status,
        tools: {
          python: 'Checking...',
          git: 'Checking...',
        },
        gpus: [],
        recommendedBackend: 'autodetect',
      };

      // Check if bootstrap is still in progress
      debugLog('ipc', '[STARTUP] Checking bootstrap state...');
      if (!isBootstrapComplete()) {
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
      initialState.version = 'Checking...';

      // Do all expensive checks in background (non-blocking)
      setImmediate(() => {
        performBackgroundChecks();
      });

      debugTimerEnd(timerId);
      return initialState;
    } catch (error) {
      debugLog('ipc', 'Failed to build startup state', error);
      const message = (error as Error).message;
      const nextStatus: UiStatus = `Error: ${message}`;
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
      };
    }
  });

  // Helper function to perform time-consuming checks asynchronously
  function performBackgroundChecks(): void {
    debugLog('ipc', '[BACKGROUND] Starting background checks');

    // Get GPU detection asynchronously
    setImmediate(() => {
      const timerId = 'background:gpu-detection';
      debugTimer(timerId);
      try {
        debugLog('ipc', '[BACKGROUND:GPU] Starting GPU detection');
        const gpuDetection = getGPUDetection();
        debugLog('ipc', '[BACKGROUND:GPU] GPU detection complete', { gpuCount: gpuDetection.gpus.length, recommendedBackend: gpuDetection.recommendedBackend });
        debugTimerEnd(timerId);
        activeWindow?.webContents.send('launcher:gpu-update', {
          gpus: gpuDetection.gpus,
          recommendedBackend: gpuDetection.recommendedBackend,
        });
      } catch (error) {
        debugLog('ipc', '[BACKGROUND:GPU] GPU detection failed', error);
        debugTimerEnd(timerId);
      }
    });

    // Get tool versions asynchronously
    setImmediate(() => {
      const timerId = 'background:tool-versions';
      debugTimer(timerId);
      try {
        debugLog('ipc', '[BACKGROUND:TOOLS] Starting tool version checks');
        const tools = getToolVersions((errorMsg) => {
          emitTerminal(errorMsg, true);
        });
        debugLog('ipc', '[BACKGROUND:TOOLS] Tool version checks complete', { git: tools.git, python: tools.python, gitOk: tools.gitOk, pythonOk: tools.pythonOk });
        debugTimerEnd(timerId);
        
        // Check if tools are missing and bootstrap is required
        if (!tools.gitOk || !tools.pythonOk) {
          debugLog('ipc', '[BACKGROUND:TOOLS] Bootstrap required due to missing tools', { gitOk: tools.gitOk, pythonOk: tools.pythonOk });
          resetBootstrapState();
          const failedTools = [];
          if (!tools.gitOk) failedTools.push('Git');
          if (!tools.pythonOk) failedTools.push('Python');
          const requiredStatus: UiStatus = `Error: ${failedTools.join(' & ')} unavailable | Bootstrap required`;
          setStatus(requiredStatus);
        }
        
        activeWindow?.webContents.send('launcher:tools-update', {
          python: tools.python,
          git: tools.git,
          pythonOk: tools.pythonOk,
          gitOk: tools.gitOk,
        });
      } catch (error) {
        debugLog('ipc', '[BACKGROUND:TOOLS] Tool version checks failed', error);
        debugTimerEnd(timerId);
      }
    });

    // Load config and check version asynchronously - only if bootstrap is complete
    if (isBootstrapComplete()) {
      setImmediate(() => {
        const timerId = 'background:version-check';
        debugTimer(timerId);
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
          debugTimerEnd(timerId);
          
          activeWindow?.webContents.send('launcher:version-update', {
            installed,
            version: versionText,
          });
        } catch (error) {
          debugLog('ipc', '[BACKGROUND:VERSION] Version check / config load failed', error);
          debugTimerEnd(timerId);
          activeWindow?.webContents.send('launcher:version-update', {
            installed: false,
            version: 'N/A',
          });
        }
      });
    }
  }

  ipcMain.handle('launcher:load-config', async () => {
    debugLog('ipc', 'launcher:load-config invoked');
    return loadConfig();
  });

  ipcMain.handle('launcher:save-config', async (_event, config: SdNextConfig) => {
    debugLog('ipc', 'launcher:save-config invoked', {
      installationPath: config.installationPath,
      modelsPath: config.modelsPath,
      backend: config.backend,
    });
    return saveConfig(config);
  });

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

  ipcMain.handle('launcher:install', async (_event, payload: { config: SdNextConfig; options: InstallOptions; terminalDimensions?: TerminalDimensions }) => {
    const timerId = `install-workflow-${Date.now()}`;
    debugTimer(timerId);
    debugLog('ipc', '[INSTALL] launcher:install invoked', { ...payload.options, backend: payload.config.backend });
    const config = saveConfig(payload.config);
    setStatus('Installing...');

    try {
      debugLog('ipc', '[INSTALL] Starting install workflow...');
      const code = await runInstallWorkflow(runner, config, payload.options, (text, isError) => emitTerminal(text, isError), setStatus, payload.terminalDimensions);
      debugLog('ipc', '[INSTALL] Install workflow completed', { code });
      debugTimerEnd(timerId);
      if (code !== 0) {
        debugLog('ipc', '[INSTALL] Install failed with error', { code });
        setStatus(`Error: Install failed with exit code ${code}`);
        return { success: false, code };
      }
      setStatus('Idle');
      return { success: true, code };
    } catch (error) {
      debugLog('ipc', '[INSTALL] Install workflow failed', error);
      debugTimerEnd(timerId);
      setStatus(`Error: ${(error as Error).message}`);
      emitTerminal(`${(error as Error).message}\n`, true);
      return { success: false, code: 1 };
    }
  });

  ipcMain.handle('launcher:start', async (_event, payload: { config: SdNextConfig; terminalDimensions?: TerminalDimensions }) => {
    const timerId = `start-workflow-${Date.now()}`;
    debugTimer(timerId);
    debugLog('ipc', '[START] launcher:start invoked', { backend: payload.config.backend, repositoryBranch: payload.config.repositoryBranch });
    const config = saveConfig(payload.config);
    setStatus('Running...');

    try {
      debugLog('ipc', '[START] Starting application workflow...');
      const code = await runStartWorkflow(runner, config, (text, isError) => emitTerminal(text, isError), payload.terminalDimensions);
      debugLog('ipc', '[START] Start workflow completed', { code });
      debugTimerEnd(timerId);
      if (code !== 0) {
        debugLog('ipc', '[START] Start failed with error', { code });
        setStatus(`Error: Start failed with exit code ${code}`);
        return { success: false, code };
      }
      setStatus('Idle');
      return { success: true, code };
    } catch (error) {
      debugLog('ipc', '[START] Start workflow failed', error);
      debugTimerEnd(timerId);
      setStatus(`Error: ${(error as Error).message}`);
      emitTerminal(`${(error as Error).message}\n`, true);
      return { success: false, code: 1 };
    }
  });

  ipcMain.handle('launcher:stop', async () => {
    debugLog('ipc', 'launcher:stop invoked');
    emitTerminal('\n[stop] Stopping process...\n', false);
    await runner.stop();
    emitTerminal('[stop] Process terminated\n', false);
    setStatus('Idle');
    return { success: true };
  });

  ipcMain.handle('launcher:read-log', async (_event, payload: { kind: 'install' | 'start'; config: SdNextConfig }) => {
    debugLog('ipc', 'launcher:read-log invoked', { kind: payload.kind });
    const filePath = getLogPath(payload.kind, payload.config);
    if (!fs.existsSync(filePath)) {
      return { exists: false, path: filePath, content: '' };
    }
    return { exists: true, path: filePath, content: fs.readFileSync(filePath, 'utf8') };
  });

  ipcMain.handle('launcher:open-log', async (_event, payload: { kind: 'install' | 'start'; config: SdNextConfig }) => {
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

  ipcMain.handle('launcher:open-external', async (_event, payload: { url: string }) => {
    debugLog('ipc', 'launcher:open-external invoked', { url: payload.url });
    try {
      await shell.openExternal(payload.url);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, message };
    }
  });
}

export async function stopActiveOperation(): Promise<void> {
  debugLog('ipc', 'stopActiveOperation invoked');
  await runner.stop();
}
