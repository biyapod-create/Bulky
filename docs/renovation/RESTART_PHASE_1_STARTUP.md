# Restart Phase 1 - Entry Flow and Startup State

Date: 2026-05-04

## Objective

Replace Bulky's old SMTP-only first-run check with a real startup flow that supports desktop account auth, setup wizard routing, and clean return to the main app.

## Completed

- Added a startup state machine in `renderer/src/App.js`
- Added a dedicated desktop auth shell in `renderer/src/components/DesktopAuthShell.js`
- Preserved the `auth -> wizard -> main app` flow
- Added a local-first continuation path when cloud account services are not configured
- Added account-status event propagation so sign-in, sign-up, sign-out, and refresh can move the app between auth and app states coherently
- Persisted the last active page in `renderer/src/components/NavigationContext.js`
- Shared plan copy through `renderer/src/config/accountPlans.js`

## Why It Matters

- First launch no longer depends on whether SMTP exists alone
- Session-aware startup behavior now matches Bulky's planned desktop account model
- Sign-out now has a real route back to the auth layer
- The main shell is no longer forced to carry anonymous and authenticated states at the same time

## Files

- `renderer/src/App.js`
- `renderer/src/components/DesktopAuthShell.js`
- `renderer/src/components/NavigationContext.js`
- `renderer/src/config/accountPlans.js`
- `renderer/src/features/settings/CloudServicesTab.js`
- `renderer/src/pages/Settings.js`
- `renderer/src/styles/features.css`
- `renderer/src/styles/features/auth.css`
