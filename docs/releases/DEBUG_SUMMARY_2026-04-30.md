# Bulky Debug Summary

Date: 2026-04-30
Version: 6.1.0

## Fixes Completed

- Repaired `renderer/src/pages/Dashboard.js` so the page is structurally complete again, its chart/activity/SMTP sections compile correctly, and all required icon/state/helper references resolve cleanly.
- Removed renderer lint noise caused by unused imports and dead variables in `renderer/src/pages/EngagementDashboard.js`, `renderer/src/components/EngagementCharts.js`, and `renderer/src/components/VirtualTable.js`.
- Added a repo-level `npm run lint` entry backed by `scripts/lint-codebase.js` to syntax-check main-process, preload, IPC, service, database, and renderer source files, then run renderer ESLint in a Windows-safe way.
- Updated Jest config in `package.json` to ignore `extracted_asar`, which prevents duplicate suite discovery and keeps the active codebase test run focused on the real workspace.
- Removed a duplicate IPC registration in `ipc/registerOperationsHandlers.js` that was aborting app startup before the tracking server could become healthy.
- Confirmed installer naming uses the versioned artifact pattern and built the `6.1.0` NSIS installer successfully.

## Verification Completed

- `npm run lint`
- `npm test -- --runInBand`
- `npm run build-react`
- `powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/smoke.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/smoke-packaged.ps1 -Build`
- `npm run dist`

## Build Artifacts

- Installer: `dist/Bulky-Email-Sender-Setup-6.1.0.exe`
- Blockmap: `dist/Bulky-Email-Sender-Setup-6.1.0.exe.blockmap`
- Unpacked app: `dist/win-unpacked/`

## Notes

- `electron-builder` still reports duplicate dependency reference warnings for transitive packages (`ajv`, `token-types`, `@napi-rs/canvas`). Packaging completed successfully; these are upstream dependency-tree warnings, not current build blockers.
- Electron/tooling also emitted deprecation warnings during build/smoke (`DEP0176`, `DEP0190`). They did not block linting, tests, smoke, or installer creation.
