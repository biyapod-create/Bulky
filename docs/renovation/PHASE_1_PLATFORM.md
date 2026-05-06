# Phase 1 Platform Stabilization

Date: 2026-04-30
Phase status: Complete

## Goals

- clarify active IPC ownership
- remove stale parallel handler paths
- make `main.js` handler registration easier to reason about
- add regression coverage for startup-critical namespaces

## Decisions Made

### Active AI ownership

The active AI backend owner is:

- `ipc/registerSupportHandlers.js`

This file currently owns:

- spam namespace
- tracking IPC helper namespace
- active AI settings, chat, analysis, generation, action execution, and memory flows

The previously separate `ipc/registerAIHandlers.js` file was removed because it was:

- not wired into `main.js`
- overlapping with active AI channels
- using different assumptions and payload shapes
- a platform maintenance risk

### Automation-family ownership

The active owner for these namespaces is:

- `ipc/registerAutomationHandlers.js`

Namespaces owned there:

- `automation:*`
- `drip:*`
- `form:*`
- `abtest:*`
- `seed:*`

### Main-process registration layout

`main.js` registration is now grouped into explicit buckets:

- window handlers
- core data handlers
- content and messaging handlers
- platform support handlers
- settings and operations handlers
- automation feature handlers
- system handlers

This is still inside `main.js` for now, but the registration surface is less implicit and is ready for later extraction.

## Tests Added

- `ipc/__tests__/platformRegistration.test.js`

Coverage added:

- support-handler registration for active AI, spam, and tracking namespaces
- automation-handler registration for automation, drip, form, A/B test, and seed namespaces

## Remaining Phase 1 Work

- full module extraction of registration groups can now happen later from a cleaner baseline
- console/logging normalization remains a follow-up item for later phases

## Verification Completed

- `npm run lint`
- `npm test -- --runInBand`
- `npm run build-react`
- `powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/smoke.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/smoke-packaged.ps1 -Build`
