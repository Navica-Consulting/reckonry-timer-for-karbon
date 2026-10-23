# Reckonry Timer for Karbon

Chrome MV3 extension for Karbon's timer, published by Navica LLC.

Project context lives in `claude/`: read `claude/CLAUDE.md` and `claude/handoff.md` first.
Settled decisions are in `claude/context/`, and Karbon's endpoints are in
`artifacts/capture-summary.md`. Writing style: no em dashes, Oxford comma, short plain sentences.

- Edit only `src/`. `./build.sh` writes `unpacked/production` (app2.karbonhq.com),
  `unpacked/stage` (webapp-stage.karbonhq.com), and zips in `dist/`. Never hand-edit the build
  output, and never publish the stage build.
- `build.sh` rewrites `config.js` (`KT_ORIGIN`) and the manifest's host permissions and content
  script matches per target, so change both together.
- Bump `version` in `src/manifest.json` for every build you hand over; tag releases `v<version>`.
- No dependencies, no bundler, plain JS. Shared styles in `src/ui.css`.
- Code style: short functions, terse comments that explain why, `$()`/`el()` helpers from `ui.js`.
- UI copy: plain, sentence case, no jargon. Notes on time entries never name other work items
  or clients, since descriptions can appear on invoices.
- Privacy: any change to permissions, host access, storage keys, or network calls needs the
  review in `docs/PRIVACY.md` (data inventory, `docs/privacy-policy.md`, store Privacy tab).
- Releases: `docs/RELEASING.md`.
