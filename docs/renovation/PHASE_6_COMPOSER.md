# Phase 6 Composer, Templates, and Content Workflow

Date: 2026-04-30
Phase status: Complete

## Goals

- make merge-tag handling predictable across authoring, preview, and saved content
- block obviously invalid template/campaign content before it spreads downstream
- align preview behavior more closely with what Bulky actually personalizes at send time

## Scope Completed

Primary files improved:

- `renderer/src/utils/contentReadiness.js`
- `renderer/src/utils/__tests__/contentReadiness.test.js`
- `renderer/src/pages/Composer.js`
- `renderer/src/pages/Templates.js`

## What Changed

Shared content workflow work:

- added a shared content-readiness utility for merge-tag support, preview token replacement, unsubscribe visibility checks, and deliverability-aware readiness summaries
- added renderer regression coverage for supported/unsupported tags, readiness blockers, and preview rendering

Composer work:

- composer now loads deliverability and SMTP context alongside templates/lists/contacts
- composer now surfaces readiness blockers/warnings inline instead of leaving content issues silent
- save-as-template and save-draft paths now reject unsupported merge tags before bad content is persisted
- preview rendering now uses the shared preview-personalization helper instead of ad hoc token replacement

Templates work:

- template save, import, and builder-save flows now reject unsupported merge tags
- template preview rendering now uses the same preview-personalization helper as Composer

## Why This Phase Mattered

Before this pass, Bulky’s authoring surfaces were letting unsupported tags slip into saved content and each page had its own partial preview logic. That made preview fidelity lower than it should be and pushed content problems too far downstream.

## Tests Added

- `renderer/src/utils/__tests__/contentReadiness.test.js`

## Verification

- `npm run lint`
- `npm test -- --runInBand`
- `npm run build-react`

## Next Phase

Phase 7 moves the same readiness discipline into campaign start behavior and live send preflight.
