# SD.Next Installer/Launcher Task
Create a UI that serves as installer and launcher for a complex python application that requires multiple dependencies and configurations. The UI should allow users to easily select and configure the necessary components, while the launcher should handle the installation and setup process seamlessly. The application should be designed to be user-friendly and accessible to both technical and non-technical users, with clear instructions and support resources available. 

## Technical Requirements
- Platform scope: Windows 10/11 64-bit only
- Use `powershell` for all scripting and automation tasks
- Framework: `electron` with `react` and `typescript`
- Icons: `lucide-react`
- Terminal: `xterm.js`
- Lint: `eslint` for TypeScript and CSS
- Distribution model: Single exe
- Requires internet connection to download necessary dependencies and updates during installation.

## Paths
- Install path: default is `sdnext` subfolder relative to executable location, but user should be able to select custom path
- Binary path: `%INSTALLPATH%/bin`
- App path: `%INSTALLPATH%/app`
- Models path: default is `%APPPATH%/models`, but user should be able to select custom path

## Bundled Tools
- Bundle `nuget-git-2.53.0.zip` and `python-3.13.12.zip` with the application to ensure that users have all necessary tools without needing to install them separately.
- Zip packages for both are available in `/portable` folder and should be included in the application exe bundle.
- Instructions:
  - `/portable/nuget-git-2.53.0.zip` unpack to `%BINARYPATH%/git` and use execution path `%BINARYPATH%/git/git.exe`
  - `/portable/python-3.13.12.zip` unpack to `%BINARYPATH%/python` and use execution path `%BINARYPATH%/python/python.exe`
- Ignore any existing `git` or `python` installations on the user's system to ensure a consistent and controlled environment for the installation and launch processes.

## Startup Workflow
- Optimize for startup speed so UI displays as quickly as possible.
- Use application icon: `logo.png` for the installer/launcher window.
- Display logo: `sdnext.png` in top-left corner.  
- UI has following sections:
  - Main buttons:
    - **Bootstrap**: starts bootstrapping, disabled if git/python tools are available in expected paths, otherwise enabled. Bootstrapping process is one-time setup that unpacks bundled tools and prepares them for use in installation and launch processes. It should be a prerequisite for enabling Install and Start buttons.
    - **Install**: starts installation process, disabled if application is already installed or if bootstrap did not finish. Installation process includes cloning the repository, setting up the environment, and installing dependencies.
    - **Start**: starts the application, disabled if application is not installed or if bootstrap did not finish.
    - **Stop**: immediately terminates any running installation or application processes, disabled if application is not installing or running.
  - Status panel:
    - Tools: Python and Git versions if bootstrap completed and tools are available, otherwise "N/A"; GPU: Names of detected GPUs from system WMI query, or "No GPU detected"
    - Version: Installed app version or "N/A".  
      Version (date and commit hash) can be obtained using `git`.  
    - Status: "Idle", "Bootstrapping...", "Installing...", "Running...", "Error: <message>"
  - GPU Detection:
    - On startup, query system GPUs using Windows WMI command `Get-CimInstance Win32_VideoController`
    - Detect GPU vendor (NVIDIA, AMD, Intel, or unknown based on device name)
    - Display all detected GPUs in the Tools status chip
    - Auto-suggest compute backend based on detected GPUs: NVIDIA → CUDA, AMD → ROCm, Intel → Ipex, fallback to CPU if no compatible GPU detected
    - Show suggested backend as helpful hint near Compute Backend dropdown if suggested backend differs from current selection
    - If multiple GPUs detected, prefer NVIDIA or AMD over Intel in backend recommendation
  - Collapsible **Advanced** section with options
    - Checkbox: **Auto-launch**
    - Checkbox: **Upgrade** which allows users to upgrade to the latest version of the application.  
    - Checkbox: **Reinstall** which forces reinstallationof the application  
    - Checkbox: **Wipe** which forces deletion of existing installation and clean install (implies reinstall)  
    - Dropdown select: Compute backend: "nVidia CUDA", "AMD ROCm", "AMD Zluda", "DirectML", "Intel Ipex", "OpenVino", "CPU".  
      This will be passed as argument to python installer.  
    - Repository branch: Dropdown select with options "master", "dev" (default).
    - Install path
    - Models path
    - Custom "Parameters" (optional string value) that can be passed to the python process for advanced users.
    - Custom "Environment" (optional string value) that contains environment variables in the format `KEY=VALUE` separated by space
  - Terminal panel that displays real-time output from installation and launch processes
    - All options should be saved to `sdnext.json` and loaded on startup, allowing users to persist their preferences across sessions.

## Bootstrap Workflow
- Unpack bundled `nuget-git-2.53.0.zip` to `%BINARYPATH%/git`
- Unpack bundled `python-3.13.12.zip` to `%BINARYPATH%/python`
- Display progress and status messages in the status panel during the bootstrapping process, such as "Unpacking Git...", "Unpacking Python...", and "Bootstrap complete".
- Verify that `git` and `python` executables are available in expected paths after unpacking, and update status panel with their versions.
- If any errors occur during bootstrapping, display error message in status panel and disable Install and Start buttons until the issue is resolved.

## Installer Workflow
- A step-by-step installation wizard that guides users through the installation process.
- Options to specify which will be passed as arguments to the python installer:
- Installer process:
  - If wipe is selected, delete existing `%INSTALLPATH%` installation folder and all its contents before proceeding with installation.
  - Clone git repository <https://github.com/vladmandic/sdnext> into `%APPPATH%` subfolder
  - Change folder to `%APPPATH%` folder and checkout selected branch
  - Set environment variables specified in "Custom Environment" field.  
    Environment variables should be set for the duration of the installation process and should not affect the system environment variables permanently. However, they should propagate to any child process spawned during installation, including the final launched application.
  - if `%INSTALLPATH%/venv` folder does not exist, create python virtual environment in `%INSTALLPATH%/venv` using bundled `python-portable`. Make sure that `venv` module is available in the bundled Python distribution.
  - If `%INSTALLPATH%/venv` already exists, activate it using bundled `python-portable`.
  - Start `python launch.py --test --log install.log` with addtional command line arguments depending on user selection of advanced options:
    - **upgrade**` -> `--upgrade`
    - **reinstall**` -> `--reinstall`
    - **models directory**` -> `--models-dir <path>`
    - **cuda**` -> `--use-cuda`
    - **rocm**` -> `--use-rocm`
    - **zluda**` -> `--use-zluda`
    - **directml**` -> `--use-directml`
    - **ipex**` -> `--use-ipex`
    - **openvino**` -> `--use-openvino`
    - Pass any additional custom parameters as-is
  - Note: installation log will be saved to `%APPPATH%/install.log` and can be accessed by user after installation is complete.
  - Monitor the installation process and display real-time output in the terminal.
  - On failed installation, simply leave terminal open so user can see log.
  - After installation is complete, allow user to download and view installation log: `%APPPATH%/install.log`
- Do not use git pull or similar commands as update is done by python app itself when passed `--upgrade` argument, so the installer should only handle cloning and checking out the repository, while all update logic is handled by the python application itself.

## Start Features
  - Set environment variables specified in "Custom Environment" field
    Environment variables should be set for the duration of the installation process and should not affect the system environment variables permanently. However, they should propagate to any child process spawned during installation, including the final launched application.
  - Change to `%APPPATH%` folder and checkout selected branch
  - If `%INSTALLPATH%/venv` does not exist, show error message that application is not installed and prompt user to run installer first.
  - If `%INSTALLPATH%/venv` already exists, activate it using bundled `python-portable`.
  - Start `python launch.py --log sdnext.log` with specified arguments to launch the application:
    - `models directory` -> `--models-dir <path>`
    - if "Auto-launch" is checked, also pass `--autolaunch` argument to the python app
    - Pass any additional custom parameters as-is
  - Note: installation log will be saved to `%APPPATH%/sdnext.log` and can be accessed by user after installation is complete.
  - Monitor the launch process and display real-time output in the terminal.

## Terminal Features
- Both installer and launcher should have an integrated terminal that displays real-time output from the installation and launch processes, allowing users to monitor progress and troubleshoot any issues that may arise.
- Terminal should be embedded within the installer/launcher UI, providing a seamless experience for users without needing to open a separate command prompt window.
- Terminal should support basic features such as scrolling (to the start of the session), copying text, clearing terminal output, and downloading text log of the current session.
- Terminal must support ANSI color codes properly to display colored output from Python applications
- Execution uses pseudo-TTY (PTY) via `node-pty` to enable proper TTY detection in Python

## Content Tabs
- UI should provide tabbed interface for different content panels:
  - **Terminal Tab**: Primary tab showing real-time terminal output with xterm.js integration. Supports scrollback, copy, download, and clear operations.
  - **Docs Tab**: Embedded iframe displaying the SD.Next documentation website (`https://vladmandic.github.io/sdnext-docs/`) for easy access to help and guides.
  - **Changelog Tab**: Fetches and displays the CHANGELOG.md from the selected repository branch using GitHub's markdown rendering API. Includes a link to view the changelog directly on GitHub. Auto-refreshes when the repository branch selection changes.

## System Tray Integration
- Application should create a system tray icon with the following features:
  - Display current status in the tray context menu (Idle, Bootstrapping, Installing, Running, Error states)
  - Context menu options: Show window, Hide window, Exit application
  - Double-click tray icon to show/focus the main window
  - Status updates should propagate to the tray menu automatically
  - Icon uses logo.png from application resources

## Theme Support
- Application automatically detects and follows system color scheme preference (dark/light mode)
- Theme updates dynamically when system preference changes
- Both themes provide good contrast and readability with consistent styling

## Visual Enhancements
- **Bootstrap Progress Indicator**: Display visual progress bar during bootstrap process showing extraction stages (Initializing → Bootstrapping → Unpacking Git → Unpacking Python → Complete)
- **Logo Interaction**: Clicking the SD.Next logo in the header opens the SD.Next GitHub repository in the default browser
- **GPU Backend Suggestion**: When detected GPU vendor differs from selected compute backend, show helpful hint suggesting the recommended backend based on detected hardware

## Notes
- Install/launch should run with normal user privileges, without requiring administrator rights.  
- Python app has built-in auto-update mechanism
- No need to implement uninstaller as the installer can handle clean installation with "Wipe" option.
- Installer and launcher should be designed to be easily maintainable and extensible, allowing for future updates and improvements as needed.
- No plans to add support for other platforms, plugins or themes
- Do not attempt to pre-bundle the python app using `pyinstaller` or similar tools
- If install/launch process are closed, any running installation or application processes should be immediately terminated to prevent orphaned processes.

## UI
- Designed to be modern, clean, and user-friendly.
- Uses flat design principles with Noto-Sans font and Neumorphism-inspired elements to create a visually appealing interface that aligns with the SD.Next branding.
- Main colors are for dark theme: #478585 (highlights), #171717 (dark background), #212121 (light background), #d0d0d0 (text)
- Create light theme that is consistent with the dark theme and provides good contrast and readability.
- Provides both dark and light themes, with automatic detection based on system settings.
- Provide intuitive navigation and layout.
- All buttons have consistent sizing and spacing.
- Use icons for buttons.
- Should not show menu bar.
- Should be resizable, but resize only affect the terminal panel, while keeping the logo and indicators visible at all times.
- Support both light and dark themes, with automatic detection based on system settings.
- Use consistent styling and branding throughout the application, including the use of the SD.Next logo and color scheme.

## Testing

- run `typecheck` task to ensure that there are no TypeScript errors in the codebase
- run `lint` task and fix any linting errors or warnings
- run `build` task and verify that there are no Vite build errors
- run `dev` task and check for any runtime errors or warnings in the console
- do NOT run `package` task unless instructed as it takes long time

## Debug

- Application supports `--debug` command line parameter which:
  - Enables logging of all internal operations to console using `debugLog()` function
  - Automatically opens browser DevTools in detached mode for easier debugging and inspection
  - Logs include scope, message, and optional details for comprehensive debugging
- `npm run dev` automatically includes `--debug` parameter when starting the application in development mode
- Production builds (`npm run prod`) do not include debug mode by default
- Debug mode checks are performed via `isDebugEnabled()` function which inspects `process.argv` for the `--debug` flag
