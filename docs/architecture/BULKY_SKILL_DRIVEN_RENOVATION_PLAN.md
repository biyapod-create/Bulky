# Bulky Skill-Driven Renovation Plan

Date: 2026-05-02
Basis:
- [BULKY_PRODUCTION_BLUEPRINT.md](C:/Users/Allen/Desktop/Bulky/BULKY_PRODUCTION_BLUEPRINT.md)
- [BULKY_HYBRID_IMPLEMENTATION_ROADMAP.md](C:/Users/Allen/Desktop/Bulky/BULKY_HYBRID_IMPLEMENTATION_ROADMAP.md)
- `bulky-production-architect`
- `bulky-cloud-platform`
- `bulky-release-ops`
- `bulky-desktop-uiux`
- `bulky-deliverability-ops`

## 1. Renovation Objective

Renovate Bulky from a strong local-first desktop sender into a production-grade desktop product that:

- stays BYO-SMTP and local-first
- remains one installer and one codebase
- adds desktop login and plan-based feature unlocks
- layers cloud only where it is technically necessary
- modernizes the UI/UX without faking SaaS features
- becomes releasable, supportable, and commercially ready
- becomes secure by design with strong error handling and breach-resistance

## 2. Product Invariants

These do not change during renovation:

- Bulky stays desktop software
- Bulky stays one application
- SMTP credentials stay local
- SMTP rotation remains a protected core invariant
- local sending must keep working without Bulky Cloud
- local contacts, campaigns, templates, and operational data remain primary by default
- cloud is additive, not foundational

## 3. Renovation Streams

Bulky should be renovated across 7 parallel streams, even if implementation is phased.

Security and error handling must cut across every stream, not sit in a final cleanup phase.

### Stream A: Core platform and app architecture

Owners:
- [main.js](C:/Users/Allen/Desktop/Bulky/main.js)
- [preload.js](C:/Users/Allen/Desktop/Bulky/preload.js)
- [ipc](C:/Users/Allen/Desktop/Bulky/ipc)
- [services](C:/Users/Allen/Desktop/Bulky/services)

Goals:
- make all privileged behavior easier to reason about
- keep IPC ownership strict
- create central entitlement and cloud configuration services
- prevent cloud logic from leaking everywhere

Deliverables:
- `services/entitlementService.js`
- `services/cloudConfigService.js`
- `services/updateService.js`
- `services/syncService.js`
- `ipc/registerEntitlementHandlers.js`
- `ipc/registerUpdateHandlers.js`
- `ipc/registerSyncHandlers.js`

### Stream B: Local data and sync-safe modeling

Owners:
- [database/db.js](C:/Users/Allen/Desktop/Bulky/database/db.js)
- [database/repositories](C:/Users/Allen/Desktop/Bulky/database/repositories)

Goals:
- keep local DB as the operational source of truth
- prepare entities for optional sync instead of forced cloud ownership
- separate local entities from cloud metadata

Deliverables:
- local entitlement cache tables/settings
- local device/session state
- local sync cursor state
- tracking import tables or metadata fields for hosted tracking

### Stream C: Desktop login, plans, and entitlements

Owners:
- [renderer/src/App.js](C:/Users/Allen/Desktop/Bulky/renderer/src/App.js)
- [renderer/src/pages/Settings.js](C:/Users/Allen/Desktop/Bulky/renderer/src/pages/Settings.js)
- new auth/entitlement modules

Goals:
- let users log into Bulky on desktop
- unlock features by plan
- support free, one-off, and pro inside one app
- cache entitlements safely for offline local use

Deliverables:
- sign-in/activate flow
- plan status card in Settings
- local grace-period caching
- capability gating helpers and components

### Stream D: Hybrid cloud services

Owners:
- [services/trackingService.js](C:/Users/Allen/Desktop/Bulky/services/trackingService.js)
- [services/emailService.js](C:/Users/Allen/Desktop/Bulky/services/emailService.js)
- [renderer/src/pages/SignupForms.js](C:/Users/Allen/Desktop/Bulky/renderer/src/pages/SignupForms.js)
- cloud-facing services added later

Goals:
- add hosted tracking
- add hosted unsubscribe links
- add hosted forms
- add multi-device sync
- add cloud AI usage accounting

Cloud stack:
- Supabase
- Cloudflare
- Paystack

### Stream E: Deliverability and sending safety

Owners:
- [services/emailService.js](C:/Users/Allen/Desktop/Bulky/services/emailService.js)
- [services/trackingService.js](C:/Users/Allen/Desktop/Bulky/services/trackingService.js)
- [renderer/src/pages/Campaigns.js](C:/Users/Allen/Desktop/Bulky/renderer/src/pages/Campaigns.js)
- [renderer/src/pages/Settings.js](C:/Users/Allen/Desktop/Bulky/renderer/src/pages/Settings.js)

Goals:
- preserve SMTP rotation
- keep tracking safe and reputation-aware
- keep suppression and unsubscribe behavior reliable
- surface readiness and risk clearly in the UI

### Stream F: Desktop UI/UX system

Owners:
- [renderer/src/index.css](C:/Users/Allen/Desktop/Bulky/renderer/src/index.css)
- [renderer/src/components](C:/Users/Allen/Desktop/Bulky/renderer/src/components)
- [renderer/src/pages](C:/Users/Allen/Desktop/Bulky/renderer/src/pages)

Goals:
- create one coherent design system across all screens
- keep the UI dense, sharp, and desktop-native
- improve theming, grids, hierarchy, and page consistency
- keep all features real and operational

### Stream G: Release and production operations

Owners:
- [package.json](C:/Users/Allen/Desktop/Bulky/package.json)
- build scripts
- release docs
- CI later

Goals:
- make release quality repeatable
- add update delivery
- create production-quality diagnostics and supportability

### Cross-stream security program

Owners:
- local secret handling in desktop services
- auth/session handling modules
- cloud endpoint design
- release/update pipeline

Goals:
- strengthen error handling paths
- prevent secret leakage and unsafe cloud trust
- reduce abuse and breach surface
- prepare incident-response procedures before launch

## 4. Phased Execution Program

## Phase 1: Entitlement-Ready Desktop Core

Purpose:
Teach Bulky what a plan is before it ever depends on the cloud.

Work:
- add `entitlementService`
- define capability flags
- add entitlement IPC surface
- add `EntitlementGate` renderer component
- add concrete plan behavior:
  - Freemium with 2,000-email local cap, max 2 SMTPs, no AI, no statistics, and no hosted features
  - Pro with all local and ongoing hosted features
  - One-off with all local and all hosted features for 12 months
- add a Settings section for:
  - signed in / signed out
  - plan name
  - auth key status
  - feature availability
- add invalid entitlement, tamper, and session-error handling paths

Key files:
- [main.js](C:/Users/Allen/Desktop/Bulky/main.js)
- [preload.js](C:/Users/Allen/Desktop/Bulky/preload.js)
- [renderer/src/pages/Settings.js](C:/Users/Allen/Desktop/Bulky/renderer/src/pages/Settings.js)
- [renderer/src/App.js](C:/Users/Allen/Desktop/Bulky/renderer/src/App.js)

Outcome:
- one codebase can behave like Free, One-off, or Pro without branching the app

## Phase 2: Cloud Configuration Layer

Purpose:
Make cloud connectivity explicit, diagnosable, and optional.

Work:
- add cloud base URL config
- add environment mode config
- add diagnostics:
  - current `api`
  - current `track`
  - current `updates`
  - last successful remote check
- add failure-safe fallbacks
- add cloud error categories and user-safe recovery messaging

Outcome:
- Bulky can operate in local, staging, or production-hybrid mode cleanly

## Phase 3: Desktop Login and Account Session

Purpose:
Introduce desktop login with Supabase without breaking local-first behavior.

Work:
- sign-in UI
- session persistence
- logout/device revoke path
- local grace period
- connect plan and user identity to the desktop app
- secure local token/session storage
- suspicious-session handling

Cloud:
- Supabase Auth
- Supabase profile and entitlement tables

Outcome:
- users can sign into Bulky desktop and retrieve their plan state

## Phase 4: Hosted Tracking and Public Unsubscribe

Purpose:
Move public engagement endpoints out of the local machine.

Work:
- add cloud tracking mode
- preserve local tracking fallback logic
- route Pro users through hosted tracking URLs
- import/sync hosted events back into dashboard and analytics
- keep unsubscribe logic signed and abuse-resistant
- add rate limiting, replay resistance, and malformed-event handling

Cloud:
- Cloudflare Workers
- Cloudflare Queues
- Supabase/Postgres event storage

Outcome:
- public opens, clicks, and unsubscribe links become real production features

## Phase 5: Update Delivery and Release Channel

Purpose:
Make Bulky distributable with a reliable update path.

Work:
- add update service to desktop app
- add update status UI in Settings
- add release metadata fetching
- prepare staged rollout support
- add signature/failure/error handling for unsafe or corrupt update responses

Cloud:
- Cloudflare R2
- Cloudflare `updates.*` routing

Outcome:
- Bulky can check, download, and install updates from a controlled channel

## Phase 6: Paystack-Backed Billing and Plan Enforcement

Purpose:
Turn plans into enforceable product behavior.

Work:
- connect billing state to entitlement refresh
- process subscription and one-off purchase updates
- enforce:
  - monthly send caps
  - cloud feature access
  - plan caps
  - device limits
  - statistics/AI access
- add clear plan messaging in the app
- validate webhook-driven entitlement changes defensively

Cloud:
- Paystack webhooks
- Supabase subscription/entitlement tables

Outcome:
- feature unlocks now track payment state reliably

## Phase 7: Hosted Forms and Submission Sync

Purpose:
Turn the existing form concept into a real public acquisition flow.

Work:
- form publish/unpublish state
- public form submission endpoint
- optional confirmation flow
- pull submissions back into Bulky local contact workflows
- add form abuse protection, validation, and replay-safe submission behavior

Outcome:
- hosted signup forms become a real Hybrid feature instead of a desktop-only idea

## Phase 8: Realtime Sync

Purpose:
Add sync carefully, starting small.

First sync targets:
- session/account state
- entitlements
- hosted tracking summaries
- hosted form state
- AI preferences
- settings subsets

Later sync targets:
- templates
- campaign metadata
- contacts, only if explicitly enabled

Outcome:
- Bulky syncs without trying to cloud-mirror the entire local database on day one

## Phase 9: AI Productionization

Purpose:
Separate local AI behavior from cloud-account AI usage.

Work:
- distinguish local provider setup from cloud usage quotas
- add AI usage counters for paid plans
- add diagnostics for AI connectivity and model state
- keep AI failure-safe and non-destructive
- add security posture for API key handling and cloud quota misuse

Outcome:
- AI becomes commercially manageable without destabilizing the app

## Phase 10: Full UI/UX Renovation

Purpose:
Bring the whole app under one strong desktop design system.

Work:
- standardize shells, page headers, panels, cards, and table behaviors
- improve Dashboard, Campaigns, Contacts, Composer, Analytics, Settings, Signup Forms, and AI surfaces
- keep grids tight and responsive
- make dark/light themes exclusive and intentional
- keep the AI assistant present without overwhelming the layout
- remove decorative waste and fake SaaS patterns

UI requirements:
- real features only
- dense-but-readable
- strong keyboard/mouse workflow support
- consistent loading/empty/error states
- compact, useful charts and data views

Outcome:
- Bulky looks and behaves like a premium desktop operations product

## Phase 11: Deliverability Hardening Pass

Purpose:
Lock down sending safety before scale.

Work:
- verify SMTP rotation and failover behavior
- confirm warmup, suppression, blacklist, and unsubscribe protections
- validate tracking domain safety
- strengthen deliverability diagnostics
- expose campaign readiness and send risk better in the UI
- verify secure handling of tracking/auth/session edge cases

Outcome:
- Bulky becomes safer to run in production at real sending volume

## Phase 12: Release Engineering and Go-Live Operations

Purpose:
Make Bulky supportable after launch.

Work:
- release checklist
- signed artifact path
- packaged smoke rules
- cloud health diagnostics
- support telemetry
- rollback procedures
- installer/update compatibility checks
- incident-response checklist
- secret rotation checklist
- breach containment plan for cloud-backed features

Outcome:
- Bulky becomes a releasable and maintainable commercial desktop app

## 5. UI/UX Renovation Details

This part should follow the `bulky-desktop-uiux` skill directly.

### Shared design system

Add/normalize:
- spacing scale
- page container system
- action bar system
- data-card system
- KPI card system
- dense table system
- drawer/modal patterns
- consistent iconography and semantic color tokens

### Dashboard

Advance from a general stats page into a real operations overview:
- send performance
- SMTP health
- retry queue
- blacklist/suppression watch
- AI recommendations
- public tracking health

### Campaigns

Advance into a true operator surface:
- cleaner list density
- explicit progress and status rows
- visible scheduling/sending/retry state
- safer preflight/send readiness surfaces

### Contacts

Advance into a stronger local CRM/workbench:
- tighter bulk action workflow
- better import preview/validation
- clearer list/tag ownership
- denser but more readable data browsing

### Composer

Advance from editor-first to send-readiness-first:
- subject/content/preview coherence
- SMTP state visibility
- spam/tracking/unsubscribe readiness
- AI assist without blocking manual control

### Settings

Advance into a real command center:
- account and plan
- cloud mode and diagnostics
- SMTP diagnostics
- tracking diagnostics
- update diagnostics
- AI diagnostics
- backup/restore clarity

## 6. Cloud Architecture Details

This part should follow the `bulky-cloud-platform` skill directly.

### Supabase

Use for:
- login
- profile
- entitlements
- devices
- realtime sync
- hosted feature data

### Cloudflare

Use for:
- DNS
- public tracking endpoints
- public unsubscribe endpoints
- update artifact hosting
- edge protection

### Paystack

Use for:
- subscriptions
- one-off purchase
- recurring billing state
- billing-triggered entitlement changes

## 7. Release and Quality Model

This part should follow the `bulky-release-ops` and `bulky-deliverability-ops` skills directly.

### Always required before release

- `npm run lint`
- `npm test -- --runInBand`
- `npm run build-react`
- source smoke when relevant
- packaged smoke when relevant
- installer build when release-ready

### Added production gates

- entitlement regression checks
- hosted tracking smoke checks
- update channel smoke checks
- login/session failure checks
- offline local-mode checks

## 8. What the Advancements Are

This renovation produces major advancements across the product.

### Product advancements

- one app now supports Free, One-off, and Pro cleanly
- Bulky becomes commercially structured without losing its local-first identity
- Hybrid features become real services instead of conceptual placeholders
- Freemium becomes a real acquisition tier instead of an undefined “basic mode”
- One-off becomes commercially viable by bundling 12 months of hosted services instead of promising unlimited third-party cost forever

### Technical advancements

- explicit entitlement architecture
- explicit cloud configuration model
- safer separation between local core and cloud extensions
- production-ready update path
- sync-ready data model
- stronger diagnostics and observability
- stronger security posture across desktop, cloud, and billing boundaries
- better structured error handling and safer failure behavior

### User experience advancements

- cleaner, denser, more professional desktop UX
- better dark/light mode clarity
- tighter grids and less wasted space
- stronger visibility into send readiness, SMTP health, tracking health, and account state
- less confusion between local and cloud capabilities

### Deliverability advancements

- safer tracking domain behavior
- stronger unsubscribe and suppression integrity
- clearer warmup and SMTP readiness signals
- better operational confidence before sending

### Commercial advancements

- desktop login support
- real feature unlocks by package plan
- one-off purchase and subscription support
- cloud-only features aligned to paid value
- clear monetization boundary between limited local trial, recurring premium access, and bundled-premium ownership

### Operational advancements

- more repeatable release flow
- clearer production environment boundaries
- better support diagnostics
- future-ready foundation for staged rollout and scale
- incident-response readiness
- stronger secret, session, and abuse-control discipline

## 9. Execution Recommendation

If this renovation is executed seriously, the best order is:

1. Phase 1 through Phase 3
2. Phase 4 through Phase 6
3. Phase 7 through Phase 9
4. Phase 10 through Phase 12

That keeps Bulky stable while it grows:

- local core first
- account/entitlement second
- public cloud services third
- UI/UX modernization and hardening alongside those layers

## 10. Final Position

After this renovation, Bulky is no longer just a working desktop sender.

It becomes:

- a production-grade local-first desktop email operations platform
- with real login, plans, and premium unlocks
- with safe hosted tracking and update services
- with stronger deliverability protection
- with a modern, dense, desktop-native UI
- and with a realistic path to long-term commercial distribution
