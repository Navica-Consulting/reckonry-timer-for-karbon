# Reckonry Timer for Karbon

Chrome MV3 extension for Karbon's timer, published by Navica LLC.

**MOTHBALLED 2026-11-19. Do no new work here.** Karbon said in writing that it does not approve the extension (internal endpoints and session cookies), which puts it outside its Terms of Use. The Chrome Web Store listing is unpublished, the Release and dependency upgrade workflows are disabled, `CWS_AUTO_PUBLISH` is `false`, and the endpoint check is off. The GitHub repo is public under MIT and archived (read-only), with a do-not-use warning at the top of `README.md`. To change anything, first run `gh repo unarchive Navica-Consulting/reckonry-timer-for-karbon`, and keep the warning. The rest of this file describes how the project worked.

Project context lives in `claude/`: read `claude/CLAUDE.md` and `claude/handoff.md` first.
Settled decisions are in `claude/context/`. The map of Karbon's internal endpoints
(`artifacts/capture-summary.md`) was removed when the repo went public. Writing style: no em dashes, Oxford comma, short plain sentences.

- Edit only `src/`. `./build.sh` writes `unpacked/production` (app2.karbonhq.com),
  `unpacked/stage` (webapp-stage.karbonhq.com), and zips in `dist/`. Never hand-edit the build
  output, and never publish the stage build.
- The landing page at timer.reckonry.ai is `site/`, deployed with the privacy policy by the
  Privacy page workflow. Keep it free of outside scripts, fonts, and analytics.
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
