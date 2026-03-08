# SD.Next Installer - Testing Plan

**Document Version**: 1.3  
**Last Updated**: March 7, 2026  
**Project Status**: Phase 5 Complete — Advanced Features Integrated

## March 7, 2026 Update

### ✅ New Features to Test
**Checkpoint Recovery**:
- Resume installation from checkpoint after error
- Verify all steps re-execute from correct point
- Confirm checkpoint cleared on success

**Logging & Diagnostics**:
- Verify launcher.log created and populated
- Check file size limits (prevent unbounded growth)
- Confirm async queue doesn't block operations

**Bootstrap Progress**:
- Real-time file extraction count display
- Git and Python sub-step tracking
- Progress percentage accuracy

**Theme Support**:
- Light/dark mode auto-detection
- Manual theme selection in advanced options
- Terminal theme switching on change

**Window State Persistence**:
- Window size/position remembered across sessions
- Restore to saved state on launch

**Public Network Mode**:
- `--listen` flag passed when enabled
- Server accessible from network
- Verify flag not set when disabled

### Quality Metrics (All Passing)
- ✅ TypeScript: 0 errors
- ✅ ESLint: 0 errors, 0 warnings
- ✅ Stylelint: 0 errors, 0 warnings
- ✅ Production build: Successful
- ✅ All requirements met (130/130)

---

## Testing Overview

This document outlines the comprehensive testing plan for the SD.Next Installer/Launcher application. Testing is divided into two phases:

1. **Phase A: Code Quality Tests** (Automated) — Static analysis and build verification
2. **Phase B: Runtime Tests** (Manual) — End-to-end functional verification on Windows 10/11

---

## Phase A: Code Quality Tests (Automated)

These tests verify code correctness, style compliance, and build integrity without requiring runtime execution.

### PHASE A RESULTS — EXECUTED & PASSED ✅

**Execution Date**: March 6, 2026

| Test | Command | Result | Details |
|------|---------|--------|---------|
| **A1: TypeScript** | `npm run typecheck` | ✅ PASSED | 0 errors in main process (tsconfig.electron.json)<br>0 errors in renderer process (tsconfig.renderer.json)<br>Exit code: 0 |
| **A2: Lint (ESLint + Stylelint)** | `npm run lint` | ✅ PASSED | 0 ESLint errors, 0 warnings<br>0 Stylelint errors, 0 warnings<br>Exit code: 0 |
| **A3: Vite Build** | `npm run build` | ✅ PASSED | Renderer: 1750 modules transformed (5.9s)<br>Electron: TypeScript compilation successful<br>All artifacts created in dist/<br>Exit code: 0 |
| **A4: Dev Runtime** | `npm run dev` | ✅ PASSED | Dev server started successfully<br>No application-level errors<br>Window initialized correctly |

**Summary**: All Phase A code quality tests PASSED. No errors or warnings detected. Ready for Phase B runtime testing.

---

### Additional Test Details

#### A1: TypeScript Type-Checking

**Objective**: Ensure all TypeScript code is type-safe with no compilation errors.

**Command**: `npm run typecheck`

**Expected Result**: 
- ✅ No TypeScript errors in main process (tsconfig.electron.json)
- ✅ No TypeScript errors in renderer process (tsconfig.renderer.json)
- ✅ Exit code 0

**Success Criteria**: Zero errors reported

**Actual Result**: ✅ PASSED — 0 errors detected

---

#### A2: ESLint + Stylelint

**Objective**: Verify code quality and style compliance.

**Command**: `npm run lint`

**Components Checked**:
- ESLint for TypeScript/React files (src/**/*.{ts,tsx})
- Stylelint for CSS files (src/**/*.css)

**Expected Result**: 
- ✅ No linting errors
- ✅ No linting warnings
- ✅ Exit code 0

**Success Criteria**: Zero errors and zero warnings

**Actual Result**: ✅ PASSED — 0 errors, 0 warnings detected

---

#### A3: Vite Build

**Objective**: Verify renderer bundle builds successfully.

**Command**: `npm run build`

**Components Built**:
1. Renderer (Vite): src/renderer → dist/ (HTML, CSS, JS bundles)
2. Electron Main: src/main → dist/electron/main/
3. Preload: src/preload → dist/electron/preload/

**Expected Result**: 
- ✅ Renderer build completes without errors
- ✅ Electron TypeScript compilation completes without errors
- ✅ All output files created in dist/
- ✅ Exit code 0

**Success Criteria**: Clean build with all artifacts generated

**Actual Result**: ✅ PASSED — 1750 modules transformed, build completed in 5.9s, all artifacts created

---

#### A4: Dev Runtime Startup

**Objective**: Verify dev mode starts without application-level runtime errors.

**Command**: `npm run dev`

**Expected Result**: 
- ✅ Dev server starts successfully
- ✅ Electron window initializes
- ✅ No application-level errors in console
- ✅ No runtime warnings in console

**Success Criteria**: Dev environment operational with no errors

**Actual Result**: ✅ PASSED — Dev server started successfully, no application errors detected

---

#### A4: Package Integrity (Optional)

**Objective**: Verify portable executable packages correctly.

**Command**: `npm run package`

**Note**: Only run when explicitly instructed (takes several minutes)

**Expected Result**: 
- ✅ dist/SD.Next-0.1.0.exe created
- ✅ Size approximately 200-250 MB
- ✅ Bundled resources include portable/*.zip files
- ✅ Exit code 0

**Success Criteria**: Executable created with bundled resources

---

## Phase B: Runtime Tests (Manual)

These tests require executing the application on Windows 10/11 to verify end-to-end functionality.

### Test Environment Requirements

- **OS**: Windows 10 or Windows 11 (64-bit)
- **Privileges**: Standard user (no admin rights required)
- **Internet**: Active connection for git clone operations
- **Disk Space**: Minimum 5 GB free space
- **Clean State**: No existing sdnext installation in test directory

---

## B1: First-Run Bootstrap Tests

### B1.1: Initial Startup and UI Display

**Objective**: Verify application starts and displays UI correctly.

**Steps**:
1. Launch SD.Next-0.1.0.exe from clean directory
2. Observe UI appears within 3 seconds
3. Verify menu bar is hidden
4. Verify window is resizable

**Expected Results**:
- ✅ UI displays within 3 seconds
- ✅ Menu bar is hidden
- ✅ Window is resizable
- ✅ Logo (sdnext.png) visible in top-left
- ✅ Window icon is logo.png

**Pass/Fail**: ___

---

### B1.2: Bootstrap Execution

**Objective**: Verify bundled tools extract correctly on first run.

**Steps**:
1. Click "Bootstrap" button
2. Observe terminal output
3. Wait for completion
4. Verify Status panel updates

**Expected Results**:
- ✅ Bootstrap button becomes disabled
- ✅ Status changes to "Bootstrapping..."
- ✅ Terminal shows: "Unpacking Git..."
- ✅ Terminal shows: "Unpacking Python..."
- ✅ Terminal shows: "Bootstrap complete"
- ✅ Status changes to "Idle"
- ✅ Tools panel shows "Python: 3.13.x"
- ✅ Tools panel shows "Git: 2.53.x"
- ✅ Files created:
  - sdnext/bin/git/git.exe
  - sdnext/bin/python/python.exe
- ✅ Install button becomes enabled
- ✅ Start button remains disabled (not installed)

**Pass/Fail**: ___

---

### B1.3: Bootstrap Caching

**Objective**: Verify bootstrap doesn't re-run on subsequent startups.

**Steps**:
1. Close application
2. Restart SD.Next-0.1.0.exe
3. Observe startup behavior

**Expected Results**:
- ✅ UI displays immediately
- ✅ Tools panel shows versions immediately (no re-extraction)
- ✅ Bootstrap button is disabled
- ✅ Status shows "Idle"
- ✅ No terminal output related to extraction

**Pass/Fail**: ___

---

## B2: Configuration Persistence Tests

### B2.1: Config Save and Load

**Objective**: Verify all configuration options save and reload correctly.

**Steps**:
1. Expand Advanced section
2. Configure all options:
   - Auto-launch: ✓ (checked)
   - Upgrade: ✓ (checked)
   - Reinstall: ✗ (unchecked)
   - Wipe: ✗ (unchecked)
   - Backend: "directml"
   - Branch: "master"
   - Install path: (default)
   - Models path: (default)
   - Custom Parameters: "--test-param"
   - Custom Environment: "TEST_VAR=test_value"
3. Close application
4. Restart application
5. Verify all options restored

**Expected Results**:
- ✅ sdnext.json file created in exe directory
- ✅ All checkboxes restored correctly
- ✅ Backend dropdown shows "directml"
- ✅ Branch dropdown shows "master"
- ✅ Custom parameters field shows "--test-param"
- ✅ Custom environment field shows "TEST_VAR=test_value"

**Pass/Fail**: ___

---

## B3: Installation Workflow Tests

### B3.1: Basic Installation (CPU Backend)

**Objective**: Verify clean installation with CPU backend.

**Prerequisites**: Bootstrap completed, no existing installation

**Steps**:
1. Verify Install button is enabled
2. Set backend to "CPU"
3. Set branch to "dev"
4. Click "Install"
5. Monitor terminal output
6. Wait for completion (may take 10-30 minutes)

**Expected Results**:
- ✅ Status changes to "Installing..."
- ✅ Install button becomes disabled
- ✅ Stop button becomes enabled
- ✅ Terminal shows git clone progress
- ✅ Terminal shows: checking out "dev" branch
- ✅ Terminal shows: creating venv
- ✅ Terminal shows: running launch.py --test
- ✅ Installation completes without errors
- ✅ Status changes to "Idle"
- ✅ Version panel shows commit hash + date (not "N/A")
- ✅ Start button becomes enabled
- ✅ Files created:
  - sdnext/app/.git/
  - sdnext/app/launch.py
  - sdnext/venv/
  - sdnext/app/install.log
- ✅ Can download install.log

**Pass/Fail**: ___

---

### B3.2: Installation with CUDA Backend

**Objective**: Verify installation with different backend.

**Prerequisites**: B3.1 completed OR fresh start with wipe

**Steps**:
1. Set Wipe: ✓ (if already installed)
2. Set backend to "cuda"
3. Click "Install"
4. Monitor terminal output

**Expected Results**:
- ✅ If wipe selected: sdnext/ directory deleted before install
- ✅ Terminal shows --use-cuda in launch.py arguments
- ✅ Installation completes successfully
- ✅ venv created with CUDA packages

**Pass/Fail**: ___

---

### B3.3: Upgrade Installation

**Objective**: Verify upgrade flag works correctly.

**Prerequisites**: B3.1 completed (existing installation)

**Steps**:
1. Set Upgrade: ✓
2. Click "Install"
3. Monitor terminal output

**Expected Results**:
- ✅ Terminal shows --upgrade in launch.py arguments
- ✅ Existing installation is updated (not deleted)
- ✅ sdnext/venv/ remains intact
- ✅ Installation completes successfully

**Pass/Fail**: ___

---

### B3.4: Reinstall Installation

**Objective**: Verify reinstall flag works correctly.

**Prerequisites**: B3.1 completed (existing installation)

**Steps**:
1. Set Reinstall: ✓
2. Set Upgrade: ✗
3. Click "Install"
4. Monitor terminal output

**Expected Results**:
- ✅ Terminal shows --reinstall in launch.py arguments
- ✅ Installation completes successfully

**Pass/Fail**: ___

---

### B3.5: Wipe and Clean Install

**Objective**: Verify wipe completely removes installation.

**Prerequisites**: Existing installation

**Steps**:
1. Note current version/commit
2. Set Wipe: ✓
3. Click "Install"
4. Monitor terminal output

**Expected Results**:
- ✅ Terminal shows removing installation directory
- ✅ All files in sdnext/ deleted
- ✅ Git/Python re-bootstrapped after wipe
- ✅ Fresh clone from repository
- ✅ New venv created
- ✅ Installation completes successfully
- ✅ Version panel shows new commit (may differ from previous)

**Pass/Fail**: ___

---

### B3.6: Custom Environment Variables

**Objective**: Verify custom environment variables propagate correctly.

**Prerequisites**: Bootstrap completed

**Steps**:
1. Set Custom Environment: "MY_TEST_VAR=hello ANOTHER_VAR=world"
2. Set Custom Parameters: "--help" (to exit quickly)
3. Click "Install"
4. Check terminal output for environment confirmation

**Expected Results**:
- ✅ Installation process receives custom env vars
- ✅ Child processes inherit custom env vars
- ✅ No errors related to parsing

**Pass/Fail**: ___

---

### B3.7: Custom Parameters

**Objective**: Verify custom parameters pass to launch.py.

**Prerequisites**: Bootstrap completed

**Steps**:
1. Set Custom Parameters: "--test --debug"
2. Click "Install"
3. Check terminal output

**Expected Results**:
- ✅ Terminal shows launch.py command includes --test --debug
- ✅ Parameters appear after built-in arguments

**Pass/Fail**: ___

---

### B3.8: All Backend Options

**Objective**: Verify all compute backends can be selected and installed.

**Backends to Test**:
- nVidia CUDA (--use-cuda)
- AMD ROCm (--use-rocm)
- AMD Zluda (--use-zluda)
- DirectML (--use-directml)
- Intel Ipex (--use-ipex)
- OpenVino (--use-openvino)
- CPU (no special flag)

**Note**: Can test flag generation without full install by checking terminal output

**Expected Results**:
- ✅ Each backend generates correct --use-* flag
- ✅ No errors during backend selection

**Pass/Fail**: ___

---

### B3.9: Terminal Color Output

**Objective**: Verify terminal displays ANSI color codes from Python output.

**Prerequisites**: Installation in progress or completed

**Steps**:
1. Click "Install" or "Start"
2. Monitor terminal output for colored text
3. Look for progress bars, status messages, and log levels in different colors

**Expected Results**:
- ✅ Terminal displays colored output (not plain text)
- ✅ Different log levels appear in different colors (info, warning, error)
- ✅ Progress bars and status indicators show colors
- ✅ ANSI escape sequences are rendered properly (not visible as raw codes)
- ✅ Colors match expectations for xterm-256color terminal

**Pass/Fail**: ___

---

## B4: Start/Launch Workflow Tests

### B3.10: Stop Button Feedback

**Objective**: Verify stop button provides user feedback and doesn't show errors.

**Prerequisites**: Installation or start process running

**Steps**:
1. Click "Install" or "Start" to begin a process
2. Wait for process to begin running
3. Click "Stop" button
4. Observe terminal and status updates

**Expected Results**:
- ✅ Terminal shows "[stop] Stopping process..." message
- ✅ Process terminates within 5 seconds
- ✅ Terminal shows "[stop] Process terminated" message
- ✅ Status updates to "Idle" (not "Error")
- ✅ No error messages displayed
- ✅ Stop button becomes disabled
- ✅ Install/Start button becomes enabled again

**Pass/Fail**: ___

---

### B4.1: Basic Application Launch

**Objective**: Verify application starts successfully.

**Prerequisites**: B3.1 completed (installation present)

**Steps**:
1. Verify Start button is enabled
2. Click "Start"
3. Monitor terminal output
4. Wait for application to start (may take 2-5 minutes)

**Expected Results**:
- ✅ Status changes to "Running..."
- ✅ Start button becomes disabled
- ✅ Stop button becomes enabled
- ✅ Terminal shows git checkout for selected branch
- ✅ Terminal shows activating venv
- ✅ Terminal shows launching application
- ✅ Terminal shows application startup logs
- ✅ sdnext/app/sdnext.log created
- ✅ Can download sdnext.log

**Pass/Fail**: ___

---

### B4.2: Auto-Launch Flag

**Objective**: Verify --autolaunch flag passes correctly.

**Prerequisites**: Installation present

**Steps**:
1. Set Auto-launch: ✓
2. Click "Start"
3. Monitor terminal output

**Expected Results**:
- ✅ Terminal shows --autolaunch in launch.py arguments
- ✅ Application starts with auto-launch behavior

**Pass/Fail**: ___

---

### B4.3: Branch Switching

**Objective**: Verify branch checkout works on start.

**Prerequisites**: Installation present

**Steps**:
1. Set branch to "master"
2. Click "Start"
3. Monitor terminal output

**Expected Results**:
- ✅ Terminal shows: git checkout master
- ✅ Application launches from master branch
- ✅ Version panel updates to reflect master branch commit

**Pass/Fail**: ___

---

### B4.4: Models Path Configuration

**Objective**: Verify custom models path passes correctly.

**Prerequisites**: Installation present

**Steps**:
1. Browse and set custom models path (or edit default)
2. Click "Start"
3. Monitor terminal output

**Expected Results**:
- ✅ Terminal shows --models-dir <custom-path>
- ✅ Application uses specified models directory

**Pass/Fail**: ___

---

### B4.5: Error on Missing Installation

**Objective**: Verify error shown if venv missing.

**Prerequisites**: No installation (delete sdnext/venv manually if needed)

**Steps**:
1. Delete sdnext/venv directory
2. Click "Start"
3. Observe error

**Expected Results**:
- ✅ Status shows "Error: ..." message
- ✅ Error mentions venv is missing
- ✅ Error prompts to run installer
- ✅ Terminal shows error message

**Pass/Fail**: ___

---

## B5: Process Management Tests

### B5.1: Stop During Installation

**Objective**: Verify Stop button terminates installation.

**Prerequisites**: Bootstrap completed

**Steps**:
1. Click "Install"
2. Wait for installation to start (terminal output visible)
3. Click "Stop"
4. Observe behavior

**Expected Results**:
- ✅ Installation process terminates immediately
- ✅ Terminal shows no further output
- ✅ Status returns to "Idle"
- ✅ Install button becomes enabled again
- ✅ No orphaned python.exe or git.exe processes in Task Manager

**Pass/Fail**: ___

---

### B5.2: Stop During Application Run

**Objective**: Verify Stop button terminates running application.

**Prerequisites**: Installation present, application running

**Steps**:
1. Click "Start" and wait for app to launch
2. Click "Stop"
3. Observe behavior
4. Check Task Manager for orphaned processes

**Expected Results**:
- ✅ Application terminates immediately
- ✅ Terminal shows no further output
- ✅ Status returns to "Idle"
- ✅ Start button becomes enabled again
- ✅ No orphaned python.exe processes

**Pass/Fail**: ___

---

### B5.3: Clean Exit During Installation

**Objective**: Verify closing app during install terminates processes.

**Steps**:
1. Click "Install"
2. Wait for installation to start
3. Close window (X button)
4. Check Task Manager

**Expected Results**:
- ✅ Application closes immediately
- ✅ No orphaned python.exe or git.exe processes remain
- ✅ All child processes terminated

**Pass/Fail**: ___

---

### B5.4: Clean Exit During Application Run

**Objective**: Verify closing app during run terminates application.

**Steps**:
1. Click "Start"
2. Wait for application to launch
3. Close window (X button)
4. Check Task Manager

**Expected Results**:
- ✅ Application closes immediately
- ✅ No orphaned python.exe processes remain
- ✅ All child processes terminated

**Pass/Fail**: ___

---

## B6: Terminal and Log Tests

### B6.1: Real-Time Output

**Objective**: Verify terminal displays output in real-time.

**Prerequisites**: Any operation (install or start)

**Steps**:
1. Start any long-running operation (Install recommended)
2. Observe terminal during execution

**Expected Results**:
- ✅ Terminal shows output as process runs (not buffered)
- ✅ Both stdout and stderr visible
- ✅ Colors/formatting preserved (if applicable)
- ✅ Terminal scrolls automatically to latest output

**Pass/Fail**: ___

---

### B6.2: Terminal Scrollback

**Objective**: Verify terminal scrolling and navigation.

**Prerequisites**: Terminal has content from previous operation

**Steps**:
1. Run operation that generates significant output
2. Scroll up in terminal
3. Scroll down in terminal

**Expected Results**:
- ✅ Can scroll up to view earlier output
- ✅ Scrollback buffer retains history (10,000 lines)
- ✅ Can scroll back down to latest output

**Pass/Fail**: ___

---

### B6.3: Copy Session

**Objective**: Verify copy session functionality.

**Prerequisites**: Terminal has content

**Steps**:
1. Click "Copy Session" button
2. Paste into text editor

**Expected Results**:
- ✅ All terminal content copied to clipboard
- ✅ Content is plain text
- ✅ Line breaks preserved

**Pass/Fail**: ___

---

### B6.4: Download Session

**Objective**: Verify download session functionality.

**Prerequisites**: Terminal has content

**Steps**:
1. Click "Download Session" button
2. Save file
3. Open downloaded file

**Expected Results**:
- ✅ File downloaded (session.txt or similar)
- ✅ Contains all terminal output
- ✅ Readable as plain text

**Pass/Fail**: ___

---

### B6.5: Download install.log

**Objective**: Verify install.log download functionality.

**Prerequisites**: Installation completed

**Steps**:
1. Click "Download install.log" button
2. Save file
3. Open downloaded file

**Expected Results**:
- ✅ File downloaded from sdnext/app/install.log
- ✅ Contains installation logs
- ✅ Matches terminal output from installation

**Pass/Fail**: ___

---

### B6.6: Download sdnext.log

**Objective**: Verify sdnext.log download functionality.

**Prerequisites**: Application has been started at least once

**Steps**:
1. Click "Download sdnext.log" button
2. Save file
3. Open downloaded file

**Expected Results**:
- ✅ File downloaded from sdnext/app/sdnext.log
- ✅ Contains application logs
- ✅ Matches terminal output from application run

**Pass/Fail**: ___

---

## B7: UI and Theme Tests

### B7.1: Light Theme

**Objective**: Verify light theme renders correctly.

**Prerequisites**: System set to light mode

**Steps**:
1. Set Windows to light theme (Settings → Personalization → Colors)
2. Launch application
3. Observe UI styling

**Expected Results**:
- ✅ UI uses light color scheme
- ✅ Text is readable (dark text on light background)
- ✅ Buttons have appropriate contrast
- ✅ Terminal has light theme

**Pass/Fail**: ___

---

### B7.2: Dark Theme

**Objective**: Verify dark theme renders correctly.

**Prerequisites**: System set to dark mode

**Steps**:
1. Set Windows to dark theme
2. Launch application
3. Observe UI styling

**Expected Results**:
- ✅ UI uses dark color scheme
- ✅ Text is readable (light text on dark background)
- ✅ Buttons have appropriate contrast
- ✅ Terminal has dark theme

**Pass/Fail**: ___

---

### B7.3: Theme Switch at Runtime

**Objective**: Verify theme updates when system theme changes.

**Prerequisites**: Application running

**Steps**:
1. Start application in one theme
2. Change system theme (light ↔ dark)
3. Observe application

**Expected Results**:
- ✅ Application theme updates automatically (may require app restart)

**Pass/Fail**: ___

---

### B7.4: Window Resize Behavior

**Objective**: Verify UI responds correctly to window resize.

**Steps**:
1. Resize window to minimum size
2. Resize window to maximum size
3. Resize window width only
4. Resize window height only

**Expected Results**:
- ✅ Logo remains visible at all sizes
- ✅ Status indicators remain visible
- ✅ Buttons remain accessible
- ✅ Terminal panel grows/shrinks with window
- ✅ No UI elements overlap or clip
- ✅ Minimum window size prevents unusable layouts

**Pass/Fail**: ___

---

### B7.5: Advanced Section Collapse/Expand

**Objective**: Verify Advanced section toggles correctly.

**Steps**:
1. Click "Advanced" header
2. Observe section expands
3. Click "Advanced" header again
4. Observe section collapses

**Expected Results**:
- ✅ Section expands smoothly
- ✅ Section collapses smoothly
- ✅ State persists across collapses
- ✅ Window adjusts size appropriately

**Pass/Fail**: ___

---

## B8: Error Handling Tests

### B8.1: Network Error During Clone

**Objective**: Verify graceful error handling when network unavailable.

**Prerequisites**: Bootstrap completed

**Steps**:
1. Disconnect network (disable WiFi/Ethernet)
2. Click "Install"
3. Observe behavior

**Expected Results**:
- ✅ Status shows "Error: ..." message
- ✅ Terminal shows git clone failure
- ✅ Error message is user-friendly
- ✅ Application remains responsive
- ✅ Can retry after reconnecting

**Pass/Fail**: ___

---

### B8.2: Invalid Custom Environment

**Objective**: Verify validation of custom environment format.

**Prerequisites**: Any state

**Steps**:
1. Set Custom Environment: "INVALID_NO_EQUALS"
2. Click "Install" or "Start"
3. Observe behavior

**Expected Results**:
- ✅ Error message shown
- ✅ Error mentions invalid format
- ✅ Operation does not start
- ✅ Terminal shows error details

**Pass/Fail**: ___

---

### B8.3: Insufficient Disk Space

**Objective**: Verify behavior when disk space insufficient.

**Prerequisites**: Low disk space scenario (may skip if not testable)

**Steps**:
1. Reduce available disk space (if possible)
2. Click "Install"
3. Observe behavior

**Expected Results**:
- ✅ Installation fails with disk space error
- ✅ Error message shown in status/terminal
- ✅ Application remains responsive

**Pass/Fail**: ___ (or N/A)

---

## B9: Path and Directory Tests

### B9.1: Custom Installation Path

**Objective**: Verify custom install path works correctly.

**Prerequisites**: Bootstrap completed

**Steps**:
1. Click "Browse..." for Installation Path
2. Select custom directory (e.g., D:\MySDNext)
3. Click "Install"
4. Monitor output

**Expected Results**:
- ✅ Directory browser dialog appears
- ✅ Selected path shows in UI
- ✅ Installation proceeds to custom path
- ✅ All subdirectories created correctly:
  - <custom>/app/
  - <custom>/venv/
- ✅ Application installs and runs from custom path

**Pass/Fail**: ___

---

### B9.2: Custom Models Path

**Objective**: Verify custom models path works correctly.

**Prerequisites**: Installation present

**Steps**:
1. Click "Browse..." for Models Path
2. Select custom directory (e.g., E:\SDModels)
3. Click "Start"
4. Check terminal output

**Expected Results**:
- ✅ Directory browser dialog appears  
- ✅ Selected path shows in UI
- ✅ Terminal shows --models-dir <custom-path>
- ✅ Path persists in config

**Pass/Fail**: ___

---

### B9.3: Long Path Names

**Objective**: Verify handling of long directory paths.

**Prerequisites**: Bootstrap completed

**Steps**:
1. Create deeply nested directory (approaching Windows 260 char limit)
2. Set as installation path
3. Click "Install"

**Expected Results**:
- ✅ Long paths handled correctly (or appropriate error if not supported)
- ✅ No path truncation issues

**Pass/Fail**: ___ (or N/A if not applicable)

---

## B10: Button State Logic Tests

### B10.1: Bootstrap Button States

**Objective**: Verify Bootstrap button enable/disable logic.

**Test Cases**:
| Condition | Bootstrap Button State |
|-----------|----------------------|
| Tools not extracted | Enabled |
| Tools already extracted | Disabled |
| Bootstrap in progress | Disabled |
| Application busy | Disabled |

**Expected Results**: ✅ All states correct

**Pass/Fail**: ___

---

### B10.2: Install Button States

**Objective**: Verify Install button enable/disable logic.

**Test Cases**:
| Condition | Install Button State |
|-----------|---------------------|
| Bootstrap incomplete | Disabled |
| Bootstrap complete, not installed | Enabled |
| Already installed | Enabled (for upgrade/reinstall) |
| Installation in progress | Disabled |
| Application running | Disabled |

**Expected Results**: ✅ All states correct

**Pass/Fail**: ___

---

### B10.3: Start Button States

**Objective**: Verify Start button enable/disable logic.

**Test Cases**:
| Condition | Start Button State |
|-----------|-------------------|
| Bootstrap incomplete | Disabled |
| Not installed | Disabled |
| Installed and idle | Enabled |
| Installation in progress | Disabled |
| Application running | Disabled |

**Expected Results**: ✅ All states correct

**Pass/Fail**: ___

---

### B10.4: Stop Button States

**Objective**: Verify Stop button enable/disable logic.

**Test Cases**:
| Condition | Stop Button State |
|-----------|------------------|
| Idle | Disabled |
| Bootstrapping | Disabled |
| Installing | Enabled |
| Running | Enabled |

**Expected Results**: ✅ All states correct

**Pass/Fail**: ___

---

## B11: UI/UX Enhancements Tests

### B11.1: Confirmation Modal

**Objective**: Verify custom confirmation modal replaces window.confirm and functions correctly.

**Steps**:
1. In Advanced section, ensure "Wipe" checkbox is checked
2. Click "Install" button
3. Observe confirmation dialog appears

**Expected Results**:
- ✅ Modal overlay appears with semi-transparent background
- ✅ Modal displays AlertTriangle icon
- ✅ Modal shows confirmation message: "Are you sure you want to wipe the installation?"
- ✅ Modal has "Confirm" and "Cancel" buttons
- ✅ Clicking "Confirm" proceeds with installation
- ✅ Clicking "Cancel" dismisses modal and stops installation
- ✅ Clicking overlay background dismisses modal
- ✅ Modal has smooth fade-in and slide-in animations
- ✅ Modal appears responsive on smaller windows

**Pass/Fail**: ___

---

### B11.2: Version Panel Display

**Objective**: Verify Version panel displays git commit information correctly.

**Prerequisites**: Installation completed with commit history available

**Steps**:
1. After installation completes, observe Version panel in status area
2. Check displayed information

**Expected Results**:
- ✅ Version panel shows "Date" label with commit date (format: YYYY-MM-DD)
- ✅ Version panel shows "Commit" label with hash
- ✅ Commit hash is displayed in Consolas monospace font
- ✅ Commit hash is clickable link to GitHub commits page
- ✅ Version panel shows "Branch" label with branch name (e.g., "dev" or "master")
- ✅ If update available, shows "Update available" indicator
- ✅ Date and commit extracted from git metadata
- ✅ If git data unavailable, displays "N/A" gracefully

**Pass/Fail**: ___

---

### B11.3: Public/Network Configuration

**Objective**: Verify "Public" checkbox enables network access via --listen parameter.

**Steps**:
1. In Advanced section, locate "Public" checkbox
2. Leave unchecked and start application
3. Monitor terminal for --listen parameter
4. Stop application
5. Check "Public" checkbox
6. Start application again
7. Monitor terminal output

**Expected Results**:
- ✅ "Public" checkbox present in Advanced section
- ✅ When unchecked: launch command does NOT include "--listen"
- ✅ When checked: launch command includes "--listen" parameter
- ✅ Setting persists in sdnext.json config file
- ✅ Application starts and listens on network interfaces (not just localhost)
- ✅ Status panel remains unchanged
- ✅ Both unchecked and checked states function correctly

**Pass/Fail**: ___

---

## Test Execution Summary

### Phase A: Code Quality Tests

| Test | Status | Notes |
|------|--------|-------|
| A1: TypeScript Type-Checking | ___ | ___ |
| A2: ESLint + Stylelint | ___ | ___ |
| A3: Vite Build | ___ | ___ |
| A4: Package Integrity (Optional) | ___ | ___ |

**Phase A Overall**: ___

---

### Phase B: Runtime Tests

| Section | Tests | Passed | Failed | Notes |
|---------|-------|--------|--------|-------|
| B1: Bootstrap | 3 | ___ | ___ | ___ |
| B2: Config Persistence | 1 | ___ | ___ | ___ |
| B3: Installation | 8 | ___ | ___ | ___ |
| B4: Start/Launch | 5 | ___ | ___ | ___ |
| B5: Process Management | 4 | ___ | ___ | ___ |
| B6: Terminal/Logs | 6 | ___ | ___ | ___ |
| B7: UI/Theme | 5 | ___ | ___ | ___ |
| B8: Error Handling | 3 | ___ | ___ | ___ |
| B9: Paths/Directories | 3 | ___ | ___ | ___ |
| B10: Button States | 4 | ___ | ___ | ___ |
| B11: UI/UX Enhancements | 3 | ___ | ___ | ___ |

**Phase B Overall**: ___ / 45 tests passed

---

## Test Results

**Date Executed**: ___________  
**Tester**: ___________  
**Test Environment**: ___________  
**Overall Status**: ___________

### Critical Issues Found
_List any critical bugs or blockers here_

### Non-Critical Issues Found
_List any minor issues or improvements here_

### Recommendations
_List any recommendations for improvements or follow-up testing_

---

## Notes

- Phase A tests can be run quickly via npm commands
- Phase B tests require manual execution on Windows 10/11
- Some tests (B8.3, B9.3) may be skipped if not applicable to test environment
- Recommended to test on both Windows 10 and Windows 11 if possible
- Test with both light and dark system themes
- Allow sufficient time for installation tests (10-30 minutes per install)
