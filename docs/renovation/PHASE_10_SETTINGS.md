# Phase 10 Settings, Backup, Restore, and System Controls

Date: 2026-04-30
Phase status: Complete

## Goals

- remove hardcoded version drift from the Settings surface
- add real diagnostics for app, tracking, SMTP, DB, and AI state
- make the admin surface reflect actual runtime truth instead of stale copy

## Scope Completed

Primary files improved:

- `main.js`
- `ipc/registerSettingsHandlers.js`
- `preload.js`
- `renderer/src/pages/Settings.js`
- `ipc/__tests__/handlerValidation.test.js`

## What Changed

- added the missing `app:getVersion` IPC handler so the preload version bridge actually resolves
- added `settings:getDiagnostics` with database, tracking, SMTP, deliverability, backup-count, and AI summary data
- surfaced a new diagnostics panel in Settings
- replaced the stale hardcoded About version with the live app version

## Why This Phase Mattered

Before this pass, the renderer had a preload bridge for `app.getVersion()` but no matching main-process handler, and the About panel still reported an old fixed version string. That is exactly the kind of release-surface drift that undermines operator trust.

## Verification

- `npm run lint`
- `npm test -- --runInBand`
- `npm run build-react`

## Next Phase

Phase 11 uses the new shared readiness/diagnostics language to tighten renderer consistency.
