# Bulky Restart Plan

Date: 2026-05-04
Baseline version: 6.1.0

## Goal

Complete a highly functioning, modern, stable Bulky build from the current local codebase, then validate and package it with the correct version stamp.

## Working Rules

- Work only from the current local code.
- Keep Bulky as one desktop app.
- Preserve local-first operation and BYO SMTP.
- Redesign and implement against Bulky's real features only.
- Treat every phase as a release-quality checkpoint with validation before moving forward.

## Phases

### Phase 0 - Restart Baseline

- Re-baseline the current local repo state
- Reconfirm version stamp and packaging state
- Lock a new execution sequence

### Phase 1 - Entry Flow and Startup State

- Replace the old SMTP-only first-run check with a real startup state machine
- Support `auth -> wizard -> main app`
- Keep sign-out and missing-session behavior coherent
- Preserve a local-first fallback when cloud auth is unavailable

### Phase 2 - Shared Shell and Theme System

- Tighten light and dark theme contrast
- Normalize shell density across title bar, sidebar, content columns, and empty states
- Keep the sidebar scroll model and AI slot stable

### Phase 3 - Core Work Surfaces

- Renovate Dashboard
- Renovate Campaigns
- Renovate Composer
- Renovate Contacts
- Renovate Templates and analytics surfaces

### Phase 4 - Tools, Settings, and Operational Depth

- Tighten Verify, Spam Checker, Inbox Placement, Forms, Automations, and Guide
- Finish Settings, account/profile, plan, and diagnostics surfaces
- Keep entitlement and account behavior aligned with the desktop flow

### Phase 5 - Stability, Security, and Release

- Run a full debug sweep
- Re-test tracking, SMTP, account, and renderer flows
- Validate lint, tests, build, smoke, packaged smoke, and installer output
- Confirm the final version stamp before packaging
