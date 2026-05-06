# Phase 7 Campaigns, Sending, SMTP, Warmup, and Deliverability

Date: 2026-04-30
Phase status: Complete

## Goals

- stop campaigns from starting when send-readiness is clearly broken
- reuse the same content/deliverability rules between authoring and launch
- make campaign preview behavior match the shared authoring preview path

## Scope Completed

Primary files improved:

- `renderer/src/pages/Campaigns.js`
- `renderer/src/utils/contentReadiness.js`

## What Changed

- campaign start now performs a preflight pass using live deliverability settings, SMTP account state, dashboard SMTP health, recipient counts, and shared content-readiness rules
- campaign launch now blocks on hard readiness failures instead of jumping straight into send attempts
- preflight warnings are surfaced before launch when the campaign can still proceed but the operator should know the risk
- campaign preview now uses the shared preview-personalization helper instead of its own partial replacement map

## Why This Phase Mattered

Campaign execution is where draft-quality issues become live deliverability problems. Before this pass, the launch flow only checked for SMTP presence and a non-empty contact set, which left several real readiness failures invisible until send time.

## Verification

- `npm run lint`
- `npm test -- --runInBand`
- `npm run build-react`
- source smoke
- packaged smoke

## Next Phase

Phase 8 closes the remaining public-facing engagement path by wiring signup forms through a real backend submission and confirmation flow.
