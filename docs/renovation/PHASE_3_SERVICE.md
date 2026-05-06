# Phase 3 Service Layer Hardening

Date: 2026-04-30
Phase status: Complete

## Goals

- make backend services more resilient under startup, shutdown, and failure conditions
- reduce hidden service lifecycle races
- add regression coverage around service recovery behavior

## First Hardening Slice

The first Phase 3 hardening target is:

- `services/serviceManager.js`

Scope improved:

- duplicate concurrent service starts are now coalesced
- scheduled retry timers are tracked instead of being fire-and-forget
- intentional stops now cancel pending retry restarts
- restart paths clear stale retry intent before starting again
- service disposal now clears retry timers and stops registered services cleanly
- service status now returns a stable `null` error state instead of `undefined`

## Why This Slice

This supervisor path affects the reliability of all registered backend services:

- `EmailService`
- `VerificationService`
- `SpamService`
- `TrackingService`
- `DomainHealthService`

Before this pass, a failed service could still restart after an intentional stop because retry timers were not owned or cancelled. Concurrent starts also had no guard, which could lead to duplicated `start()` calls for slow services.

## Tests Added

- `services/__tests__/serviceManager.test.js`

Coverage added:

- duplicate start suppression
- exponential retry scheduling
- retry cancellation on intentional stop
- dispose cleanup and state preservation

## Second Hardening Slice

The second Phase 3 hardening target is:

- `services/trackingService.js`

Scope improved:

- tracking event uniqueness now falls back to recipient email when `contactId` is missing
- unsubscribe requests now normalize email and reason values before validation and persistence
- non-HTTP redirect targets are normalized away before click logging
- engagement scoring now excludes bot traffic
- campaign tracking stats now exclude bot traffic from human metrics while still reporting bot event counts

## Why This Slice

Tracking data quality affects several downstream systems at once:

- click/open reporting
- dashboard and analytics accuracy
- AI deliverability summaries
- unsubscribe safety

Before this pass, missing `contactId` values could cause duplicate human events to be counted as unique, and service-level tracking summaries could mix bot traffic into engagement metrics even though the data-layer analytics path already separated it.

## Additional Tests Added

- extended `services/__tests__/trackingService.test.js`

Additional coverage added:

- unsubscribe normalization
- uniqueness fallback via tracked recipient email
- non-HTTP redirect rejection
- bot exclusion in service-level stats and engagement scoring

## Verification Completed For This Slice

- `npm run lint`
- `npm test -- --runInBand`
- `npm run build-react`
- `powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/smoke.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/smoke-packaged.ps1 -Build`

## Third Hardening Slice

The third Phase 3 hardening target was:

- `services/emailService.js`

Scope improved:

- pending internal wait/sleep operations now resolve cleanly when sending is stopped
- service state can now be captured and restored for safer lifecycle recovery
- progress callbacks are normalized so send paths do not rely on optional caller behavior
- stop/dispose paths now clear paused state and unblock pending waits instead of leaving them stranded

## Why This Slice

The send engine is one of the highest-risk parts of Bulky because it owns:

- campaign progress reporting
- SMTP rotation sequencing
- retry-adjacent timing behavior
- long-running in-memory state during live sends

Before this pass, internal waits could survive shutdown transitions and the service had no explicit way to expose/restore its operational state for recovery-oriented flows.

## Additional Tests Added

- extended `services/__tests__/emailService.test.js`

Additional coverage added:

- pending waits resolve when sending stops
- service state can be snapshotted and restored without losing key runtime flags

## Fourth Hardening Slice

The fourth Phase 3 hardening target was:

- `services/aiService.js`

Scope improved:

- API failures now surface clearer non-2xx error messages
- AI JSON parsing is more tolerant of fenced or prose-wrapped model responses
- structured generation and analysis flows now use shared response parsing helpers instead of duplicated ad hoc parsing
- template/content/chat parsing paths are less brittle under provider variation

## Why This Slice

AI is now embedded across content generation, analysis, and assistant actions. That means parsing instability can turn a good model response into a runtime failure even when the provider itself worked correctly.

Before this pass, several AI flows depended on optimistic JSON parsing assumptions and produced weaker error reporting when providers returned wrapped JSON or non-200 responses.

## Additional Tests Added

- extended `services/__tests__/aiService.test.js`

Additional coverage added:

- fenced/prose-wrapped JSON parsing for generated content
- clearer surfacing of upstream API failures

## Phase Completion Verification

- targeted regression suites for `serviceManager`, `trackingService`, `emailService`, and `aiService`
- `npm run lint`
- full-suite verification, renderer build, source smoke, and packaged smoke/build completed at phase close

## Next Phase

Phase 4 now takes over dashboard/reporting correctness and renderer/backend analytics alignment.
