# Bulky System Renovation Plan

Date: 2026-04-30
Target baseline: v6.1.0
Goal: Renovate the entire Bulky codebase in controlled phases without skipping AI, dashboard, composer, contacts, campaigns, tracking, automations, forms, analytics, settings, packaging, or platform reliability.

Current status:
- Phase 0 complete
- Phase 1 complete
- Phase 2 complete
- Phase 3 complete
- Phase 4 complete
- Phase 5 complete
- Phase 6 complete
- Phase 7 complete
- Phase 8 complete
- Phase 9 complete
- Phase 10 complete
- Phase 11 complete
- Phase 12 complete

## Renovation Principles

- No blind rewrites. Every phase ends with tests, smoke checks, and a working app.
- No feature is considered "done" because it compiles; it must be functionally validated.
- No feature area is skipped just because it currently works; stable code should still be improved if it is brittle, duplicated, or hard to maintain.
- Main process, preload, renderer, services, and database boundaries must become clearer over time, not blurrier.
- Every phase must leave the installer buildable.

## Overall Success Criteria

- Stable startup and shutdown
- Reliable SMTP rotation and campaign sending
- Correct tracking, unsubscribe, analytics, and deliverability flows
- Consistent settings persistence and migrations
- Hardened AI workflows and action execution
- Clean lint, passing tests, source smoke, packaged smoke, and version-stamped installer builds
- Clear ownership of IPC channels and feature modules

## Phase 0: Baseline and Inventory

Objective: Freeze the current understanding of the system and define the measurable renovation targets.

Work:
- Inventory every feature area and its main files:
  - app lifecycle and Electron shell
  - preload and IPC namespaces
  - database layer
  - services
  - dashboard and analytics
  - contacts and lists
  - composer and templates
  - campaigns and sending
  - SMTP settings and warmup
  - tracking and unsubscribe
  - AI
  - automations and drip
  - signup forms
  - inbox placement and seed accounts
  - backup and restore
  - packaging and installer
- Document duplicate code, dead code, placeholder flows, and fragile ownership boundaries
- Identify every user-facing flow that must be validated by test or smoke coverage

Exit criteria:
- Renovation checklist exists
- All feature areas mapped to source files
- Known risks and missing test coverage listed

## Phase 1: Platform Stabilization

Objective: Make the app startup, shutdown, IPC registration, and service bootstrap predictable.

Work:
- Refactor `main.js` into clearer lifecycle sections or modules:
  - bootstrap
  - window/tray
  - services
  - tracking server
  - IPC registration
  - cleanup
- Ensure every IPC channel has one clear owner
- Eliminate duplicate handler registration risks
- Audit preload exposure in `preload.js` against registered IPC handlers
- Standardize error handling from main process back to renderer
- Harden cleanup paths for tray-close, quit, reload, and smoke runs

Exit criteria:
- App starts reliably from source and packaged builds
- No duplicate IPC registrations
- Preload namespaces match actual backend handlers
- Smoke checks remain green

## Phase 2: Data Layer Renovation

Objective: Make the database layer easier to trust, test, and evolve.

Work:
- Break up `database/db.js` into feature-oriented modules or internal repositories:
  - contacts
  - lists and tags
  - campaigns and logs
  - smtp and warmup
  - tracking and analytics
  - automations and drip
  - forms and submissions
  - seed accounts
  - settings and backups
  - AI memory/state
- Normalize serialization boundaries for JSON fields
- Add migration checks for new/old schema states
- Add more focused DB unit tests for each feature
- Validate rollback-safe write flows for imports, deletes, and batch operations

Exit criteria:
- DB logic has clearer feature ownership
- Migrations are safer and more test-covered
- No fragile hidden coupling between unrelated feature tables

## Phase 3: Service Layer Hardening

Objective: Make the core backend behavior robust under real workloads.

Work:
- Renovate services in `services/`:
  - `emailService.js`
  - `trackingService.js`
  - `verificationService.js`
  - `spamService.js`
  - `aiService.js`
  - supporting managers
- Make send/retry behavior more explicit and idempotent
- Ensure SMTP rotation remains protected as a core invariant
- Add better recovery around transient SMTP and IO failures
- Centralize tracking base URL logic and deliverability-sensitive behavior
- Add structured service-level diagnostics for operational debugging

Exit criteria:
- Services are less stateful in hidden ways
- Retry and recovery rules are explicit
- SMTP rotation behavior is test-protected
- Tracking and unsubscribe flows are stable

## Phase 4: Dashboard and Analytics Renovation

Objective: Make the reporting surface correct, fast, and trustworthy.

Work:
- Harden:
  - `renderer/src/pages/Dashboard.js`
  - `renderer/src/pages/Analytics.js`
  - `renderer/src/pages/EngagementDashboard.js`
- Move fragile calculations to backend selectors where appropriate
- Ensure empty, loading, partial, and error states are consistent
- Validate every dashboard card against real DB fixtures
- Improve chart consistency, readability, and performance
- Make analytics resilient to missing or partial tracking data

Exit criteria:
- Dashboard loads reliably
- Analytics values match backend truth
- No renderer-only logic silently diverges from data layer logic

## Phase 5: Contacts, Lists, Tags, and Imports

Objective: Make contact data management reliable at scale.

Work:
- Renovate:
  - `renderer/src/pages/Contacts.js`
  - contact/list/tag IPC handlers
  - import/export flows
- Add staged import flow:
  - parse
  - preview
  - validate
  - dedupe
  - commit
- Protect bulk operations with better validation and clearer user feedback
- Validate pagination and virtualization behavior
- Ensure lists, tags, and blacklist/unsubscribe interactions are consistent

Exit criteria:
- Large contact sets remain usable
- Bulk import errors are recoverable and understandable
- Contact mutations are safer and more transactional

## Phase 6: Composer, Templates, and Content Workflow

Objective: Make composing and previewing emails predictable and high quality.

Work:
- Renovate:
  - `renderer/src/pages/Composer.js`
  - `renderer/src/pages/Templates.js`
  - template/preview helpers
- Add stronger draft/autosave behavior
- Validate merge tags before send
- Align HTML preview, plain text, and final sent content
- Improve template builder integrity and block validation
- Integrate spam-check, unsubscribe, and tracking readiness into the authoring flow

Exit criteria:
- Users can compose confidently
- Preview output matches sent output closely
- Templates are easier to maintain and less fragile

## Phase 7: Campaigns, Sending, SMTP, Warmup, and Deliverability

Objective: Make the sending engine stable and operationally trustworthy.

Work:
- Renovate:
  - `renderer/src/pages/Campaigns.js`
  - SMTP settings flows
  - warmup flows
  - send scheduling
  - retry queues
- Protect SMTP rotation behavior with explicit regression coverage
- Improve progress reporting and campaign resume behavior
- Validate warmup schedules, limits, and deliverability history logic
- Add better preflight checks before a campaign can send
- Ensure failure states do not corrupt campaign logs or retry behavior

Exit criteria:
- Sending is stable across multiple SMTP accounts
- Warmup and deliverability tools behave predictably
- Resume/retry behavior is understandable and safe

## Phase 8: Tracking, Unsubscribe, Forms, Inbox Placement, and Seed Accounts

Objective: Make all engagement and post-send flows production-safe.

Work:
- Harden:
  - tracking server
  - unsubscribe handling
  - signup forms
  - inbox placement
  - seed account management
- Ensure form embed generation is correct and tied to the active tracking base URL
- Add backend support verification for any public-facing form submission flows
- Validate seed account CRUD and inbox placement reporting
- Add tests for open, click, unsubscribe, and health endpoints

Exit criteria:
- Tracking endpoints behave consistently
- Forms and seed features are wired end to end
- Deliverability tooling uses real data paths

## Phase 9: AI Renovation

Objective: Make AI a dependable subsystem instead of a sidecar.

Work:
- Renovate `services/aiService.js`, AI IPC handlers, and AI-facing renderer experiences
- Separate AI responsibilities:
  - settings/providers
  - content generation
  - content analysis
  - local analysis
  - action execution
  - memory/state
- Add strict validation for every AI action payload
- Improve AI failure handling and user feedback
- Prevent AI actions from mutating core data without safe validation
- Add tests for:
  - provider config
  - model selection
  - generation payloads
  - action execution
  - AI-assisted contact/campaign flows
- Review AI pages/components for UX quality, guardrails, and consistency

Exit criteria:
- AI features fail safely
- AI actions are test-covered
- Provider/model config is consistent and recoverable
- AI improves workflows instead of adding instability

## Phase 10: Settings, Backup, Restore, and System Controls

Objective: Make settings and admin flows reliable enough for real production use.

Work:
- Renovate `renderer/src/pages/Settings.js`
- Centralize settings schema and defaults
- Validate all persisted settings through shared validators
- Improve backup/restore integrity checks
- Add diagnostics panels for:
  - active tracking URL
  - tracking health
  - SMTP readiness
  - DB location/health
  - app version/build details
- Replace risky broad actions with scoped reset/repair tools where possible

Exit criteria:
- Settings persistence is trustworthy
- Backup/restore is verifiable
- Diagnostic visibility is much better

## Phase 11: Frontend UX Consistency Pass

Objective: Make the app feel like one coherent product instead of many screens built at different times.

Work:
- Normalize page shells, empty states, loading states, error surfaces, and toasts
- Reduce repeated inline logic across renderer pages
- Standardize tables, forms, modals, cards, and action bars
- Improve responsiveness and long-content behavior
- Remove inconsistent or placeholder microcopy
- Tighten styling drift between older and newer pages

Exit criteria:
- Pages behave consistently
- Core workflows feel more polished and predictable

## Phase 12: Release Engineering and Quality Gates

Objective: Make every release reproducible and safer.

Work:
- Keep repo-level `lint`, `test`, `build-react`, source smoke, packaged smoke, and installer build as mandatory gates
- Expand smoke coverage to feature journeys over time
- Build a repeatable release checklist
- Ensure version stamping is correct in app, tray, settings/about, and installer artifact names
- Reduce build noise where possible and document accepted external warnings

Exit criteria:
- Releases are predictable
- Installer builds remain version-correct
- Quality gates catch regressions before packaging

## Tracking Format For Execution

Each phase should track:

- Scope
- Files touched
- Risks
- Tests added
- Manual verification performed
- Remaining issues
- Decision notes

## Recommended Execution Order

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4
6. Phase 5
7. Phase 6
8. Phase 7
9. Phase 8
10. Phase 9
11. Phase 10
12. Phase 11
13. Phase 12

## Non-Negotiables

- Never break SMTP rotation.
- Keep main and renderer separation strict.
- Use IPC for all main-renderer communication.
- Do not let AI mutate critical data without validated backend actions.
- Every phase must end in a working app.
