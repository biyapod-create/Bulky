# Phase 0 Baseline

Date: 2026-04-30
Version baseline: 6.1.0
Phase status: Complete
Next phase: Phase 1 - Platform Stabilization

## Current Working Baseline

The current repo baseline is able to pass:

- `npm run lint`
- `npm test -- --runInBand`
- `npm run build-react`
- `powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/smoke.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/smoke-packaged.ps1 -Build`
- `npm run dist`

The current installer artifact pattern is version-stamped correctly:

- `dist/Bulky-Email-Sender-Setup-6.1.0.exe`

## System Map

### Electron Main Process

- Entry point: `main.js`
- Responsibilities:
  - app lifecycle
  - BrowserWindow and tray
  - service bootstrap
  - tracking server bootstrap
  - IPC registration
  - cleanup

### Preload Layer

- Entry point: `preload.js`
- Exposes the `window.electron` API surface
- Current namespaces:
  - `app`
  - `contacts`
  - `tags`
  - `lists`
  - `blacklist`
  - `unsubscribes`
  - `templates`
  - `smtpAccounts`
  - `smtp`
  - `campaigns`
  - `email`
  - `verify`
  - `spam`
  - `tracking`
  - `settings`
  - `ai`
  - `stats`
  - `warmup`
  - `export`
  - `backup`
  - `system`
  - `segments`
  - `retry`
  - `deliverability`
  - `search`
  - `smtpTest`
  - `dns`
  - `automation`
  - `drip`
  - `form`
  - `abtest`
  - `seed`

### IPC Handler Modules

- `ipc/registerBackupHandlers.js`
- `ipc/registerCampaignHandlers.js`
- `ipc/registerContactsHandlers.js`
- `ipc/registerContentHandlers.js`
- `ipc/registerDataHandlers.js`
- `ipc/registerMessagingHandlers.js`
- `ipc/registerOperationsHandlers.js`
- `ipc/registerSmtpHandlers.js`
- `ipc/registerSettingsHandlers.js`
- `ipc/registerSupportHandlers.js`
- `ipc/registerAutomationHandlers.js`
- `ipc/registerAIHandlers.js` exists in tree but is not currently wired in `main.js`
- Shared validation lives in `ipc/validators.js`

### Services

- `services/emailService.js`
  - send engine
  - SMTP rotation behavior
  - content personalization
  - tracking/unsubscribe injection
- `services/trackingService.js`
  - open/click/unsubscribe handling
  - tracking URL generation
- `services/verificationService.js`
  - email verification flows
- `services/spamService.js`
  - spam analysis and replacement logic
- `services/aiService.js`
  - AI settings, provider integration, content generation, analysis, action support
- `services/domainHealthService.js`
  - DNS/domain health checks
- `services/serviceManager.js`
  - service lifecycle/recovery support
- `services/logger.js`
  - app logging
- `services/crashReporter.js`
  - crash reporting
- `services/functionRegistry.js`
  - AI/action-related registry support

### Database

- Primary data layer: `database/db.js`
- Current feature sections inside one large file:
  - contacts
  - contact-list assignment
  - contact tags
  - lists
  - tags
  - blacklist
  - unsubscribes
  - templates
  - SMTP accounts
  - campaigns
  - campaign logs
  - tracking events
  - spam replacements
  - settings
  - warmup schedules
  - dashboard stats
  - backup and restore
  - campaign resume
  - segments
  - retry queue
  - deliverability log
  - backup history
  - global search
  - export helpers
  - automations
  - automation logs
  - drip sequences
  - signup forms
  - form submissions
  - A/B tests
  - seed accounts
  - engagement analytics
  - AI memories

### Renderer Pages

- `Dashboard.js`
- `Analytics.js`
- `EngagementDashboard.js`
- `Contacts.js`
- `Campaigns.js`
- `Composer.js`
- `Templates.js`
- `Verify.js`
- `SpamChecker.js`
- `Blacklist.js`
- `Settings.js`
- `Automations.js`
- `DripSequences.js`
- `SignupForms.js`
- `InboxPlacement.js`
- `Guide.js`

## Feature Ownership Map

### Dashboard and Analytics

- UI:
  - `renderer/src/pages/Dashboard.js`
  - `renderer/src/pages/Analytics.js`
  - `renderer/src/pages/EngagementDashboard.js`
  - `renderer/src/components/RealtimeLineChart.js`
- IPC:
  - `ipc/registerOperationsHandlers.js`
- DB:
  - `database/db.js`

### Contacts, Lists, Tags, Blacklist, Unsubscribes

- UI:
  - `renderer/src/pages/Contacts.js`
  - `renderer/src/pages/Blacklist.js`
- IPC:
  - `ipc/registerContactsHandlers.js`
  - `ipc/registerDataHandlers.js`
- DB:
  - `database/db.js`

### Campaigns, Sending, SMTP, Warmup, Deliverability

- UI:
  - `renderer/src/pages/Campaigns.js`
  - `renderer/src/pages/Settings.js`
- IPC:
  - `ipc/registerCampaignHandlers.js`
  - `ipc/registerMessagingHandlers.js`
  - `ipc/registerSmtpHandlers.js`
  - `ipc/registerSettingsHandlers.js`
  - `ipc/registerOperationsHandlers.js`
- Services:
  - `services/emailService.js`
  - `services/verificationService.js`
  - `services/domainHealthService.js`
- DB:
  - `database/db.js`

### Composer and Templates

- UI:
  - `renderer/src/pages/Composer.js`
  - `renderer/src/pages/Templates.js`
  - `renderer/src/components/EmailEditor.js`
  - `renderer/src/components/EmailPreview.js`
  - `renderer/src/components/TemplateBuilder.js`
- IPC:
  - `ipc/registerContentHandlers.js`
  - `ipc/registerSupportHandlers.js`
- Services:
  - `services/spamService.js`
  - `services/aiService.js`
- DB:
  - `database/db.js`

### Tracking and Unsubscribe

- Main:
  - `main.js`
- IPC:
  - `ipc/registerSupportHandlers.js`
  - `ipc/registerSettingsHandlers.js`
- Services:
  - `services/trackingService.js`
  - `services/emailService.js`
- DB:
  - `database/db.js`

### Automations, Drip, Signup Forms, A/B Tests, Seed Accounts

- UI:
  - `renderer/src/pages/Automations.js`
  - `renderer/src/pages/DripSequences.js`
  - `renderer/src/pages/SignupForms.js`
  - `renderer/src/pages/InboxPlacement.js`
- IPC:
  - `ipc/registerAutomationHandlers.js`
- DB:
  - `database/db.js`

### AI

- UI:
  - AI-related controls are spread across `Settings.js`, `Composer.js`, templates, and `SidebarAssistant.js`
- IPC:
  - most AI-facing channels currently live in `ipc/registerSupportHandlers.js`
  - `ipc/registerAIHandlers.js` exists but is not yet wired into `main.js`
- Services:
  - `services/aiService.js`
  - `services/functionRegistry.js`
- DB:
  - AI memory/state in `database/db.js`

### Backup and Restore

- UI:
  - `renderer/src/pages/Settings.js`
- IPC:
  - `ipc/registerBackupHandlers.js`
- DB:
  - `database/db.js`

## Complexity Hotspots

The following files are large enough to be primary renovation targets:

- `renderer/src/pages/Settings.js` ~121 KB
- `renderer/src/pages/Contacts.js` ~80 KB
- `renderer/src/pages/Composer.js` ~67 KB
- `renderer/src/pages/Campaigns.js` ~60 KB
- `renderer/src/pages/Templates.js` ~57 KB
- `ipc/validators.js` ~60 KB
- `ipc/registerSupportHandlers.js` ~35 KB
- `services/verificationService.js` ~45 KB
- `services/emailService.js` ~41 KB
- `services/aiService.js` ~33 KB
- `services/spamService.js` ~32 KB
- `main.js` ~45 KB
- `database/db.js` monolithic, spanning most business data behavior

## Current Risks and Gaps

### Architecture

- `main.js` still owns too many responsibilities directly.
- `database/db.js` is a single-file repository for nearly every feature.
- `ipc/registerSupportHandlers.js` and `ipc/validators.js` are broad enough to hide ownership drift.

### Renderer

- Several feature pages are very large and likely hold mixed concerns:
  - state loading
  - presentation
  - feature logic
  - inline validation
- Shared renderer behaviors such as loading, empty states, and error reporting are not yet standardized across all pages.

### AI

- AI feature ownership is split between `registerSupportHandlers.js`, `aiService.js`, settings flows, composer/template flows, and `SidebarAssistant.js`.
- `registerAIHandlers.js` exists but is not part of the active main-process registration chain yet.
- AI should be treated as a first-class subsystem in later phases rather than a feature add-on.

### Testing

- Current automated coverage is good for validation-style checks and selected service/database areas, but not yet broad enough for all renderer feature journeys.
- No dedicated end-to-end feature smoke exists yet for:
  - automations
  - drip sequences
  - signup forms
  - inbox placement
  - AI interaction flows
  - backup/restore journeys

### Operational Signals

- Some `console.warn` and `console.error` usage remains in production code paths rather than fully centralized logging.
- `database/db.js` still contains placeholder logic, including a reply-count placeholder in analytics-related logic.
- Packaging still emits external dependency and Electron toolchain warnings, even though builds complete successfully.

## Phase 1 Worklist

Phase 1 should focus on platform stabilization, not feature redesign.

Recommended tasks:

1. Refactor `main.js` structure into clearer lifecycle sections or modules.
2. Audit active IPC channel ownership and document the intended owner for every preload namespace.
3. Decide the role of `ipc/registerAIHandlers.js`:
   - fold it into the active handler structure, or
   - remove/replace it if redundant.
4. Reduce duplicate error/logging styles across main process startup and cleanup.
5. Add focused startup/registration tests for critical IPC namespaces:
   - `automation`
   - `drip`
   - `form`
   - `seed`
   - `ai`
6. Tighten service bootstrap/cleanup boundaries so smoke runs are less sensitive to leftover runtime state.
7. Keep the installer build passing after every stabilization step.

## Phase 0 Exit Result

Phase 0 objectives are met:

- renovation checklist exists
- feature areas are mapped to source files
- main ownership boundaries are documented
- major hotspots and risks are identified
- next-phase stabilization targets are defined
