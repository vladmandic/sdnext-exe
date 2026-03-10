2026-03-09 16:00: [Fix] [Main] Corrected renderer HTML path when packaged to respect app.getAppPath() (avoids ERR_FILE_NOT_FOUND on manual exe startup)
2026-03-09 16:15: [UI] Do not style bootstrap-required notice as an error; message no longer prefixed with "Error:" and renderer ignores it for red colouring.
2026-03-09 16:30: [UI] Bootstrap-required status now uses newline separator instead of pipe; renderer converts newline into <br/>s for multi-line display.
2026-03-09 16:45: [UI] Skip update check / "Checking updates..." when Git tool is unavailable; status defaults to up-to-date until Git returns.
2026-03-09 17:00: [Build] package:dir script now also zips the win-unpacked output into dist; adds `scripts/zip-dir.js` helper (named <name>-<version>.zip).
2026-03-09 17:15: [Build] Added `publish` npm script to bump patch version, build installer/dir and create a GitHub prerelease with both EXE and ZIP (requires `gh` CLI).
2026-03-10 10:00: [Feature] [Bootstrap] Honor configured installationPath when unpacking portable runtimes; binary/bootstrapping functions now parameterized and IPC/startup use config path.
2026-03-09 17:25: [Build] Make `package:exe` run `zip-dir.js` so the zip is recreated when only the exe is built (previously packaging exe removed existing zip).
