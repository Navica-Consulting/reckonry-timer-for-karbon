# Karbon Timer Tools

## Purpose
A Chrome extension that extends the Karbon timer: start and stop, auto-switch to the open work item, auto-pause and auto-start as user preferences, and Pomodoro.

## Key constraints
- Timer start and stop is not in Karbon's public API, so the extension works through the Karbon web app UI.

## Conventions
- Handoff: `handoff.md` holds rolling status and the session log. Durable knowledge goes in `context/`, one topic per file. Outputs and exports go in `artifacts/`.
- Writing style: no em dashes; use the Oxford comma; short, plain sentences with headings and bullets for screen-reader readability.
- Source: `src/` in the project folder root is the only source. Run `build.sh` to rebuild `unpacked/production`, `unpacked/stage`, and the versioned zips in `dist/`. Never edit the unpacked folders by hand.

## Key files
- `handoff.md`: current status, next step, decisions, and session log.
- `../artifacts/capture-summary.md`: Karbon endpoints, payloads, and the bootstrap cookie.
- `../artifacts/settings-page-plan.md`: the plan behind the combined setup, settings, help, and support page (built 2026-10-23). It replaces `settings-walkthrough-review.md`.
- `../src/` and `../build.sh`: extension source and build script.
