# Bulky Codebase Map

This file is the working ownership map for Bulky as it exists today. It is meant to reduce guesswork for both human developers and AI agents.

## Product Invariants

- Bulky is one Electron desktop app.
- Bulky is local-first.
- BYO SMTP remains core behavior.
- Main and renderer stay separated through IPC.
- Cloud-backed capabilities should layer on top of local workflows, not replace them.

## Runtime Shape

### Electron main process

- `main.js`
  App lifecycle, crash handling, SMTP/password helpers, tracking server bootstrap, scheduled campaign timers, service initialization, and IPC registration.
- `preload.js`
  The single renderer bridge. This file exposes page and feature APIs to the UI and is the contract surface between renderer and main.

### Local data layer

- `database/db.js`
  Still the largest persistence hotspot. It owns schema creation, migration handling, generic helpers, and remaining contact/campaign-heavy persistence.
- `database/repositories/`
  Feature repositories extracted from `db.js`:
  - `workflowRepository.js`
  - `growthRepository.js`
  - `supportRepository.js`
  - `analyticsRepository.js`
  - `aiMemoryRepository.js`

### Main-process feature registration

- `ipc/`
  Feature ownership is now mostly organized by domain:
  - `registerContactsHandlers.js`
  - `registerCampaignHandlers.js`
  - `registerMessagingHandlers.js`
  - `registerSmtpHandlers.js`
  - `registerSettingsHandlers.js`
  - `registerSupportHandlers.js`
  - `registerAutomationHandlers.js`
  - `registerBackupHandlers.js`
  - `registerContentHandlers.js`
  - `registerDataHandlers.js`
  - `registerOperationsHandlers.js`
  - `validators.js`

### Domain services

- `services/emailService.js`
  SMTP rotation, send execution, transporter management, send-state handling, tracking injection, unsubscribe header handling, and bounce parsing.
- `services/trackingService.js`
  Tracking URL generation, click wrapping, tracking base URL management, open/click/unsubscribe event logic, and bot/private URL safeguards.
- `services/verificationService.js`
  Contact verification workflows.
- `services/spamService.js`
  Content analysis and replacement tooling.
- `services/aiService.js`
  AI provider integration, diagnostics, and action support for the assistant.
- `services/serviceManager.js`
  Cross-service lifecycle and restart coordination.

### Renderer

- `renderer/src/App.js`
  Page host, shell composition, setup wizard gating, and page registration.
- `renderer/src/components/`
  Shared shell and reusable UI. Key ownership files:
  - `TitleBar.js`
  - `Sidebar.js`
  - `SidebarAssistant.js`
  - `GlobalSearch.js`
  - `NotificationCenter.js`
  - `ThemeContext.js`
  - `NavigationContext.js`
- `renderer/src/pages/`
  Primary workflow surfaces:
  - `Dashboard.js`
  - `Campaigns.js`
  - `Composer.js`
  - `Contacts.js`
  - `Templates.js`
  - `Analytics.js`
  - `Settings.js`
  - `Verify.js`
  - `SpamChecker.js`
  - `Blacklist.js`
  - `Automations.js`
  - `DripSequences.js`
  - `SignupForms.js`
  - `InboxPlacement.js`
  - `Guide.js`
  - `EngagementDashboard.js`
- `renderer/src/utils/`
  View-model and page-support utilities:
  - `dashboard.js`
  - `contentReadiness.js`
  - `deliverability.js`
  - `emailPreview.js`
  - `smtpAccounts.js`
- `renderer/src/hooks/useLiveDataRefresh.js`
  Shared data refresh contract for polling plus main-process push events.

## Current Hotspots

These are the files that still need the most care because they carry the most surface area or duplication risk:

- `main.js` — about 1,600 lines
- `database/db.js` — about 2,200 lines
- `renderer/src/index.css` — about 7,300 lines
- `renderer/src/pages/Settings.js` — about 2,600 lines
- `renderer/src/pages/Contacts.js` — about 2,000 lines
- `renderer/src/pages/Composer.js` — about 1,500 lines
- `renderer/src/pages/Campaigns.js` — about 1,300 lines

## Real Duplication/Drift Found

### Root-level clutter

Before this cleanup, the project root mixed:

- production docs
- renovation logs
- one-off UI/CSS repair scripts
- generated CSS audit reports
- a CSS backup file inside `renderer/src`
- old local smoke/build artifacts

These have now been reorganized into `docs/` and `tools/`.

### CSS drift

`renderer/src/index.css` remains the largest design hotspot. A quick simple-selector scan found roughly `723` selectors, with about `92` appearing more than once across dashboard, automation, chart, and card sections. That does not mean all are bugs, but it does confirm the CSS has accumulated layered overrides rather than a clean system structure.

### Page concentration

Several renderer pages still combine:

- data loading
- state orchestration
- inline transformation
- large JSX trees

That makes changes slower and increases regression risk.

## Recommended Structure Going Forward

### Keep active runtime code where it is

- `database/`
- `ipc/`
- `services/`
- `renderer/src/`
- `scripts/`

### Use `docs/` for non-runtime material

- blueprints
- phase logs
- release notes
- architecture maps

### Use `tools/` for manual maintenance helpers only

- one-off fix scripts
- CSS audit utilities
- generated maintenance artifacts

## Next Refactor Targets

These are the most valuable next structure improvements after this directory cleanup:

1. Split `renderer/src/index.css` into theme, shell, components, and page-level partials.
2. Continue extracting contact and campaign persistence out of `database/db.js`.
3. Break `Settings.js`, `Contacts.js`, `Composer.js`, and `Campaigns.js` into page containers plus smaller feature components.
4. Introduce a consistent `renderer/src/features/` pattern if page complexity keeps growing.
5. Keep all future scratch scripts out of the repo root; place them under `tools/` from the start.
