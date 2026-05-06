# Bulky UI Renovation Plan

Reference direction:
- Behance inspiration: Email Marketing Automation SaaS | Web App UI UX

Goal:
- Renovate Bulky into a more cohesive, premium, analytics-first desktop product while preserving operator speed, information density, and reliability.

Non-negotiables:
- Keep desktop workflows fast for high-volume sending and diagnostics.
- Prefer responsive `auto-fit` / `minmax` grids and dense placement over layouts that create dead space.
- Preserve core Bulky utility: SMTP visibility, campaign control, contact throughput, deliverability awareness, and system diagnostics.
- Do not trade real functionality for purely decorative UI.

Phase 1: Shared Design System
- Unify spacing, card surfaces, gradients, borders, and page headers.
- Introduce responsive grid primitives that fill available width cleanly.
- Align title bar, sidebar, and main shell with the new visual language.

Phase 2: Dashboard Renovation
- Build a hero-style analytics landing page with stronger hierarchy.
- Group KPI cards, trend visualizations, activity, SMTP health, and deliverability guidance into cleaner sections.
- Remove layout drift caused by mixed old/new dashboard styles.

Phase 3: Workflow Pages
- Apply the same system to Composer, Campaigns, Templates, and Contacts.
- Standardize page intros, filter bars, section framing, and modal hierarchy.
- Tighten table + detail + action layouts for desktop-heavy usage.

Phase 4: Operations and Settings
- Bring Verify, Spam Checker, Inbox Placement, Automations, Signup Forms, and Settings into the same shell.
- Improve diagnostics framing and reduce visual inconsistency between utility pages.

Phase 5: QA and Refinement
- Verify responsiveness at common desktop widths and compact Electron windows.
- Re-run lint, tests, source smoke, packaged smoke, and installer build.
- Fix edge-case overflow, wrapping, and empty-space regressions.
