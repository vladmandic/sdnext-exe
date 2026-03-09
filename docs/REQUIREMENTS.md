# SD.Next Installer/Launcher - Comprehensive Requirements

**Document Version**: 1.1  
**Last Updated**: March 7, 2026  
**Purpose**: Complete technical specification for building an Electron-based installer/launcher application

## March 7, 2026 Enhancements

### New Features Implemented
1. **Checkpoint Recovery** - Resume interrupted installations
2. **Comprehensive Logging** - Async file logging with queue management
3. **Promise Utilities** - Retry logic, timeouts, deduplication patterns
4. **Sandbox Testing** - Venv health validation and diagnostics
5. **Theme Preferences** - System auto-detect + manual selection
6. **Public Network Mode** - Enable remote web UI access
7. **Window State** - Persist size and position
8. **Bootstrap Progress** - Real-time extraction progress display
9. **Error Boundary** - Graceful UI error handling
10. **Enhanced Validation** - Branded types for path/env-var safety

### Type Safety Enhancements
- **Brand Validation** - `ValidatedPath`, `ValidatedEnvVarName`
- **IPC Contracts** - Full type mappings for all channels
- **Runtime Validation** - Zod schemas + custom validators

---

## Executive Summary

Build a Windows-only Electron desktop application that:
- Acts as an installer and launcher for SD.Next (a complex Python application)
- Bundles portable Git and Python runtimes (zip archives)
- Extracts bundled tools on first run (bootstrap process)
- Provides a modern UI with embedded terminal for installation/launch workflows
- Persists user configuration and supports advanced customization
- Manages child processes with proper cleanup
- Follows enterprise-grade error handling and resource management patterns

**Target Platform**: Windows 10/11 64-bit only  
**Distribution**: Single portable `.exe` file (~150-250 MB with bundled runtimes)  
**User Audience**: Both technical and non-technical users

---

## 1. Technical Stack

### Core Framework
- **Electron**: v31+ (main process, renderer process, preload script)
- **Node.js**: v22.x (bundled with Electron)
- **React**: v18+ (renderer UI)
- **TypeScript**: v5.x with strict mode enabled
- **Build Tool**: Vite v7+ for renderer, tsc for main process
- **Packager**: electron-builder v26+ for portable exe generation

## 2. Application Architecture

### Process Model

```
┌─────────────────────────────────────────────────────────┐
│ MAIN PROCESS (Node.js)                                  │
├─────────────────────────────────────────────────────────┤
│ • Window Management (BrowserWindow, Tray)               │
│ • IPC Handler Registration                              │
│ • Service Layer (17 services)                           │
│ • Child Process Management (PTY-based)                  │
│ • File I/O Operations                                   │
│ • Configuration Persistence                             │
└─────────────────────────────────────────────────────────┘
                          ↕
              Secure IPC Bridge (contextBridge)
                          ↕
┌─────────────────────────────────────────────────────────┐
│ PRELOAD SCRIPT                                          │
├─────────────────────────────────────────────────────────┤
│ • Exposes type-safe window.sdnext API                   │
│ • No Node.js APIs exposed to renderer                   │
│ • Validates IPC contracts                               │
└─────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────┐
│ RENDERER PROCESS (React SPA)                            │
├─────────────────────────────────────────────────────────┤
│ • React 18+ with hooks                                  │
│ • Component tree with ErrorBoundary                     │
│ • State management (useState, useRef, useCallback)      │
│ • xterm.js terminal integration                         │
│ • Tabbed interface (Terminal, Docs, Changelog)          │
│ • Theme support (light/dark auto-detect)                │
└─────────────────────────────────────────────────────────┘
```

### Service Layer (Main Process)

**17 Core Services**:

1. **portable-bootstrap.ts** - Extracts bundled git.zip and python.zip
2. **runtime-paths.ts** - Resolves tool executable paths
3. **tool-version-service.ts** - Probes Python/Git versions
4. **version-service.ts** - Detects installed app version via git
5. **config-service.ts** - Loads/saves JSON config with Zod validation
6. **process-runner.ts** - PTY-based child process spawning
7. **process-termination.ts** - Cleanup with taskkill /T /F
8. **venv-service.ts** - Python venv creation/validation
9. **install-workflow.ts** - 5-step installation state machine
10. **start-workflow.ts** - Application launch workflow
11. **logger-service.ts** - Queue-based file logging with size limits
12. **checkpoint-service.ts** - Partial installation recovery tracking
13. **sandbox-test-service.ts** - Venv health validation
14. **gpu-detection.ts** - Windows WMI GPU query
15. **workflow-common.ts** - Shared git/environment utilities
16. **promise-utils.ts** - withRetry, withTimeout helpers
17. **debug.ts** - Conditional debug logging with timestamps

---

## 3. Core Features

### 3.1 Bootstrap Workflow

**Purpose**: One-time extraction of bundled portable runtimes

**Requirements**:
- Bundle `nuget-git-2.53.0.zip` and `python-3.13.12.zip` in exe resources
- Extract to `<exe-dir>/sdnext/bin/git` and `<exe-dir>/sdnext/bin/python`
- Use `extract-zip` library for extraction (not PowerShell Expand-Archive for compatibility)
- Display progress bar (0-100%) with extraction status
- Sub-step status updates:
  - "Unpacking Git..."
  - "Extracting Git archive..."
  - "Verifying Git installation..."
  - "Unpacking Python..."
  - "Extracting Python archive..."
  - "Verifying Python installation..."
- Bootstrap button disabled if tools already available
- Bootstrap is prerequisite for Install/Start buttons
- Use AbortController for cancellation support
- Validate extracted executables exist before marking complete

**Error Handling**:
- Cleanup partial extractions on error
- Display error in status chip
- Allow retry after bootstrap failure
- Log all operations for debugging

---

### 3.2 Installation Workflow

**5-Step State Machine**:

1. **Clone Repository**
   - Clone from `https://github.com/vladmandic/sdnext`
   - Support branch selection: "master" or "dev"
   - Use bundled git.exe (not system git)
   - Retry logic: 3 attempts with exponential backoff
   - Use `--single-branch` flag for faster clones

2. **Checkout Branch**
   - Switch to selected branch if different
   - Skip if already on target branch

3. **Create Virtual Environment**
   - Use bundled python.exe with `-m venv` command
   - Create at `<app-path>/venv`
   - Validate venv created successfully

4. **Run Installer (launch.py)**
   - Execute `<venv>/Scripts/python.exe <app-path>/launch.py`
   - Pass flags based on user options:
     - `--backend <backend>` - Compute backend selection
     - `--models-dir <path>` - Custom models directory
     - `--upgrade` - Update dependencies
     - `--reinstall` - Force reinstall
     - Custom parameters appended
   - Environment variables:
     - `FORCE_COLOR=1` - Enable ANSI colors
     - `PYTHONUNBUFFERED=1` - Unbuffered output
     - `TTY_COMPATIBLE=1` - PTY mode marker
     - `PIP_INDEX_URL` (optional) - Custom PyPI mirror
     - User-defined custom environment variables

5. **Sandbox Health Test** (Post-Install)
   - Run lightweight venv validation script
   - Import torch/tensorflow to verify installation
   - Report errors if imports fail

**Checkpoint Recovery**:
- Save progress after each step to `<install-path>/.checkpoint.json`
- On error, allow resume from last successful step
- Checkpoints include: start, git-clone, git-checkout, venv-create, installer-run, sandbox-test
- Clear checkpoint on successful completion or wipe

**Options**:
- **Wipe**: Delete entire installation directory before install
- **Upgrade**: Pass --upgrade to launch.py (update dependencies)
- **Reinstall**: Force reinstallation of dependencies
- **Custom Parameters**: Free-text field for additional CLI args
- **Custom Environment**: KEY=VALUE pairs (supports quoted values)

---

### 3.3 Start/Launch Workflow

**Purpose**: Launch the installed SD.Next application

**Requirements**:
- Validate venv exists and is healthy
- Checkout selected branch (master/dev)
- Execute `<venv>/Scripts/python.exe <app-path>/launch.py` with server flags
- Pass configuration:
  - `--models-dir <path>` - Models directory
  - `--listen` - If "Public" checkbox enabled (network access)
  - Custom parameters
  - Custom environment variables
- Environment:
  - `FORCE_COLOR=1`, `PYTHONUNBUFFERED=1`, `TTY_COMPATIBLE=1`

**Auto-Launch**:
- If enabled, automatically start app after successful installation
- Transition from "Installing..." → "Running..." status
- No user interaction required

**Running State**:
- Terminal shows real-time output with ANSI colors
- Status shows "Running..."
- Stop button enabled
- All other operation buttons disabled

---

### 3.4 Process Management

**Process Runner Service** (`process-runner.ts`):

**Key Features**:
- PTY-based spawning via `node-pty` library
- Terminal type: `xterm-256color`
- Windows ConPTY support for native colors
- Timeout support with configurable duration
- Output streaming via callback
- Clean termination with taskkill

**Requirements**:
```typescript
interface ProcessRunnerOptions {
  cwd: string;                          // Working directory
  env: Record<string, string>;          // Environment variables
  onOutput: (text: string) => void;     // Output callback
  timeout?: number;                     // Optional timeout in ms
  terminalDimensions?: {                // Terminal size
    cols: number;
    rows: number;
  };
}
```

**Lifecycle**:
1. Spawn PTY with ConPTY on Windows
2. Attach data handler for output streaming
3. Wait for exit event
4. Clear timeout timer on exit/error
5. Return exit code

**Termination**:
- `stop()` method clears timeout BEFORE killing process
- Use `taskkill /T /F /PID <pid>` for tree termination
- Set timeout handle as instance variable (not local)
- Always cleanup in catch blocks

**Error Handling**:
- Wrap spawn in try/catch
- Clear timeout on spawn error
- Log all errors with context
- Return non-zero exit code on failure

---

### 3.5 Configuration Management

**Config File**: `sdnext.json` (in exe directory)

**Schema** (Zod validation):
```typescript
interface SdNextConfig {
  autoLaunch: boolean;           // Auto-start after install
  public: boolean;               // Add --listen flag (network access)
  upgrade: boolean;              // Pass --upgrade to installer
  reinstall: boolean;            // Force dependency reinstall
  wipe: boolean;                 // Delete installation before install
  backend: ComputeBackend;       // See backend types below
  repositoryBranch: 'master' | 'dev';
  installationPath: string;      // Default: <exe-dir>/sdnext
  modelsPath: string;            // Default: <app-path>/models
  customParameters: string;      // Additional CLI args
  customEnvironment: string;     // KEY=VALUE pairs
  gitRetryCount?: number;        // Optional: git clone retry count
}

type ComputeBackend =
  | 'autodetect'
  | 'cuda'      // NVIDIA GPUs
  | 'rocm'      // AMD GPUs (native)
  | 'zluda'     // AMD GPUs (CUDA compatibility)
  | 'directml'  // DirectX-based ML
  | 'ipex'      // Intel CPUs/GPUs
  | 'openvino'; // Intel optimized
```

**Persistence**:
- Atomic writes: write to temp file, then rename
- Create backup before write: `sdnext.json.bak`
- Debounced saves (300ms delay) to avoid excessive writes
- Merge with defaults on load (handle partial configs)
- Validate with Zod schema, log validation errors

**Default Values**:
- Installation path: `<exe-directory>/sdnext`
- Binary path: `<exe-directory>/sdnext/bin`
- Models path: `<installation-path>/app/models`
- Backend: `autodetect` (or recommended based on GPU)
- Branch: `dev`
- All boolean flags: `false`

---

### 3.6 GPU Detection & Backend Recommendation

**Detection Method**: Windows WMI query

```powershell
Get-CimInstance Win32_VideoController | Select-Object Name
```

**Vendor Detection** (substring matching):
- **NVIDIA**: "NVIDIA", "GeForce", "Quadro", "Tesla"
- **AMD**: "AMD", "Radeon", "RX "
- **Intel**: "Intel", "UHD Graphics", "Iris"

**Recommendation Logic**:
1. If NVIDIA detected → recommend `cuda`
2. Else if AMD detected → recommend `rocm`
3. Else if Intel detected → recommend `ipex`
4. Else → recommend `autodetect`
5. If multiple GPUs, prefer NVIDIA > AMD > Intel

**UI Display**:
- Show all detected GPUs in Tools status chip
- Show "Suggested: <backend>" badge if different from selected
- Allow user to override recommendation

**Caching**:
- Cache GPU detection result on first query
- Clear cache only on app restart (GPUs don't change at runtime)

---

### 3.7 Terminal Integration

**Requirements**:
- Use `xterm.js` for terminal emulation
- Use `@xterm/addon-fit` for automatic resize
- PTY-based output for full ANSI color support
- Scrollback buffer: 10,000 lines
- Font: `'Cascadia Code', 'Consolas', 'Courier New', monospace`
- Font size: 13px
- Theme: Match system light/dark mode

**Features**:
- **Copy button**: Copy all terminal content to clipboard
- **Download button**: Save terminal session to .log file
- **Clear button**: Erase terminal content (visual only, doesn't affect logs)
- **Auto-scroll**: Scroll to bottom on new output
- **Lazy loading**: Only create xterm instance when terminal tab active

**Integration**:
```typescript
// Main process: emit terminal output
activeWindow?.webContents.send('launcher:terminal', {
  text: string,
  isError?: boolean
});

// Renderer: listen and append
window.sdnext.onTerminalOutput((data) => {
  terminal.write(normalizeTerminalChunk(data.text));
});
```

**Log Files**:
- **install.log**: Installation workflow output at `<app-path>/install.log`
- **sdnext.log**: Application runtime output at `<app-path>/sdnext.log`
- Tee output to both terminal and log file
- Use logger service with queue (max 1000 entries)
- Flush queue asynchronously with setImmediate

---

### 3.8 UI/UX Requirements

#### Window Configuration
- **Size**: 950px × 700px (default)
- **Resizable**: Yes
- **Menu bar**: Hidden (hide via `autoHideMenuBar: true`)
- **Icon**: `logo.png` from resources
- **Title**: "SD.Next" (no subtitle in window title)
- **Frame**: Standard Windows frame
- **Sandbox**: Enabled (`sandbox: true`)
- **Context isolation**: Enabled (`contextIsolation: true`)

#### Layout Structure

```
┌─────────────────────────────────────────────────────┐
│  [Logo] SD.Next                          [_ □ ×]    │
│          launcher                                   │
├─────────────────────────────────────────────────────┤
│  Status Chips:                                      │
│  [Version: v2024.03.06 (abc1234)]                   │
│  [Status: Idle]                                     │
│  [Environment: Python 3.13.12, Git 2.53.0, RTX 4090]│
├─────────────────────────────────────────────────────┤
│  Main Buttons (4 buttons in row):                   │
│  [Bootstrap] [Install] [Start] [Stop]               │
├─────────────────────────────────────────────────────┤
│  ▼ Advanced Options                                 │
│    ☐ Auto-launch  ☐ Upgrade  ☐ Reinstall           │
│    Compute Backend: [CUDA ▼]  Branch: [dev ▼]      │
│    Installation Path: [________________] [Browse]   │
│    Models Path: [________________] [Browse]         │
│    Custom Parameters: [________________________]    │
│    Custom Environment: [________________________]   │
│    [Wipe Installation] [Wipe Binary] [Wipe Venv]    │
│    ☐ Public (network access)                        │
│    ☐ Debug Mode                                     │
├─────────────────────────────────────────────────────┤
│  Tabs: [Terminal] [Docs] [Changelog]               │
│  ┌───────────────────────────────────────────────┐ │
│  │ Terminal Content Area                         │ │
│  │ (xterm.js with ANSI colors, scrollback)       │ │
│  │                                               │ │
│  │ [Copy] [Download] [Clear]                     │ │
│  └───────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────┤
│  Progress Bar (visible during bootstrap)            │
│  [████████░░░░░░░░░░] 45% - Extracting Git...       │
└─────────────────────────────────────────────────────┘
```

#### Button States (Enable/Disable Logic)

**Bootstrap Button**:
- Enabled: Tools NOT available AND no operation in progress
- Disabled: Tools available OR operation in progress
- Label: "Bootstrap"

**Install Button**:
- Enabled: Tools available AND NOT installed AND no operation in progress
- Disabled: Tools not available OR already installed OR operation in progress
- Label: "Install"

**Start Button**:
- Enabled: Installed AND no operation in progress
- Disabled: Not installed OR operation in progress
- Label: "Start"

**Stop Button**:
- Enabled: Operation in progress (installing or running)
- Disabled: No operation in progress
- Label: "Stop"

**Operation Lock**:
- Only ONE operation (bootstrap, install, start) can run at a time
- Lock acquired at operation start in try block
- Lock released in finally block (guaranteed cleanup)
- Stop operation clears lock

#### Theme Support

**Auto-Detection**:
```typescript
// Detect system theme
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

// CSS variables in :root and [data-theme="dark"]
:root {
  --bg-primary: #f5f5f5;
  --text-primary: #1a1a1a;
  --surface: #ffffff;
  --accent: #646cff;
}

[data-theme="dark"] {
  --bg-primary: #1a1a1a;
  --text-primary: #f5f5f5;
  --surface: #2a2a2a;
  --accent: #847bff;
}
```

**Dynamic Switching**:
- Listen to `prefersDark.addEventListener('change')`
- Update `document.documentElement.dataset.theme`
- xterm.js theme updated on change

#### Tabs

**Terminal Tab**:
- Embedded xterm.js terminal
- Copy/Download/Clear buttons below terminal
- Lazy-loaded (only create xterm when tab active)

**Docs Tab**:
- Iframe pointing to `https://github.com/vladmandic/sdnext/wiki`
- Full-height iframe with no border
- Fallback message if offline

**Changelog Tab**:
- Fetch from GitHub API: `https://api.github.com/repos/vladmandic/sdnext/releases`
- Display release notes with markdown rendering
- **Security**: Use `dangerouslySetInnerHTML` (⚠️ recommend DOMPurify for production)
- Cache fetched data, refresh on demand

#### System Tray Integration

**Tray Icon**: Use `logo.png` as tray icon

**Context Menu**:
- **Show/Hide**: Toggle window visibility
- **Status**: Display current status (Idle, Installing, Running)
- **Exit**: Quit application (cleanup all processes)

**Behavior**:
- Close button minimizes to tray (doesn't quit)
- Right-click tray shows menu
- Status updates reflected in menu

---

## 4. IPC Communication Architecture

### Type-Safe IPC Channels

**Definition** (`src/shared/ipc-types.ts`):

```typescript
export const IPC_CHANNELS = {
  // Invoke handlers (bidirectional request/response)
  START_BOOTSTRAP: 'launcher:start-bootstrap',
  GET_STARTUP_STATE: 'launcher:get-startup-state',
  LOAD_CONFIG: 'launcher:load-config',
  SAVE_CONFIG: 'launcher:save-config',
  BROWSE_DIRECTORY: 'launcher:browse-directory',
  INSTALL: 'launcher:install',
  START: 'launcher:start',
  STOP: 'launcher:stop',
  EXIT: 'launcher:exit',
  WIPE_PATH: 'launcher:wipe-path',
  GET_VERSION_INFO: 'launcher:get-version-info',

  // Event channels (one-way main -> renderer)
  TERMINAL: 'launcher:terminal',
  STATUS: 'launcher:status',
  VERSION_UPDATE: 'launcher:version-update',
  TOOLS_UPDATE: 'launcher:tools-update',
  GPU_UPDATE: 'launcher:gpu-update',
  EXTRACTION_PROGRESS: 'launcher:extraction-progress',
} as const;

// Type mappings for invoke handlers
export interface IpcInvokeChannels {
  'launcher:start-bootstrap': {
    params: void;
    return: { success: boolean; message?: string };
  };
  'launcher:get-startup-state': {
    params: void;
    return: StartupState;
  };
  'launcher:install': {
    params: {
      config: SdNextConfig;
      options: InstallOptions;
      terminalDimensions?: TerminalDimensions;
    };
    return: { success: boolean; code: number };
  };
  // ... (see src/shared/ipc-types.ts for complete definitions)
}
```

### Preload Script Pattern

**Security Requirements**:
- NO direct Node.js API exposure to renderer
- Use `contextBridge.exposeInMainWorld` exclusively
- Validate all inputs in main process
- Return sanitized outputs

**Example** (`src/preload/preload.ts`):

```typescript
import { contextBridge, ipcRenderer } from 'electron';
import type { SdNextConfig, StartupState } from '../shared/types';

contextBridge.exposeInMainWorld('sdnext', {
  // Invoke methods
  startBootstrap: () => ipcRenderer.invoke('launcher:start-bootstrap'),
  getStartupState: () => ipcRenderer.invoke('launcher:get-startup-state'),
  loadConfig: () => ipcRenderer.invoke('launcher:load-config'),
  saveConfig: (config: SdNextConfig) => ipcRenderer.invoke('launcher:save-config', config),
  install: (config, options, dims) => ipcRenderer.invoke('launcher:install', { config, options, terminalDimensions: dims }),
  start: (config, dims) => ipcRenderer.invoke('launcher:start', { config, terminalDimensions: dims }),
  stop: () => ipcRenderer.invoke('launcher:stop'),

  // Event listeners
  onTerminalOutput: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('launcher:terminal', handler);
    return () => ipcRenderer.removeListener('launcher:terminal', handler);
  },
  onStatus: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on('launcher:status', handler);
    return () => ipcRenderer.removeListener('launcher:status', handler);
  },
  // ... other event listeners
});
```

**Usage in Renderer**:
```typescript
// TypeScript knows the API shape
const state = await window.sdnext.getStartupState();
const cleanup = window.sdnext.onTerminalOutput((data) => {
  console.log(data.text);
});
// Call cleanup() to remove listener
```

---

## 5. State Management & Error Handling

### Operation Lock Pattern

**Purpose**: Prevent concurrent install/start/bootstrap operations

**Implementation**:
```typescript
let operationInProgress: 'bootstrap' | 'install' | 'start' | null = null;

ipcMain.handle('launcher:install', async (_event, { config, options, terminalDimensions }) => {
  // Check lock
  if (operationInProgress) {
    return { success: false, code: -1 };
  }

  try {
    operationInProgress = 'install';
    setStatus('Installing...');
    
    const code = await runInstallWorkflow(
      runner,
      config,
      options,
      emitTerminal,
      setStatus,
      terminalDimensions
    );
    
    return { success: code === 0, code };
  } catch (err) {
    emitTerminal(`[error] ${err.message}\n`, true);
    setStatus(`Error: ${err.message}`);
    return { success: false, code: -1 };
  } finally {
    // CRITICAL: Always clear lock in finally
    operationInProgress = null;
    if (status !== 'Running...') {
      setStatus('Idle');
    }
  }
});
```

**Key Points**:
- Check lock before operation
- Set lock in try block
- Clear lock in finally block (guaranteed cleanup)
- Status reset in finally unless transitioning to Running

### Global Error Handlers

**Main Process** (`src/main/main.ts`):

```typescript
// Catch unhandled exceptions
process.on('uncaughtException', (error) => {
  console.error('[fatal] Uncaught exception:', error);
  // Log to file, show dialog, etc.
  // Don't call process.exit() immediately - allow cleanup
});

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('[fatal] Unhandled promise rejection:', reason);
  // Log rejection with stack trace
});

// Cleanup on exit
app.on('before-quit', async (event) => {
  event.preventDefault();
  await stopActiveOperation();
  app.exit(0);
});
```

### React Error Boundary

**Purpose**: Graceful UI degradation on component crashes

**Implementation** (`src/renderer/components/ErrorBoundary.tsx`):

```typescript
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Component error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h2>Something went wrong</h2>
          <p>{this.state.error?.message}</p>
          <button onClick={() => window.location.reload()}>
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

**Usage**:
```typescript
// src/renderer/main.tsx
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
```

### Timer Lifecycle Management

**CRITICAL**: All timers/intervals must be cleaned up

**Pattern for setTimeout**:
```typescript
class ProcessRunner {
  private timeoutHandle: NodeJS.Timeout | null = null;

  async run(cmd: string, timeout?: number): Promise<number> {
    try {
      const ptyProcess = spawn(cmd, { /* ... */ });

      if (timeout) {
        this.timeoutHandle = setTimeout(() => {
          this.kill();
        }, timeout);
      }

      return await new Promise((resolve) => {
        ptyProcess.onExit(({ exitCode }) => {
          if (this.timeoutHandle) {
            clearTimeout(this.timeoutHandle);
            this.timeoutHandle = null;
          }
          resolve(exitCode);
        });
      });
    } catch (err) {
      // CRITICAL: Clear timeout on error
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle);
        this.timeoutHandle = null;
      }
      throw err;
    }
  }

  stop(): void {
    // CRITICAL: Clear timeout BEFORE killing process
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
    if (this.activeProcess) {
      kill(this.activeProcess.pid);
    }
  }
}
```

**Pattern for setInterval** (React):
```typescript
useEffect(() => {
  const intervalId = setInterval(() => {
    performCheck();
  }, 1000);

  // CRITICAL: Return cleanup function
  return () => {
    clearInterval(intervalId);
  };
}, [dependencies]);
```

### Async Safety

**NO Busy-Wait Loops**:
```typescript
// ❌ WRONG: Blocks event loop
while (Date.now() - start < waitMs) {
  // busy-wait
}

// ✅ CORRECT: Async delay
async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryWithDelay() {
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (err) {
      await delay(1000 * Math.pow(2, i)); // Exponential backoff
    }
  }
}
```

### Promise Deduplication

**Purpose**: Prevent race conditions from concurrent calls

**Pattern**:
```typescript
interface VersionCheckRef {
  lastKey: string;
  lastResult: VersionInfo | null;
  checkedAt: number;
  inFlightPromise: Promise<VersionInfo> | null;
}

const versionCheckRef = useRef<VersionCheckRef>({
  lastKey: '',
  lastResult: null,
  checkedAt: 0,
  inFlightPromise: null,
});

async function fetchVersionInfo(): Promise<VersionInfo> {
  const key = config.installationPath + config.repositoryBranch;
  
  // Dedupe by key
  if (versionCheckRef.current.lastKey === key) {
    const age = Date.now() - versionCheckRef.current.checkedAt;
    if (age < VERSION_CHECK_DEDUPE_MS) {
      return versionCheckRef.current.lastResult!;
    }
    
    // If in-flight, await existing promise
    if (versionCheckRef.current.inFlightPromise) {
      return await versionCheckRef.current.inFlightPromise;
    }
  }

  // Create new request
  const promise = window.sdnext.getVersionInfo(config);
  versionCheckRef.current.inFlightPromise = promise;
  versionCheckRef.current.lastKey = key;

  try {
    const result = await promise;
    versionCheckRef.current.lastResult = result;
    versionCheckRef.current.checkedAt = Date.now();
    return result;
  } finally {
    versionCheckRef.current.inFlightPromise = null;
  }
}
```

---

## 6. File Structure

```
sdnext-exe/
├── package.json                    # Dependencies, scripts, electron-builder config
├── tsconfig.json                   # Base TypeScript config
├── tsconfig.electron.json          # Main process TS config (CommonJS)
├── tsconfig.renderer.json          # Renderer TS config (ESNext)
├── vite.config.ts                  # Vite build config
├── eslint.config.mjs               # ESLint config (flat config)
├── index.html                      # Renderer entry HTML
├── sdnext.json                     # User config (created at runtime)
├── README.md                       # Project documentation
├── TASK.md                         # Requirements summary
├── PLAN.md                         # Implementation plan
├── STATUS.md                       # Project status
├── TESTING.md                      # Test plan and results
├── VERIFICATION.md                 # Requirements verification
│
├── portable/                       # Bundled runtime zips
│   ├── nuget-git-2.53.0.zip        # Portable Git (bundle in exe)
│   └── python-3.13.12.zip          # Portable Python (bundle in exe)
│
├── public/                         # Static assets
│   ├── logo.png                    # Window/tray icon
│   └── sdnext.png                  # App logo image
│
├── src/
│   ├── shared/                     # Shared types (main + renderer)
│   │   ├── types.ts                # Core type definitions
│   │   └── ipc-types.ts            # IPC channel contracts
│   │
│   ├── main/                       # Main process (Node.js)
│   │   ├── main.ts                 # Entry point, window management
│   │   ├── ipc.ts                  # IPC handler registration
│   │   └── services/               # Service layer (17 services)
│   │       ├── portable-bootstrap.ts
│   │       ├── runtime-paths.ts
│   │       ├── tool-version-service.ts
│   │       ├── version-service.ts
│   │       ├── config-service.ts
│   │       ├── process-runner.ts
│   │       ├── process-termination.ts
│   │       ├── venv-service.ts
│   │       ├── install-workflow.ts
│   │       ├── start-workflow.ts
│   │       ├── logger-service.ts
│   │       ├── checkpoint-service.ts
│   │       ├── sandbox-test-service.ts
│   │       ├── gpu-detection.ts
│   │       ├── workflow-common.ts
│   │       ├── promise-utils.ts
│   │       └── debug.ts
│   │
│   ├── preload/                    # Preload script
│   │   └── preload.ts              # contextBridge API exposure
│   │
│   └── renderer/                   # Renderer process (React)
│       ├── main.tsx                # React entry point
│       ├── App.tsx                 # Main component (1000+ lines)
│       ├── global.d.ts             # TypeScript globals (window.sdnext)
│       ├── components/             # React components
│       │   ├── ErrorBoundary.tsx
│       │   ├── LazyTerminalPanel.tsx
│       │   └── ProgressBar.tsx
│       ├── hooks/                  # Custom React hooks
│       │   └── useDebounce.ts
│       └── styles/                 # CSS files
│           └── app.css             # Main stylesheet
│
└── dist/                           # Build output (gitignored)
    ├── index.html                  # Built renderer HTML
    ├── assets/                     # Renderer assets (JS, CSS)
    ├── electron/                   # Compiled main/preload
    │   ├── main/
    │   │   ├── main.js
    │   │   └── services/*.js
    │   └── preload/
    │       └── preload.js
    └── SD.Next-0.1.0.exe           # Final packaged executable
```

---

## 7. Build & Distribution

### Build Scripts

```json
{
  "scripts": {
    "dev": "concurrently -k \"npm:dev:renderer\" \"npm:dev:electron:build\" \"npm:dev:electron\"",
    "dev:renderer": "vite",
    "dev:electron:build": "tsc -p tsconfig.electron.json -w",
    "dev:electron": "wait-on tcp:5173 file:dist/electron/main/main.js && electron . -- --debug",
    
    "build": "npm run build:renderer && npm run build:electron",
    "build:renderer": "vite build",
    "build:electron": "tsc -p tsconfig.electron.json",
    
    "typecheck": "tsc -p tsconfig.electron.json --noEmit && tsc -p tsconfig.renderer.json --noEmit",
    "lint": "npm run lint:ts && npm run lint:css",
    
    "package": "npm run build && electron-builder --win portable",
    "package:dir": "npm run build && electron-builder --win --dir && node scripts/zip-dir.js"  
    "publish": "npm run package && npm run package:dir && gh release create v${npm_package_version} dist/${npm_package_name}-${npm_package_version}.exe dist/${npm_package_name}-${npm_package_version}.zip --title \"SD.Next ${npm_package_version}\" --notes \"Release ${npm_package_version}\""  
  }
}
```

The `publish` script leverages the GitHub CLI (`gh`) once packaging is complete. Before building it bumps the patch version using `npm version patch`, updating `package.json` (and creating a git commit/tag). It then runs both `package` (installer) and `package:dir` (unzipped/zip) builds, and creates a **prerelease** named `v<version>` attaching the portable `SD.Next.exe` and the generated zip archive. Ensure `gh` is logged in and you have push rights to the repository.

### electron-builder Configuration

```json
{
  "build": {
    "appId": "com.vladmandic.sdnext",
    "productName": "SD.Next",
    "directories": {
      "output": "dist",
      "buildResources": "public"
    },
    "files": [
      "dist/**/*",
      "package.json"
    ],
    "asarUnpack": [
      "*.zip",
      "node_modules/node-pty/**/*"
    ],
    "extraResources": [
      {
        "from": "portable",
        "to": "portable",
        "filter": ["*.zip"]
      },
      {
        "from": "public/logo.png",
        "to": "logo.png"
      },
      {
        "from": "public/sdnext.png",
        "to": "sdnext.png"
      }
    ],
    "win": {
      "target": [{
        "target": "portable",
        "arch": ["x64"]
      }]
    },
    "portable": {
      "artifactName": "SD.Next-${version}.exe"
    }
  }
}
```

**Key Points**:
- `asarUnpack`: node-pty native module must be unpacked (not in asar)
- `extraResources`: Bundled zips and images go in resources folder
- Portable target: Single .exe, no installer
- Output: `dist/SD.Next-0.1.0.exe` (~150-250 MB)

### Vite Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
  server: {
    port: 5173,
  },
  optimizeDeps: {
    exclude: ['sdnext', 'portable'], // Don't scan bundled folders
  },
});
```

---

## 8. Security Requirements

### Content Security Policy

**index.html**:
```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.github.com https://github.com;"
/>
```

**Notes**:
- `unsafe-inline`, `unsafe-eval` required for Vite dev mode
- Production: Consider stricter CSP
- Allow GitHub API for changelog fetching

### Preload Isolation

- **MUST** use `contextBridge.exposeInMainWorld`
- **NEVER** expose Node.js modules directly
- **VALIDATE** all inputs in main process
- **SANITIZE** all outputs from main process

### Input Validation

**Branded Types** for validation:
```typescript
export type ValidatedPath = string & { readonly __brand: 'ValidatedPath' };

export function validatePath(path: string): ValidatedPath {
  if (!path || !/^[a-zA-Z]:\\/.test(path)) {
    throw new Error('Invalid absolute path');
  }
  return path as ValidatedPath;
}
```

**Environment Variables**:
```typescript
export type ValidatedEnvVarName = string & { readonly __brand: 'ValidatedEnvVarName' };

export function validateEnvVarName(name: string): ValidatedEnvVarName {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid environment variable name: ${name}`);
  }
  return name as ValidatedEnvVarName;
}
```

**Zod Schema Validation**:
```typescript
const configSchema = z.object({
  autoLaunch: z.boolean(),
  backend: z.enum(['autodetect', 'cuda', 'rocm', 'zluda', 'directml', 'ipex', 'openvino']),
  installationPath: z.string().min(1),
  // ... all fields
});

export function loadConfig(): SdNextConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return configSchema.parse(raw);
  } catch (err) {
    console.error('Config validation failed:', err);
    return getDefaultConfig();
  }
}
```

### XSS Protection

**⚠️ High Priority Issue**: Changelog rendering uses `dangerouslySetInnerHTML`

**Current**:
```tsx
<div dangerouslySetInnerHTML={{ __html: changelogHtml }} />
```

**Recommended**:
```typescript
import DOMPurify from 'dompurify';

const sanitized = DOMPurify.sanitize(changelogHtml, {
  ALLOWED_TAGS: ['p', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'code', 'pre'],
  ALLOWED_ATTR: ['href', 'target'],
});

<div dangerouslySetInnerHTML={{ __html: sanitized }} />
```

---

## 9. Testing Requirements

### Automated Tests (Code Quality)

**TypeScript Type-Checking**:
```bash
npm run typecheck
# Must pass with 0 errors
```

**ESLint**:
```bash
npm run lint:ts
# Must pass with 0 errors, 0 warnings
```

**Stylelint**:
```bash
npm run lint:css
# Must pass with 0 errors, 0 warnings
```

**Build Verification**:
```bash
npm run build
# Must complete successfully, generate all artifacts
```

### Manual Runtime Tests

**51 Test Cases** across 11 categories:

1. **Bootstrap Tests** (3 tests)
   - First-run extraction
   - Progress bar accuracy
   - Caching (no re-extract on second run)

2. **Configuration Tests** (1 test)
   - Save/load persistence

3. **Installation Tests** (10 tests)
   - Basic install (dev branch, CUDA)
   - All backends (ROCm, DirectML, etc.)
   - Upgrade/reinstall flags
   - Custom paths/parameters/environment
   - Wipe operations
   - Checkpoint recovery after error

4. **Start/Launch Tests** (5 tests)
   - Basic start
   - Auto-launch
   - Branch switching
   - Custom parameters

5. **Process Management Tests** (4 tests)
   - Stop during install
   - Stop during run
   - Clean exit (no orphans)
   - Process tree termination

6. **Terminal Tests** (6 tests)
   - Real-time output
   - ANSI color rendering
   - Copy/download/clear functions
   - Scrollback

7. **UI/Theme Tests** (5 tests)
   - Light/dark auto-switch
   - Resize behavior
   - Button states
   - Tray integration

8. **Error Handling Tests** (3 tests)
   - Network errors
   - Invalid paths
   - Disk space errors

9. **Path Tests** (3 tests)
   - Custom installation paths
   - Long paths (>260 chars)
   - Non-ASCII characters

10. **Button Logic Tests** (4 tests)
    - Bootstrap enable/disable
    - Install enable/disable
    - Start enable/disable
    - Stop enable/disable

11. **UI/UX Tests** (3 tests)
    - Confirmation modals
    - Version panel display
    - Public checkbox functionality

**Success Criteria**: 95%+ pass rate, no critical failures

---

## 10. Performance Requirements

### Startup Time
- **Target**: <3 seconds from exe launch to UI ready
- **Measurement**: `performance.now()` at entry points

### Build Time
- **Development build**: <5 seconds
- **Production build**: <30 seconds
- **Package exe**: <2 minutes

### Memory Usage
- **Idle**: <100 MB RAM
- **Installing**: <300 MB RAM
- **Running**: <200 MB RAM (app not counted)

### Bundle Size
- **Renderer bundle**: <500 KB gzipped
- **Total exe size**: 150-250 MB (with bundled runtimes)

### Optimizations

**Code Splitting**:
- Lazy-load terminal component
- Lazy-load changelog fetcher
- Dynamic imports for rarely-used features

**Debouncing**:
- Config saves: 300ms debounce
- Version checks: 2000ms deduplication
- Background checks: 2000ms deduplication

---

## 11. Platform-Specific Requirements

### Windows 10/11 64-bit Only

**PowerShell Usage**:
- Git operations: Use bundled git.exe, NOT system git
- Process termination: `taskkill /T /F /PID <pid>`
- GPU detection: `Get-CimInstance Win32_VideoController`

**Path Handling**:
- Always use backslashes: `path.join()` or `path.resolve()`
- Support long paths (>260 chars) with `\\?\` prefix if needed
- Handle drive letters: `C:\`, `D:\`, etc.

**PTY Configuration** (Windows ConPTY):
```typescript
const ptyProcess = spawn(cmd, args, {
  name: 'xterm-256color',
  cols: dimensions?.cols || 80,
  rows: dimensions?.rows || 24,
  cwd: options.cwd,
  env: options.env,
  useConpty: true,  // Enable Windows ConPTY
  conptyInheritCursor: true,
});
```

**File Operations**:
- Atomic writes: write to temp, rename
- Use `fs.rmSync()` with `{ recursive: true, force: true }`
- Handle file locks (app running during wipe)

---

## 12. Debug Mode

**Activation**: Launch with `--debug` flag

**Features When Enabled**:
1. **DevTools**: Open automatically on startup
2. **Verbose Logging**: All `debugLog()` calls printed to console
3. **Performance Timing**: Log operation durations
4. **IPC Logging**: Log all IPC calls with payloads
5. **No Minification**: Source maps available

**Implementation**:
```typescript
// Check for --debug flag
const isDebugMode = process.argv.includes('--debug');

// Conditional DevTools
if (isDebugMode) {
  mainWindow.webContents.openDevTools();
}

// Debug logger service
export function debugLog(category: string, message: string, data?: any): void {
  if (!isDebugMode) return;
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${category}] ${message}`, data || '');
}
```

---

## 13. Known Issues & Future Improvements

### High Priority (Recommended Before Production)
1. **Add DOMPurify** for changelog HTML sanitization (XSS risk)
2. **Create `.nvmrc`** file for Node.js version consistency (22.x)
3. **Review dependency updates**: Electron 38→40, ESLint 9→10, Zod 3→4, xterm 5→6

### Medium Priority
4. **React error boundaries**: Already implemented, tested
5. **Extract magic numbers**: Retry counts, timeouts, buffer sizes
6. **Improve JSDoc coverage**: Especially for service APIs

### Low Priority
7. **Code splitting**: Further optimize bundle size (~5-10% gain)
8. **Unit tests**: Service layer test coverage (intentionally deferred)
9. **E2E tests**: Playwright automation (intentionally deferred)
10. **CI/CD**: Automated builds, dependency audits

---

## 14. Code Quality Standards

### TypeScript
- **Strict mode**: MUST be enabled
- **No `any` types**: Use `unknown` with type guards
- **Branded types**: For validated inputs (paths, env vars)
- **Explicit return types**: On all public functions
- **No `ts-ignore`**: Fix issues properly

### Linting
- **ESLint**: Flat config, TypeScript/React plugins
- **Stylelint**: Standard CSS config
- **0 Warnings**: All warnings must be fixed
- **Consistent formatting**: Use Prettier or similar

### Error Handling
- **Try/catch/finally**: For all async operations
- **Finally blocks**: MUST cleanup resources (locks, timers)
- **Error messages**: User-friendly + technical context
- **Logging**: All errors logged with stack traces

### Resource Management
- **Timers**: Always cleanup in finally/useEffect cleanup
- **Promises**: Deduplicate concurrent calls
- **File handles**: Close after use
- **Child processes**: Kill on exit, clear timeouts

---

## 15. Summary Checklist

**Must-Have Features**:
- ✅ Bootstrap workflow (extract bundled git/python zips)
- ✅ Installation workflow (5-step state machine with checkpoints)
- ✅ Start/launch workflow (venv validation, branch switching)
- ✅ Process management (PTY-based with ConPTY, taskkill cleanup)
- ✅ Configuration persistence (Zod validation, atomic writes)
- ✅ GPU detection (WMI query, backend recommendation)
- ✅ Terminal integration (xterm.js with ANSI colors)
- ✅ Tabbed interface (Terminal, Docs, Changelog)
- ✅ Theme support (auto light/dark detection)
- ✅ System tray (status updates, show/hide/exit)
- ✅ Error handling (global handlers, ErrorBoundary)
- ✅ Operation locks (prevent concurrent operations)
- ✅ Timer cleanup (all timers cleared properly)

**Code Quality Achievements**:
- ✅ TypeScript: 0 errors
- ✅ ESLint: 0 errors, 0 warnings
- ✅ Stylelint: 0 errors, 0 warnings
- ✅ Build: Successful production builds
- ✅ 12 bugs fixed across 7 validation rounds
- ✅ Enterprise-grade resource management
- ✅ Comprehensive error handling

**Distribution**:
- ✅ Portable .exe (150-250 MB with bundled runtimes)
- ✅ Bundled git.zip and python.zip in resources
- ✅ No external dependencies required
- ✅ Single-file distribution model

---

## 16. Implementation Timeline Estimate

For an AI model or developer implementing from scratch:

**Phase 1: Foundation** (2-3 days)
- Electron + React + TypeScript setup
- IPC architecture and type-safe contracts
- Basic window management and preload script

**Phase 2: Service Layer** (4-5 days)
- All 17 services implementation
- Bootstrap workflow
- Process runner with PTY support

**Phase 3: Workflows** (3-4 days)
- Installation state machine
- Start/launch workflow
- Checkpoint recovery system

**Phase 4: UI/UX** (3-4 days)
- React components
- Terminal integration
- Tabbed interface
- Theme support

**Phase 5: Polish** (2-3 days)
- System tray
- GPU detection
- Error handling
- Testing and bug fixes

**Total**: 14-19 days (assuming full-time work)

---

## Appendix A: Key Algorithms

### Git Clone with Retry and Exponential Backoff

```typescript
async function runGitWithRetry(
  args: string[],
  onOutput: (text: string) => void,
  maxRetries: number = 3
): Promise<void> {
  const initialWaitMs = 1000;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = runGit(args);
      if (result.success) return;
      
      if (attempt < maxRetries - 1) {
        const waitMs = initialWaitMs * Math.pow(2, attempt);
        onOutput(`[git] Retry ${attempt + 1}/${maxRetries} in ${waitMs}ms...\n`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
    } catch (err) {
      if (attempt === maxRetries - 1) throw err;
    }
  }
  
  throw new Error(`Git operation failed after ${maxRetries} attempts`);
}
```

### Checkpoint-Based Recovery

```typescript
interface Checkpoint {
  installationPath: string;
  createdAt: number;
  lastError: string | null;
  completedSteps: string[];
}

function isStepCompleted(checkpoint: Checkpoint, step: string): boolean {
  return checkpoint.completedSteps.includes(step);
}

function markStepCompleted(checkpoint: Checkpoint, step: string): Checkpoint {
  if (!checkpoint.completedSteps.includes(step)) {
    checkpoint.completedSteps.push(step);
    saveCheckpoint(checkpoint);
  }
  return checkpoint;
}
```

### Terminal Output Normalization

```typescript
function normalizeTerminalChunk(text: string): string {
  // Preserve ANSI sequences, normalize line endings
  return text
    .replace(/\r\n/g, '\n')  // Windows CRLF → LF
    .replace(/\r/g, '');      // Bare CR → empty (in-place rewrite)
}

function appendTerminalChunk(prev: string[], chunk: string): string[] {
  if (!chunk) return prev;
  
  // Split into lines, preserve incomplete last line
  const lines = [...prev];
  const newLines = chunk.split('\n');
  
  if (lines.length > 0) {
    lines[lines.length - 1] += newLines[0];
    lines.push(...newLines.slice(1));
  } else {
    lines.push(...newLines);
  }
  
  return lines;
}
```

---

## Appendix B: Environment Variables Reference

**Global Environment Variables** (set for all operations):
- `FORCE_COLOR=1` - Enable ANSI color output in Python
- `PYTHONUNBUFFERED=1` - Disable Python output buffering
- `TTY_COMPATIBLE=1` - Signal PTY mode to applications
- `PATH` - Includes bundled git/python bin directories

**Optional Environment Variables**:
- `PIP_INDEX_URL` - Custom PyPI mirror URL
- `PIP_TRUSTED_HOST` - Trusted hosts for pip
- User-defined via Custom Environment field (KEY=VALUE pairs)

**Parsing Custom Environment**:
```typescript
function parseCustomEnvironment(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  const lines = text.split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) {
      const key = match[1];
      let value = match[2].trim();
      
      // Handle quoted values: VAR="value with spaces"
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      env[key] = value;
    }
  }
  
  return env;
}
```

---

**END OF REQUIREMENTS DOCUMENT**

This document provides a complete specification for building an Electron-based installer/launcher application. An AI model or developer should be able to implement a fully-functional equivalent application using this specification.
