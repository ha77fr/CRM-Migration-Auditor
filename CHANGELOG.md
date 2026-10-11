# Changelog

## Unreleased

### Added

- Full React + Vite workflow: project creation, immutable CSV uploads, visual field
  and relationship contracts, audit history, execution polling/retry, report
  provenance/evidence inspection, and JSON/CSV downloads.
- Guided synthetic onboarding that submits the canonical example snapshots and
  contract through the real API; no canned findings or startup data injection.
- Local API/Swagger proxy with optional server-side API key configuration and
  a locked npm dependency tree.
- Multi-stage frontend container with nginx same-origin API routing, loopback
  Compose launch, and API readiness gating.
- Built-workspace Chromium checks against an isolated real backend and frontend CI.
- Actual application report screenshot and current workflow/architecture guidance.
- Eight-page interview preparation guide with a study path, construction walkthrough,
  demo checklist, technical answer outlines, and failure/scaling scenarios; supplied
  as a PDF and self-contained printable HTML.
- Standalone frontend design gallery with three interactive, responsive concepts:
  Atlas (light dashboard), Signal (dark console), and Fieldwork (guided review).
  Previews use synthetic data without API calls and do not replace the working app.

### Changed

- Applied the selected Atlas design to the working frontend. Synthetic gallery
  fixtures remain isolated from real persisted audit reports.
- Backend CI installs the exact tested base/development dependency lock.

### Fixed

- Keyboard skip link now focuses content without replacing the active hash route
  or discarding project draft state.
- Canonicalize route UUIDs so uppercase project links retain selectable datasets.
- Reject decimal tolerances outside normalized backend precision bounds in the
  contract preview, without JavaScript binary-float rounding.
- Preserve loaded immutable report evidence and filters when execution refresh
  fails, alongside the last-known-state warning.

## 0.2.0 - 2026-09-17

### Added

- Named parent dataset pairs and deterministic relationship verification, including explicit parent ID crosswalks and uncertainty findings for missing, duplicate, empty, or ambiguous parents.
- Authenticated, project-scoped JSON and spreadsheet-safe CSV report downloads. Exports include verdict, comparison and finding counts, truncation state, scope, input hashes, and relationship attribution.

### Changed

- Local setup uses a reproducible Python 3.14 virtual environment and the exact development dependency lock.

### Fixed

- Preserve leading and trailing whitespace in contract column selectors so exact
  CSV headers remain addressable.
- Require strict decimal cell syntax: implicit whitespace, underscores, and
  non-ASCII digits are invalid unless an explicit normalizer makes the value valid.
- Make readiness verify every required table and mapped column, detecting partial
  or outdated schemas.
