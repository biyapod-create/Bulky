# Phase 2 Data Layer Renovation

Date: 2026-04-30
Phase status: In Progress

## Goals

- reduce the monolithic `database/db.js` surface in low-risk slices
- create clearer feature ownership at the repository layer
- preserve behavior while expanding data-layer regression coverage

## First Extraction Slice

The first extracted repository is:

- `database/repositories/workflowRepository.js`

Scope moved out of `database/db.js`:

- automations
- automation logs
- drip sequences

`database/db.js` now delegates these methods to the workflow repository instead of carrying their SQL inline.

## Why This Slice

This block was a good first candidate because it is:

- cohesive
- relatively isolated from core contact and campaign data mutation paths
- already grouped together in `db.js`
- important enough to justify targeted regression tests

## Tests Added

- `database/__tests__/db.workflow.test.js`

Coverage added:

- automation CRUD
- automation log persistence and cleanup
- drip sequence CRUD
- serialized step persistence

## Second Extraction Slice

The second extracted repositories are:

- `database/repositories/growthRepository.js`
- `database/repositories/aiMemoryRepository.js`

Scope moved out of `database/db.js`:

- signup forms
- form submissions
- A/B tests
- seed accounts
- AI memory persistence

`database/db.js` now delegates these methods to the new repositories instead of carrying the SQL inline.

## Migration Hardening

This slice also fixed migration coverage gaps for legacy schemas.

Added migration support now covers missing runtime-critical columns such as:

- `contacts.verificationScore`
- `contacts.verificationDetails`
- `contacts.bounceCount`
- `contacts.lastBounceReason`
- `campaigns.batchSize`
- `campaigns.delayMinutes`
- `campaigns.totalEmails`
- `campaigns.sentEmails`
- `campaigns.failedEmails`
- `campaigns.startedAt`
- `campaigns.completedAt`

This matters because older DB files could initialize successfully but still fail later during normal contact or campaign writes.

## Tests Added

- `database/__tests__/db.growth.test.js`
- `database/__tests__/db.migrations.test.js`

Additional coverage added:

- signup form CRUD and submission cleanup
- form submission confirmation
- A/B test CRUD and significance calculation
- seed account active/inactive filtering
- both AI memory APIs against the same store
- legacy schema upgrade validation before normal CRUD

## Third Extraction Slice

The third extracted repository is:

- `database/repositories/supportRepository.js`

Scope moved out of `database/db.js`:

- tracking events
- spam replacements
- settings persistence
- warmup schedules
- backup history

This keeps the non-core support/config data paths out of the `db.js` class body while preserving the existing public DB API used by IPC handlers and services.

## Additional Tests Added

- `database/__tests__/db.support.test.js`

Additional coverage added:

- settings string and JSON persistence
- warmup schedule CRUD and serialized schedule storage
- tracking event persistence
- spam replacement CRUD
- backup history retention limit behavior

## Fourth Extraction Slice

The fourth extracted repository is:

- `database/repositories/analyticsRepository.js`

Scope moved out of `database/db.js`:

- campaign analytics selectors
- dashboard stats shaping
- AI deliverability snapshot selectors
- install date lookup
- engagement analytics period summaries

This keeps the read-heavy reporting logic out of the main DB class body while preserving the existing DB method surface used by the dashboard, analytics pages, tracking flows, and AI helpers.

## Additional Tests Added

- `database/__tests__/db.analytics.test.js`

Additional coverage added:

- campaign analytics with bot-vs-human event filtering
- A/B tracking rollups
- engagement analytics period totals and growth
- install date derivation
- deliverability snapshot warnings and recommendations

## Remaining Candidate Extractions

Likely remaining slices inside Phase 2:

- contact and campaign sub-repositories

## Verification Completed For This Slice

- `npm run lint`
- `npm test -- --runInBand`
- `npm run build-react`
- `powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/smoke.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/smoke-packaged.ps1 -Build`
