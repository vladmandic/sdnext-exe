# TASK-REBORN

You've already done all this, but then you completely ruined the codebase by trying to refactor so I had to revert to last stable commit and write requirements again.
Analyze all requirements, ask any questions or clarifications you might have and prepare a detailed implementation plan before you start coding.

- slow app startup: all checks should be done asynchronously and update ui accordingly
- bootstrap: remove overall progress, keep individual git/python progress bars
- install: use `--depth 1` for git clone to speed up cloning
- start: rename Start to Launch, update codebase so variables and methods are named accordingly
- launch: when i click launch, boostrap progress bar appears. launch has nothing to do with bootstrap.
- new button "Open browser" that opens the default browser to the specified url
  - after start button
  - disabled by default and if app is not running
  - during launch sequence monitor terminal output for "Local URL: " and enable button with the url
  - stopping app disables the button
- new button "Tutorial" next to options that opens a toast system with a step by step tutorial on how to use the app
  - use `sonner` library.
  - should have a "Don't show again" option that saves immediately user preference in `sdnext.log` and hides the tutorial on future startups. Prev/Next buttons. Automatically move to the next step in 10sec.
  - Steps:
    1. Click "Bootstrap" to unpack bundled Git and Python tols to be used by the app
    2. Verify "Options" are set correctly for your environment: GPU type, paths, startup options, etc.
    3. Click "Install" to download latest version of SD.Next and install requirements
    4. Click "Launch" to start the app
    5. Click "Open Browser" to open the app in your default web browser once it's running
    6. Click "Stop" to immediately stop the app if needed
    7. Monitor the terminal for progress: Logs are your friend! They will show you what's happening behind the scenes and help you troubleshoot if anything goes wrong.
    8. Click Copy/Download logs to save the terminal output for later reference or sharing with support
- ui:
  - update all colors to be pure grayscale except for error/danger/accent colors
  - cleanup css to use variables for repeated values and ensure consistency
  - create light theme from scratch
    - it should be exact inverse of dark theme, with light background and dark text/icons
    - make sure it covers all ui elements and states
    - do not change error/danger/accent colors
- new button "Switch theme" next to tutorial that switches between light and dark mode themes for the app
  - toggle button with sun/moon icons, on change save user preference in `sdnext.log` and apply on startup
