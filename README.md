# SD.Next for Windows Installer/Launcher

A Windows-only installer and launcher for [SD.Next](https://github.com/vladmandic/sdnext) built with Electron, React, and TypeScript. The application is self-contained, requiring no system dependencies—Git and Python are bundled and managed by the installer.

## Features

- **Single portable EXE distribution** targeting Windows 10/11 x64
- **Self-contained runtimes**: Git and Python zip bundles in `/portable`, auto-extracted at startup
- **Installation wizard** with options for backend selection (CUDA, ROCm, DirectML, CPU, etc.), upgrade/reinstall/wipe choices
- **Persistent configuration** saved in `sdnext.json` with defaults for installation path, models directory, repository branch, and custom parameters/environment
- **Real-time terminal output** embedded using `xterm.js`, with streaming install/launch logs and download/view capabilities
- **Process lifecycle management** with proper cleanup on app exit or process interruption
- **Version detection** showing installed commit hash and date, or "N/A" if not installed
- **Advanced options** for custom environment variables, parameters, and repository branch selection

## Architecture

```
src/
├── main/                  # Electron main process
│   ├── main.ts           # App lifecycle and window creation
│   ├── ipc.ts            # IPC handler registration for all client-main communication
│   └── services/         # Core business logic
│       ├── config-service.ts      # Atomic load/save of sdnext.json with validation
│       ├── runtime-paths.ts       # Path resolution for bundled git/python (dev and packaged modes)
│       ├── version-service.ts     # Version detection via git
│       ├── process-runner.ts      # Spawn/manage child processes with output streaming
│       ├── process-termination.ts # Force-kill process trees on exit
│       ├── venv-service.ts        # Create/activate Python virtual environments
│       ├── install-workflow.ts    # Installation state machine
│       └── start-workflow.ts      # Launcher state machine
├── preload/               # Preload bridge (context-isolated)
│   └── preload.ts        # Safe API exposed to renderer
├── renderer/              # React UI
│   ├── App.tsx           # Main component, state management, IPC coordination
│   ├── components/       # UI components
│   │   └── TerminalPanel.tsx  # xterm.js integration
│   ├── styles/           # CSS
│   └── main.tsx          # React entry point
└── shared/                # Shared types and contracts
    └── types.ts          # TypeScript interfaces for config, status, options
```

## Technology Stack

- **Electron 38.8** - Desktop framework (Chromium 132, Node.js 22)
- **React 19.2** - UI rendering with automatic JSX transform
- **TypeScript 5.9** - Type safety and modern language features
- **Vite 7.3** - Fast build tool with HMR and optimized bundling
- **xterm.js 5.3** - Terminal emulation
- **ESLint 9** + **Stylelint 17** - Code quality and style enforcement

## Performance

- **Build time**: ~1.7s for production builds
- **Bundle optimization**: Code-split chunks for optimal caching
  - React vendor: 11 KB (gzipped)
  - Xterm vendor: 70 KB (gzipped)
  - App code: 59 KB (gzipped)
- **Startup time**: < 1 second UI display (async runtime extraction)
- **Package size**: ~210 MB portable EXE (includes Git + Python runtimes)
- **Zod 3.24** - Schema validation
- **electron-builder 25** - Packaging

## Requirements

- Windows 10/11 x64
- Node.js 20+ (for development)
- 2+ GB available space (for bundled Git/Python and SD.Next installation)

## Getting Started

### Development

```powershell
# Install dependencies
npm install

# Start dev server (Vite + Electron with hot reload)
npm run dev
```

### Build for Production

```powershell
# Type-check
npm run typecheck

# Build (creates dist/ with renderer output and electron bundles)
npm run build

# Package as portable EXE (creates dist/SD.Next-{version}.exe)
npm run package
```

## Configuration & Runtime Paths

### sdnext.json

Persisted user configuration stored relative to the executable directory:

```json
{
  "autoLaunch": false,
  "repositoryBranch": "dev",
  "installationPath": "<exe_dir>/app",
  "modelsPath": "<exe_dir>/app/models",
  "customParameters": "",
  "customEnvironment": ""
}
```

### Runtime Paths

At startup, bundled zip files are unpacked from `/portable` when tool folders are missing.

**Bundled archives:**
- `portable/nuget-git-2.53.0.zip`
- `portable/python-3.13.12.zip`

**Resolved executables used by the app:**
- Git: `/portable/cmd/git.exe`
- Python: `/portable/python/python.exe`

System-installed Git/Python are intentionally ignored.

## Bundled Runtimes

The app ships with two zip artifacts in `/portable` and unpacks them at startup when needed.
Automation and extraction use PowerShell in the main process startup bootstrap.

## Installation Workflow

1. **Wipe (optional)**: Delete existing `/app` if "Wipe" is selected
2. **Clone**: Clone sdnext repository from GitHub into `/app`
3. **Checkout**: Checkout selected branch (master/dev)
4. **Venv**: Create or activate `/app/venv` using bundled Python
5. **Launch**: Execute `python launch.py --test --log install.log` with mapped flags:
   - Backend: `--use-cuda`, `--use-rocm`, `--use-zluda`, `--use-directml`, `--use-ipex`, `--use-openvino`
   - Upgrade: `--upgrade`
   - Reinstall: `--reinstall`
   - Models: `--models-dir <path>`
   - Custom: user-provided parameters

## Start Workflow

1. **Branch checkout**: Checkout selected repository branch
2. **Venv activation**: Verify `/app/venv` exists, activate it
3. **Launch**: Execute `python launch.py --log sdnext.log` with options:
   - Auto-launch: `--autolaunch` (if checked)
   - Models: `--models-dir <path>`
   - Custom: user-provided parameters

## Terminal Features

- **Real-time streaming** of stdout/stderr from install/launch processes
- **Scrollback** up to 10,000 lines
- **Copy text** to clipboard
- **Download session** as plain text file
- **Log access**: View/download `install.log` and `sdnext.log` after operations

## Process Management

- **Mutex locking**: Only one install/start operation can run at a time
- **Process termination**: On app exit or process interruption, all child processes (and their descendants) are terminated via `taskkill /PID <pid> /T /F`
- **No orphaned processes**: Original `.exe`, spawned `python.exe`, `git.exe`, and all children are cleaned up

## Testing

### Manual Testing Checklist

1. **Startup**:
   - [ ] App launches with correct logo and branding
   - [ ] If `/app` exists, shows installed version (date + short commit hash)
   - [ ] If `/app` missing, shows "N/A" and disables "Start" button

2. **Config Persistence**:
   - [ ] Change each Advanced option (paths, branch, env, params)
   - [ ] Restart app
   - [ ] Confirm all settings are restored from `sdnext.json`

3. **Install Workflow**:
   - [ ] Click Install, open installer wizard
   - [ ] Select backend (test at least CPU and one GPU option)
   - [ ] Try wipe+reinstall
   - [ ] Terminal streams `git clone`, venv creation, and `python launch.py --test ...` output
   - [ ] Verify `install.log` is created in `/app/`

4. **Start Workflow**:
   - [ ] After install completes, click "Start"
   - [ ] Terminal streams `python launch.py --log sdnext.log` output
   - [ ] Verify `sdnext.log` is created in `/app/`

5. **Process Cleanup**:
   - [ ] Close app during install or start
   - [ ] Verify no orphaned `python.exe`, `git.exe` processes remain
   - [ ] Confirm install/start can be re-run without conflicts

6. **Portability**:
   - [ ] Copy `dist/win-unpacked/` to a USB drive
   - [ ] Run on another Windows 10/11 machine with standard user privileges
   - [ ] Verify bundled git/python work without system installation

## Troubleshooting

### App Won't Start

- Ensure Node.js 20+ is installed: `node --version`
- Check for Windows Defender blocking the exe (common on first run)
- Verify `sdnext.png` exists in project root

### Missing Bundled Runtimes

- Ensure `portable/nuget-git-2.53.0.zip` and `portable/python-3.13.12.zip` exist
- Launch app once to let startup bootstrap unpack tools into `/portable`
- Verify write permission for the executable directory (or configured portable location)

### Installation Fails

- Check `app/install.log` for error details
- Ensure the user account has write permissions to `/app` directory
- Try "Wipe" option to force a clean install

### Python Virtual Environment Issues

- Verify bundled Python supports `venv` module
- Check `venv` module availability: `<bundled-python> -c "import venv"`
- Ensure `/app/venv` has correct permissions

## Project Structure

```
.
├── src/                    # TypeScript source code
│   ├── main/              # Electron main process
│   ├── preload/           # IPC bridge
│   ├── renderer/          # React UI
│   ├── shared/            # Shared types
├── dist/                  # Built output (post-build)
├── dist/electron/         # Electron TypeScript compilation (post-build)
├── portable/              # Bundled runtime zips and extracted tools at runtime
│   ├── nuget-git-2.53.0.zip
│   ├── python-3.13.12.zip
├── public/                # Static assets (imported as extra resources)
├── vite.config.ts         # Vite configuration
├── tsconfig.*.json        # TypeScript configurations
├── package.json           # Dependencies and build scripts
└── README.md              # This file
```

## License

MIT
