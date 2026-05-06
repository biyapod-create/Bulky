# Phase 8 Tracking, Unsubscribe, Forms, Inbox Placement, and Seed Accounts

Date: 2026-04-30
Phase status: Complete

## Goals

- make signup forms work end to end instead of only generating embed markup
- persist the full form configuration Bulky exposes in the renderer
- keep public-facing form submission and confirmation paths tied to the same tracked app runtime

## Scope Completed

Primary files improved:

- `main.js`
- `ipc/registerAutomationHandlers.js`
- `database/db.js`
- `database/repositories/growthRepository.js`
- `database/__tests__/db.migrations.test.js`

## What Changed

Signup-form work:

- added missing `signup_forms` schema support for `doubleOptin`, `confirmationSubject`, and `confirmationTemplate`
- added legacy-schema migrations so existing databases upgrade safely into the fuller form model
- tightened signup-form validation so forms must include at least one field and an email field
- upgraded generated embed code to expect JSON responses, handle redirects, and surface backend failures

Public endpoint work:

- added a real `POST /api/form/submit/:formId` submission route in the tracking/server layer
- direct opt-in submissions now create/update contacts, attach them to the target list, and persist submission history
- double opt-in submissions now persist pending records and send a confirmation email through the active SMTP stack
- added a `GET /confirm-subscription/:submissionId` confirmation route that validates a token, confirms the submission, activates the contact, and returns a human-readable confirmation page

## Why This Phase Mattered

Before this pass, the signup-form feature looked configured in the renderer but the generated endpoint path was not backed by the runtime server, and the database was not even storing all the fields the UI exposed.

## Tests Added

- extended `database/__tests__/db.migrations.test.js`

## Verification

- `npm run lint`
- `npm test -- --runInBand`
- source smoke
- packaged smoke

## Next Phase

Phase 9 hardens AI as an operational subsystem instead of just a feature surface.
