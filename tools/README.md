# Bulky Tools

This folder holds developer-maintenance helpers that are not part of the shipped app.

## Structure

- `css-maintenance/`
  CSS audit, cleanup, and one-off dedupe helpers for `renderer/src/index.css`.
- `ui-oneoffs/`
  Targeted repair scripts created during UI/debug passes. These are historical helpers, not runtime dependencies.

## Important Rule

If a script in this folder is useful enough to become part of the normal workflow, it should move into `scripts/` and be wired into a documented command. Otherwise it stays here as a manual maintenance helper only.
