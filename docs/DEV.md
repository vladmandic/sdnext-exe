# SD.Next Installer/Launcher - Developer Guide

**Last Updated**: March 6, 2026

This document contains technical information for developers working on the SD.Next Installer/Launcher application.

## March 6, 2026 - Codebase Status

### Quality Metrics ✅
- **TypeScript**: 0 compilation errors
- **ESLint**: 0 warnings, 0 errors
- **Stylelint**: 0 warnings, 0 errors
- **Build**: Production artifacts generated successfully
- **Requirements**: 130/130 met (100% TASK compliance)

### Development Recommendations

#### Priority Action Items
See [VERIFICATION.md](VERIFICATION.md) for comprehensive analysis. Key items:

1. **Add HTML Sanitization** (Security)
   ```bash
   npm install dompurify @types/dompurify
   ```
   Update [App.tsx](src/renderer/App.tsx) changelog rendering to sanitize HTML before using `dangerouslySetInnerHTML`.

2. **Create `.nvmrc` File** (Consistency)
   ```bash
   echo "22" > .nvmrc
   ```
   Ensures all developers use Node.js 22.x (matches Electron 38's embedded Node.js).

3. **Review Dependency Updates** (Security & Features)
   ```bash
   npm outdated
   ```
   Test major version updates:
   - Electron: 38.8.4 → 40.8.0
   - ESLint: 9.39.3 → 10.0.2
   - Zod: 3.25.76 → 4.3.6
   - xterm: 5.5.0 → 6.0.0

4. **Add React Error Boundaries** (Robustness)
   Create error boundary components around major UI sections for graceful degradation.

#### Code Quality Improvements
- Extract magic numbers to named constants (retry counts, timeouts, buffer sizes)
- Improve JSDoc coverage for public service methods
- Replace `any` types with `unknown` + type guards
- Centralize path construction logic to avoid duplication

#### Performance Optimizations
- Implement code splitting for rarely-used features (wipe operations)
- Lazy load changelog fetcher until Changelog tab opened
- Make terminal scrollback buffer size configurable

---

## Overview

The SD.Next Installer/Launcher is a Windows-only Electron desktop application that provides a user-friendly interface for installing and running [SD.Next](https://github.com/vladmandic/sdnext). The application bundles Python 3.13 and Git 2.53 as portable zips, eliminating system dependencies.

**Key Architecture**: Electron main process (Node.js) + React UI (renderer) + IPC communication bridge, with PowerShell workflows for system operations.

## Technology Stack

### Core Framework
- **Electron 38.8** — Desktop framework with Chromium 132 and Node.js 22
  - Main process handles system integrations (file I/O, process management, IPC)
  - Renderer process runs the React UI in Chromium sandbox
  - Context isolation + preload script for secure IPC

- **React 19.2** — UI rendering with automatic JSX transform
  - Hooks-based component architecture (useState, useEffect, useCallback, useMemo, useRef)
  - Functional components throughout
  - Real-time state updates from IPC events

- **TypeScript 5.9** — Type-safe development
  - Strict mode enabled across all configurations
  - Separate tsconfig for main, renderer, and preload processes
  - Type definitions shared via `src/shared/types.ts`

### Build & Development Tools
- **Vite 7.3** — Frontend build tool for React UI
  - Fast HMR (hot module replacement) in development
  - Optimized production bundles with code splitting
  - Configured dependency optimization to exclude build artifacts

- **electron-builder 25** — Packaging for portable Windows exe
  - Single exe distribution with bundled runtime zips
  - Code signing support (when configured)
  - Asset management for resources

- **ESLint 9** + **Stylelint 17** — Code quality enforcement
  - TypeScript/React plugin for linting
  - CSS/SCSS style validation
  - Pre-commit checks recommended

### Terminal & UI
- **xterm.js 5.3** — Terminal emulation for streaming output
  - ANSI color support
  - Copy/paste functionality
  - Scrollback buffer (10,000 lines)
  - PTY integration via `node-pty`

- **Lucide React 0.577** — Icon library
  - AlertTriangle, Trash2, Power, Square, etc.
  - Consistent icon sizing and styling

- **Zod 3.24** — Runtime type validation
  - Schema-based config validation
  - Error messages for invalid configurations

## Project Structure

```
.
├── src/                             # TypeScript source
│   ├── main/                        # Electron main process
│   │   ├── main.ts                 # Window creation, app lifecycle
│   │   ├── ipc.ts                  # IPC handler registration
│   │   └── services/               # Business logic
│   │       ├── config-service.ts   # Read/write sdnext.json with validation
│   │       ├── runtime-paths.ts    # Bundled tool path resolution
│   │       ├── version-service.ts  # Git-based version detection
│   │       ├── process-runner.ts   # Spawn and manage child processes
│   │       ├── process-termination.ts  # Force-kill process trees
│   │       ├── venv-service.ts     # Python virtual environment management
│   │       ├── portable-bootstrap.ts   # Extract bundled zips
│   │       ├── install-workflow.ts # Installation state machine
│   │       └── start-workflow.ts   # Launch state machine
│   │
│   ├── preload/                     # IPC bridge (context-isolated)
│   │   └── preload.ts              # Safely expose main → renderer API
│   │
│   ├── renderer/                    # React UI
│   │   ├── App.tsx                 # Main component & state coordination
│   │   ├── main.tsx                # React/Vite entry point
│   │   ├── global.d.ts             # Window API type definitions
│   │   ├── components/
│   │   │   └── TerminalPanel.tsx   # xterm.js wrapper
│   │   └── styles/
│   │       └── app.css             # Neumorphic design, responsive layout
│   │
│   └── shared/                      # Shared contracts
│       └── types.ts                # TypeScript interfaces for IPC, config
│
├── dist/                            # Built output (generated post-build)
│   ├── index.html                  # Renderer entry
│   ├── assets/                     # Bundled JS/CSS
│   └── electron/                   # Compiled main + preload
│
├── portable/                        # Bundled runtime zips (source)
│   ├── nuget-git-2.53.0.zip       # Git portable
│   └── python-3.13.12.zip         # Python portable
│
├── public/                          # Static assets
│   ├── logo.png                    # Window icon
│   └── sdnext.png                  # Top-left branding logo
│
├── vite.config.ts                  # Vite configuration
├── tsconfig.json                   # Base TypeScript config
├── tsconfig.base.json              # Shared TS settings
├── tsconfig.main.ts                # Main process TypeScript
├── tsconfig.renderer.json          # Renderer process TypeScript
├── tsconfig.electron.json          # Electron compilation config
├── eslint.config.mjs               # ESLint rules
├── package.json                    # Dependencies and scripts
└── electron-builder-config.json    # Packaging configuration
```

## Configuration Management

### sdnext.json Format

Persisted user configuration (location: same directory as executable):

```typescript
interface SdNextConfig {
  autoLaunch: boolean;              // Auto-launch SD.Next after install
  repositoryBranch: "master" | "dev";
  installationPath: string;         // Where SD.Next is installed
  modelsPath: string;               // Where model files go
  computeBackend: string;           // GPU backend selection
  customParameters: string;         // Extra launch parameters
  customEnvironment: string;        // Environment variable overrides
  upgrade: boolean;                 // Force upgrade on next install
  reinstall: boolean;               // Force clean install
  wipe: boolean;                    // Delete and reinstall
  public: boolean;                  // Enable --listen for network access
}
```

### Runtime Paths

- **Installation path (default)**: `<exe_dir>/sdnext`
- **Binary path**: `<install_path>/bin`
- **App path**: `<install_path>/app`
- **Models path (default)**: `<app_path>/models`
- **Git executable**: `<binary_path>/git/git.exe`
- **Python executable**: `<binary_path>/python/python.exe`

System Git/Python installations are intentionally ignored.

## Development Setup

### Prerequisites

- **Windows 10/11** (64-bit)
- **Node.js 20+** — `node --version`
- **npm 10+** — `npm --version`
- Two zip files in `/portable`:
  - `nuget-git-2.53.0.zip`
  - `python-3.13.12.zip`

### Installation

```powershell
# Install dependencies
npm install

# Verify setup
npm run typecheck
npm run lint
```

### Development Server

```powershell
# Start with hot reload (includes --debug flag automatically)
npm run dev
```

This:
1. Starts Vite dev server (HMR for React)
2. Launches Electron with main process in dev mode
3. Opens DevTools (Ctrl+Shift+I)
4. Auto-reload on file changes in renderer
5. Enables debug logging

**Environment**: Dev mode automatically sets `--debug` flag, enabling:
- Detailed console logging via `debugLog()` function
- DevTools window in detached mode
- Scope-tagged log messages with optional details

### Type Checking

```powershell
# Check both main and renderer processes
npm run typecheck
```

Output shows any TypeScript errors without rebuilding.

### Linting

```powershell
# ESLint + Stylelint
npm run lint

# Fix auto-fixable issues
npm run lint:fix
```

## Building for Production

### Build Step

```powershell
# Compile everything (no packaging yet)
npm run build
```

This:
1. Compiles renderer (Vite) → `dist/index.html` + `dist/assets/*`
2. Compiles main process (TypeScript) → `dist/electron/main/`
3. Compiles preload → `dist/electron/preload/`

**Time**: ~3-5 seconds

**Validation**:
```powershell
npm run typecheck  # Should report 0 errors
npm run lint       # Should report 0 errors
```

### Packaging (Optional)

```powershell
# Creates portable exe with bundled zips
npm run package
```

This:
1. Builds all artifacts (calls `npm run build` internally)
2. Extracts portable zips into `dist/win-unpacked/resources/portable/`
3. Creates `dist/SD.Next-0.1.0.exe` (~210 MB)
4. Includes all necessary resources for distribution

**Time**: 1-2 minutes (first time may take longer)

**Note**: Only run when instructed. The exe is large and takes time to package.

### Continuous Integration

**Phase A Tests** (automated):
```powershell
npm run typecheck  # Must pass: 0 errors
npm run lint       # Must pass: 0 errors  
npm run build      # Must succeed
npm run dev        # Must start without errors
```

**Phase B Tests** (manual, on Windows 10/11):
See [TESTING.md](TESTING.md) for comprehensive manual test plan.

## IPC Communication

### Main → Renderer Events

Status updates and data flows from main process to UI:

```typescript
// Startup status
window.sdnext.subscribe('startup-status', (startup) => {
  // { tools, version, status, gpu, logoPath }
})

// Status changes
window.sdnext.subscribe('status', (status) => {
  // 'Idle' | 'Bootstrapping...' | 'Installing...' | 'Running...' | 'Error: ...'
})

// Terminal output
window.sdnext.subscribe('terminal-data', (data) => {
  // String chunk from stdout/stderr
})
```

### Renderer → Main Handlers

Requests from UI to main process:

```typescript
// Get current config
const config = await window.sdnext.getConfig()

// Save config
await window.sdnext.saveConfig(config)

// Start bootstrap
await window.sdnext.startBootstrap()

// Start installation
await window.sdnext.startInstall(config)

// Start launcher
await window.sdnext.startStart(config)

// Stop running process
await window.sdnext.stopProcess()

// Get version info (commit hash, date, branch)
const versionInfo = await window.sdnext.getVersionInfo(installationPath)

// Browse for folder
const path = await window.sdnext.showFolderDialog(defaultPath)

// Download terminal log
await window.sdnext.downloadTerminalLog(filename)

// Detect GPUs
const gpus = await window.sdnext.detectGPUs()
```

## Service Architecture

### Config Service (`config-service.ts`)

Handles persistence with atomic writes:
- Reads `sdnext.json` from exe directory
- Validates via Zod schema
- Writes atomically (temp file + rename)
- Auto-creates file with defaults if missing

**Key functions**:
- `loadConfig()` → SdNextConfig
- `saveConfig(config)` → void
- `getDefaultConfig()` → SdNextConfig

### Runtime Paths (`runtime-paths.ts`)

Resolves paths in both dev and packaged modes:
- `getDefaultInstallationPath()` → exe_dir/sdnext
- `getBinaryPath(installationPath?)` → returns `<installationPath>/bin` when provided (falling back to default), previously `getDefaultBinaryPath()`
- `getDefaultAppPath()` → install_path/app
- `getDefaultModelsPath()` → app_path/models
- `getPrimaryGitExecutablePath()` → git.exe location
- `getPrimaryPythonExecutablePath()` → python.exe location

Supports:
- Development mode (Vite dev server)
- Packaged mode (electron-builder exe)
- Custom installation paths via config

### Version Service (`version-service.ts`)

Git-based version detection:
- `isInstalled(path)` → checks for `.git` folder
- `getVersion(path)` → { commitHash, commitDate, branch }
- Uses `git` commands only (bundled executable)
- Returns "N/A" for missing installations

**Git commands**:
- `git rev-parse --short HEAD` → short hash
- `git show -s --format=%ai HEAD` → commit date (with fallback to `git log`)
- `git rev-parse --abbrev-ref HEAD` → branch name

### Process Runner (`process-runner.ts`)

Manages child process lifecycle:
- Spawns with `node-pty` for proper TTY support
- Streams stdout/stderr to IPC → renderer → xterm.js
- Environment variable propagation (custom vars)
- Mutex locking (only one process at a time)
- Proper exit code handling

**Key functions**:
- `spawn(cmd, args, options)` → Promise<exit_code>
- `terminate()` → kills process tree
- `on('output', callback)` → streams data
- `on('exit', callback)` → cleanup

### Virtual Environment Service (`venv-service.ts`)

Python venv management:
- `createVenv(pythonExe, venvPath)` → creates venv
- `activateVenv(venvPath)` → returns activation script path
- `isVenvValid(venvPath)` → checks if venv exists and is usable

Uses bundled Python executable, respects custom environment variables.

### Bootstrap Service (`portable-bootstrap.ts`)

Extracts bundled runtime zips:
- Checks if git/python needed (folder missing check)
- Extracts zips using PowerShell `Expand-Archive`
- Verifies executables exist post-extraction
- Reports progress via IPC

Handles both direct extraction and asar unpacking (when packaged).

### Install Workflow (`install-workflow.ts`)

State machine for installation:
1. **Validate** → Check bootstrap complete, venv available
2. **Wipe** (optional) → Delete existing installation
3. **Clone** → `git clone` repository
4. **Checkout** → Switch to selected branch
5. **Venv** → Create or activate virtual environment
6. **Install** → Run `python launch.py --test --log install.log` with config args
7. **Verify** → Check installation.log for success

Maps config options to command-line arguments:
- `computeBackend` → `--use-cuda`, `--use-rocm`, etc.
- `modelsPath` → `--models-dir <path>`
- `upgrade` → `--upgrade`
- `reinstall` → `--reinstall`
- Custom parameters → passed as-is

### Start Workflow (`start-workflow.ts`)

Launcher state machine:
1. **Validate** → Check venv exists
2. **Checkout** → Ensure correct branch
3. **Launch** → Run `python launch.py --log sdnext.log` with config args

Maps options:
- `autoLaunch` → `--autolaunch`
- `modelsPath` → `--models-dir <path>`
- `public` → `--listen` (enables network listening)
- Custom parameters → passed as-is

### Process Termination (`process-termination.ts`)

Force-kill process trees on app exit:
- Uses `taskkill /PID <pid> /T /F` to kill tree
- Handles Python, Git, and child processes
- Prevents orphaned processes

## UI Architecture

### Main Component (`App.tsx`)

Coordinates:
- Subscribes to IPC events (startup status, status changes, terminal output)
- Manages React state for UI
- Dispatches actions (bootstrap, install, start, stop)
- Renders panels: buttons, status, advanced options, terminal, tabs

**State**:
- `startup` → Current installation + tool status
- `status` → Current operation (Idle, Installing, etc.)
- `config` → User configuration
- `terminalData` → Accumulated terminal output
- `confirmDialog` → Confirmation modal state
- `expandedSection` → UI state (advanced options)

### Terminal Panel (`TerminalPanel.tsx`)

Wraps xterm.js:
- Creates `Terminal` instance
- Tracks output for download
- Implements copy, clear, download operations
- Responsive sizing

### Styling (`app.css`)

Neumorphic design with:
- CSS custom properties for theming
- Light/dark mode auto-detection
- Gradients and shadows for depth
- Responsive media queries for small screens
- Animations (fade, slide) for modals

**Color Scheme**:
- Accent: `#5ca0a0`
- Background light: `#212121`
- Background dark: `#171717`
- Text: `#d0d0d0`
- Error/danger: Maroon shades

## Debugging

### Enable Debug Mode

```powershell
# Dev mode automatically enables --debug
npm run dev

# Or manually:
npm run dev -- --debug
```

### Debug Logging

Use `debugLog()` from `src/main/main.ts`:

```typescript
import { debugLog } from './main.ts';

debugLog('socket', 'Connection established', { server: 'localhost:3000' });
// Output: [socket] Connection established {"server":"localhost:3000"}
```

**Scope examples**: 'ipc', 'config', 'process', 'version', 'git', 'bootstrap', 'install', 'start'

### DevTools

In dev mode, DevTools is automatically open:
- **Console** → Debug logs and React warnings
- **Network** → (Limited, IPC is internal)
- **Sources** → Step through code
- **Performance** → Check for bottlenecks

### Common Issues

**TypeScript errors after changes**:
```powershell
npm run typecheck  # See specific errors
```

**Hot reload not working**:
- Restart dev server: Ctrl+C then `npm run dev`
- Clear Vite cache: `rm -r dist`

**Process won't terminate**:
- Check Task Manager for orphaned python.exe/git.exe
- Verify `taskkill` command works: `taskkill /PID <pid> /T /F`

**Config not saving**:
- Check file permissions in exe directory
- Verify sdnext.json is valid JSON
- Check config service error logs

## Testing

### Phase A: Automated (Code Quality)

```powershell
npm run typecheck  # TypeScript: 0 errors
npm run lint       # ESLint + Stylelint: 0 errors
npm run build      # Vite + Electron: Success
npm run dev        # Startup check
```

### Phase B: Manual (Runtime)

See [TESTING.md](TESTING.md) for 47 manual test cases covering:
- B1: Bootstrap (3 tests)
- B2: Config persistence (1 test)
- B3: Installation workflows (10 tests)
- B4: Start/launch (5 tests)
- B5: Process management (4 tests)
- B6: Terminal/logs (6 tests)
- B7: UI/theme (5 tests)
- B8: Error handling (3 tests)
- B9: Paths/directories (3 tests)
- B10: Button states (4 tests)
- B11: UI/UX enhancements (3 tests)

## Performance Notes

- **Startup**: < 1 second to display UI (async bootstrap)
- **Build**: ~1.7s for production build
- **Package**: 1-2 min for exe creation (includes compression)
- **Bundle size**: ~210 MB exe (includes Python + Git zips)
- **Memory**: ~150-200 MB at rest, up to 500+ MB during install

## Code Quality Standards

### TypeScript

- Strict mode enabled
- No `any` types except where unavoidable
- Proper error handling with try-catch
- Type imports: `import type { Foo } from '...'`

### Component Design

- Functional components with hooks
- Props interfaces properly typed
- Memoization for expensive computations
- Stable callback references with useCallback

### File Organization

- One component per file
- Services in dedicated modules
- Types in shared types file
- Styles co-located or global

### Git Commits

- Descriptive messages
- Atomic commits (one logical change per commit)
- Reference issues/tasks when applicable

## Resources

- **Electron Documentation**: https://www.electronjs.org/docs
- **React Hooks**: https://react.dev/reference/react/hooks
- **TypeScript Handbook**: https://www.typescriptlang.org/docs/
- **xterm.js**: https://xtermjs.org/
- **Vite Guide**: https://vitejs.dev/guide/
- **SD.Next Repository**: https://github.com/vladmandic/sdnext

## License

MIT

---

**Last Updated**: March 2026
