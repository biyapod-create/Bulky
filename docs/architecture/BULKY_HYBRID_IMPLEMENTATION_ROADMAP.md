# Bulky Hybrid Implementation Roadmap

Date: 2026-05-02
Based on: [BULKY_PRODUCTION_BLUEPRINT.md](C:/Users/Allen/Desktop/Bulky/BULKY_PRODUCTION_BLUEPRINT.md)
Goal: Evolve the current Bulky desktop app into one local-first product with plan-based cloud feature unlocks, without breaking the existing local workflow.

Package model baseline:

- `Freemium`: limited local tier with strict caps and no hosted features
- `Pro`: recurring full local + ongoing hybrid/cloud features
- `One-off`: full local + 12-month bundled hosted-service access

## Guiding Rules

- Bulky remains one desktop app.
- Local sending must keep working without Bulky Cloud.
- SMTP rotation must never be broken.
- Cloud features must be additive and capability-gated.
- Local data remains primary by default.
- No cloud dependency should be introduced for features that are currently local-only and stable.

## Delivery Strategy

Build this in 8 phases:

1. Entitlement foundation
2. Cloud configuration and environment model
3. Hosted tracking and unsubscribe
4. Automatic updates
5. Hosted forms
6. Billing, licensing, and plan enforcement
7. Multi-device sync
8. Cloud AI usage controls and production hardening

Security requirement across every phase:

- add explicit error handling paths
- add least-privilege access patterns
- add abuse controls for new public/cloud features
- add breach-response thinking before shipping

## Phase 1: Entitlement Foundation

Objective:
Add a capability model to Bulky without yet requiring any real cloud backend.

Files to touch first:

- [main.js](C:/Users/Allen/Desktop/Bulky/main.js)
- [preload.js](C:/Users/Allen/Desktop/Bulky/preload.js)
- [ipc/registerSettingsHandlers.js](C:/Users/Allen/Desktop/Bulky/ipc/registerSettingsHandlers.js)
- [ipc/registerSupportHandlers.js](C:/Users/Allen/Desktop/Bulky/ipc/registerSupportHandlers.js)
- [database/db.js](C:/Users/Allen/Desktop/Bulky/database/db.js)
- [renderer/src/App.js](C:/Users/Allen/Desktop/Bulky/renderer/src/App.js)
- [renderer/src/pages/Settings.js](C:/Users/Allen/Desktop/Bulky/renderer/src/pages/Settings.js)

New modules recommended:

- `services/entitlementService.js`
- `ipc/registerEntitlementHandlers.js`
- `renderer/src/components/EntitlementGate.js`
- `renderer/src/utils/entitlements.js`

Work:

- Define capability flags:
  - `can_use_statistics`
  - `can_use_cloud_tracking`
  - `can_use_hosted_forms`
  - `can_use_auto_updates`
  - `can_use_multi_device_sync`
  - `can_use_cloud_ai`
  - `max_monthly_sent_emails`
  - `max_contacts`
  - `max_campaigns`
  - `max_smtp_accounts`
- Seed the first concrete plan matrix:
  - Freemium: `max_monthly_sent_emails = 2000`, `max_smtp_accounts = 2`, no AI, no statistics, no hosted features
  - Pro: all local and all ongoing hosted features
  - One-off: all local and all hosted features for 12 months from activation
- Add local persistence for entitlement state
- Add preload namespace for entitlement queries
- Add renderer guards for cloud-only entry points
- Add safe local session/error storage rules
- Add entitlement tamper-detection and invalid-state handling
- Add a Settings screen section for:
  - plan name
  - auth key/license status
  - local-only vs hybrid status

Exit criteria:

- Bulky can run with `Free`, `One-off`, or `Pro` entitlement snapshots
- UI can disable premium cloud features without hiding local features incorrectly
- No cloud calls required yet

## Phase 2: Cloud Configuration and Environment Model

Objective:
Prepare the desktop app to understand Bulky Cloud endpoints safely.

Files to touch:

- [main.js](C:/Users/Allen/Desktop/Bulky/main.js)
- [preload.js](C:/Users/Allen/Desktop/Bulky/preload.js)
- [ipc/registerSettingsHandlers.js](C:/Users/Allen/Desktop/Bulky/ipc/registerSettingsHandlers.js)
- [renderer/src/pages/Settings.js](C:/Users/Allen/Desktop/Bulky/renderer/src/pages/Settings.js)

New modules recommended:

- `services/cloudConfigService.js`
- `renderer/src/utils/cloudConfig.js`

Work:

- Introduce configurable cloud base URLs:
  - `apiBaseUrl`
  - `trackingBaseUrl`
  - `updatesBaseUrl`
- Store environment mode:
  - `local`
  - `hybrid`
  - `staging`
  - `production`
- Add environment diagnostics panel in Settings
- Add health-check IPC endpoints for cloud connectivity
- Keep local fallback values explicit
- Add central cloud error classification and user-safe fallback messaging

Exit criteria:

- Desktop app can distinguish local-only mode from hybrid mode
- Cloud URLs are centrally managed, not hardcoded in multiple places
- Settings can show actual active endpoints

## Phase 3: Hosted Tracking and Unsubscribe

Objective:
Move public tracking and unsubscribe behavior to Bulky Cloud while preserving local analytics behavior.

Current local code anchors:

- [services/trackingService.js](C:/Users/Allen/Desktop/Bulky/services/trackingService.js)
- [services/emailService.js](C:/Users/Allen/Desktop/Bulky/services/emailService.js)
- [main.js](C:/Users/Allen/Desktop/Bulky/main.js)
- [renderer/src/pages/Dashboard.js](C:/Users/Allen/Desktop/Bulky/renderer/src/pages/Dashboard.js)
- [renderer/src/pages/Analytics.js](C:/Users/Allen/Desktop/Bulky/renderer/src/pages/Analytics.js)

Work in desktop app:

- Add tracking mode:
  - `local`
  - `cloud`
- Preserve local suppression rules for localhost/private tracking URLs
- Add sync/import path for hosted tracking events back into local analytics views
- Add explicit UI status:
  - tracking disabled
  - local tracking only
  - cloud tracking active
- Add rate-limit and abuse-aware handling for malformed or replayed tracking events

Cloud-side responsibilities:

- receive open events
- receive click events
- receive unsubscribe requests
- validate signed tokens
- enqueue and persist events
- reject malformed, abusive, or replayed requests

Recommended cloud pieces:

- Cloudflare Worker for public endpoints
- Cloudflare Queue for buffering
- Postgres for event storage

Exit criteria:

- Pro/hybrid users can send emails with public tracking links
- Local users still send safely without public tracking
- Dashboard and Analytics can consume cloud-tracked event data

## Phase 4: Automatic Updates

Objective:
Add real production update delivery without affecting local sending workflows.

Current anchors:

- [package.json](C:/Users/Allen/Desktop/Bulky/package.json)
- [main.js](C:/Users/Allen/Desktop/Bulky/main.js)
- [renderer/src/pages/Settings.js](C:/Users/Allen/Desktop/Bulky/renderer/src/pages/Settings.js)

New modules recommended:

- `services/updateService.js`
- `ipc/registerUpdateHandlers.js`

Work:

- Add `electron-updater`
- Add publish/update config
- Add update-check IPC handlers
- Add renderer update UI:
  - current version
  - check for updates
  - download status
  - restart to install
- Introduce staged rollout support later
- Add safe failure handling for corrupted metadata, unavailable feed, and signature mismatch conditions

Cloud/third-party:

- Host artifacts on `updates.bulkyapp.com`
- Use Cloudflare R2 or equivalent object storage
- Use CI to upload release assets and metadata

Exit criteria:

- Desktop app can detect and download updates
- Update logic is capability-gated if needed by plan
- Installer artifacts are published from CI

## Phase 5: Hosted Forms

Objective:
Convert signup forms from desktop-local assumptions into true public hosted form flows.

Current anchors:

- [main.js](C:/Users/Allen/Desktop/Bulky/main.js)
- [ipc/registerAutomationHandlers.js](C:/Users/Allen/Desktop/Bulky/ipc/registerAutomationHandlers.js)
- [renderer/src/pages/SignupForms.js](C:/Users/Allen/Desktop/Bulky/renderer/src/pages/SignupForms.js)
- [database/repositories/growthRepository.js](C:/Users/Allen/Desktop/Bulky/database/repositories/growthRepository.js)

Work in desktop app:

- Separate local form builder state from hosted publish state
- Add publish/unpublish workflow
- Add form URL/embed code based on hosted domain
- Add sync path for submissions back into the local app
- Add form submission validation, abuse/error handling, and duplicate/submission replay controls

Cloud-side responsibilities:

- public form submission endpoint
- optional double opt-in confirmation endpoint
- submission persistence
- callback/sync to desktop app or pull sync model

Exit criteria:

- Pro/hybrid users can publish real public forms
- Form submissions appear back in Bulky cleanly
- Local-only users can still design forms but not publish them publicly unless entitled

## Phase 6: Billing, Licensing, and Plan Enforcement

Objective:
Connect the entitlement system to real payment and account state.

Desktop anchors:

- [renderer/src/pages/Settings.js](C:/Users/Allen/Desktop/Bulky/renderer/src/pages/Settings.js)
- [preload.js](C:/Users/Allen/Desktop/Bulky/preload.js)
- new `services/entitlementService.js`

Cloud-side responsibilities:

- account creation
- auth key or activation flow
- Paystack webhook processing
- plan capability resolution
- device activation records

Recommended third-party:

- Paystack

Work:

- Add activation screen in Settings
- Add sign-in/activate flow
- Cache entitlement locally
- Add grace-period logic
- Add session/device revoke flow
- Add handling for invalid session, suspicious device, webhook delay, and entitlement mismatch conditions
- Enforce plan caps cleanly:
  - monthly sent email count
  - contact count
  - SMTP account count
  - cloud feature availability
  - statistics/AI availability

Exit criteria:

- A customer can buy/activate Bulky and unlock the correct feature set
- One-off buyers get local entitlements only
- Pro subscribers get hybrid entitlements

## Phase 7: Multi-Device Sync

Objective:
Introduce sync carefully without destabilizing local ownership.

Rule:

Do not attempt full-database sync first.

First sync candidates:

- entitlement/account state
- settings
- AI preferences
- hosted tracking summaries
- hosted forms state

Later sync candidates:

- campaigns
- templates
- contacts, if explicitly enabled

Desktop work:

- Add sync status UI
- Add conflict handling strategy
- Add manual sync control before background sync becomes aggressive
- Add sync error classes and safe retry rules
- Add data-conflict and auth-expiry recovery behavior

Recommended modules:

- `services/syncService.js`
- `ipc/registerSyncHandlers.js`
- `renderer/src/components/SyncStatus.js`

Exit criteria:

- Sync can be enabled without corrupting the local DB
- Users can understand what is synced and what remains local-only

## Phase 8: Cloud AI Usage Controls and Production Hardening

Objective:
Monetize and stabilize cloud-aware AI usage and the overall hybrid platform.

Current anchors:

- [services/aiService.js](C:/Users/Allen/Desktop/Bulky/services/aiService.js)
- [ipc/registerSupportHandlers.js](C:/Users/Allen/Desktop/Bulky/ipc/registerSupportHandlers.js)
- [renderer/src/pages/Settings.js](C:/Users/Allen/Desktop/Bulky/renderer/src/pages/Settings.js)

Work:

- Separate local AI provider configuration from cloud-account usage tracking
- Add usage/credit counters for cloud-managed AI plans
- Add observability:
  - cloud endpoint health
  - tracking failure rates
  - update delivery failures
  - licensing errors
- Add abuse protection and rate limits
- Add security monitoring for suspicious auth, tracking, and entitlement events

Exit criteria:

- Cloud AI usage can be measured and capped by plan
- Hybrid platform is observable enough for production support
- Hybrid platform has a clear security and incident-response baseline

## Cloud Buildout Sequence

### Cloud Step 1

- Domain and DNS
- `api`, `track`, `updates` subdomains
- Cloudflare DNS/proxy

### Cloud Step 2

- Postgres
- license tables
- tracking tables
- form submission tables

### Cloud Step 3

- Worker/API endpoints
- Queue buffering
- event persistence

### Cloud Step 4

- Paystack checkout
- webhook consumers
- entitlement issuance

### Cloud Step 5

- release artifact storage
- updater metadata
- CI/CD publishing

## Repo Milestones

### Milestone 1

Desktop entitlement-ready:

- local capability model exists
- settings can show plan state
- cloud-only controls are gated

### Milestone 2

Hybrid tracking-ready:

- public tracking service available
- desktop can consume hosted event data

### Milestone 3

Commercial-ready:

- licensing and subscriptions work
- updates work
- hosted forms work

### Milestone 4

Scale-ready:

- sync exists
- AI usage controls exist
- operational monitoring exists
- core security controls and incident handling are in place

## Recommended Order For This Repo

1. Entitlement foundation
2. Cloud configuration
3. Tracking/unsubscribe cloud mode
4. Updates
5. Billing/licensing
6. Hosted forms
7. Sync
8. Cloud AI controls

This order protects Bulky’s current strengths:

- local sending remains intact
- SMTP rotation remains untouched until strictly necessary
- commercial and cloud concerns stay layered on top of the proven desktop core

## Non-Negotiables During Implementation

- Never move SMTP credential handling to Bulky Cloud
- Never make local sending depend on Bulky Cloud
- Never tie basic app startup to a mandatory live cloud check
- Never break local-only customers while building hybrid features
- Never mix entitlement logic directly into random renderer pages; centralize it
