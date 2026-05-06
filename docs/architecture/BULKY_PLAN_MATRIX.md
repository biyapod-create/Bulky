# Bulky Plan Matrix

Date: 2026-05-02
Purpose: Define the commercial capability model for one Bulky desktop application.

## Core Principle

Bulky is one desktop app with entitlement-based unlocks.

Plans:

- Freemium
- Pro
- One-off

## Freemium

Positioning:
- local-first trial tier
- enough to prove Bulky works
- intentionally limited so the upgrade path is clear

Recommended limits:

- up to 2,000 sent emails per billing cycle
- up to 2 active SMTP accounts in rotation
- no AI features
- no advanced analytics/statistics
- no hosted tracking
- no hosted forms
- no multi-device sync
- no cloud AI usage
- limited automation and premium deliverability tooling

Freemium should still include:

- local contact management
- local campaigns
- local composer
- local templates
- local sending
- basic blacklist/unsubscribe handling
- local backup/export basics

## Pro

Positioning:
- monthly premium operating tier
- includes all local and all ongoing hybrid/cloud-backed capabilities

Includes:

- full local Bulky capability
- unlimited or high-plan-cap SMTP rotation
- analytics and operational statistics
- AI features
- hosted tracking
- hosted unsubscribe
- hosted forms
- automatic updates
- multi-device sync
- cloud AI usage/account services
- premium diagnostics and deliverability tooling

## One-off

Positioning:
- premium purchase for users who want full Bulky ownership
- strongest local rights plus a bundled hosted-service window

Includes:

- full local Bulky capability
- analytics and operational statistics
- AI features
- full desktop feature unlocks
- hosted tracking, unsubscribe, forms, sync, updates, and cloud AI usage for 12 months

Recommended commercial interpretation:

- lifetime local desktop rights
- 12 months of included third-party/cloud services

After the bundled hosted-service term ends, the local rights remain, while hosted services can either:

- expire until renewed
- or convert to a paid annual cloud add-on

This protects Bulky from indefinite recurring third-party cost.

## Capability Flags

Recommended entitlement fields:

- `plan_code`
- `plan_name`
- `plan_mode`
- `can_use_local_sending`
- `can_use_multi_smtp`
- `can_use_campaign_scheduling`
- `can_use_advanced_automation`
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
- `max_devices`
- `hosted_service_expires_at`

## Recommended Entitlement Examples

### Freemium

- `plan_code = free`
- `can_use_statistics = false`
- `can_use_cloud_tracking = false`
- `can_use_hosted_forms = false`
- `can_use_multi_device_sync = false`
- `can_use_cloud_ai = false`
- `max_monthly_sent_emails = 2000`
- `max_smtp_accounts = 2`

### Pro

- `plan_code = pro`
- `can_use_statistics = true`
- `can_use_cloud_tracking = true`
- `can_use_hosted_forms = true`
- `can_use_multi_device_sync = true`
- `can_use_cloud_ai = true`
- `hosted_service_expires_at = null while active`

### One-off

- `plan_code = one_off`
- `can_use_statistics = true`
- `can_use_cloud_tracking = true`
- `can_use_hosted_forms = true`
- `can_use_multi_device_sync = true`
- `can_use_cloud_ai = true`
- `hosted_service_expires_at = purchase_date + 12 months`

## UX Implications

Bulky should clearly show:

- signed in / not signed in
- current plan
- local vs hybrid capability state
- hosted-service expiry for One-off
- blocked premium actions with clear upgrade messaging

Bulky should not:

- hide core local features behind vague paywalls
- invent separate editions of the app
- mix local and cloud states in a confusing way
