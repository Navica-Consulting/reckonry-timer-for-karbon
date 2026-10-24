# Handoff: Karbon Timer Tools

## Status
Build stage. v0.7.4 restyles nested preferences; v0.7.3 (after a 0.7.2 fix) connects to Karbon on install from Karbon's bootstrap cookie, with no Karbon tab and no first timer. The setup guide is down to three steps. It has not run on a live tenant yet. The project is now a git repository, with each released version tagged.

## Next step
Reload `unpacked/production` in Chrome. Open Preferences, then Troubleshooting, and read the Connection line: it says whether the background can reach Karbon's API without a tab. Then run one blank start, open a work item, and finish.

## Builds
- One source: `src/` in Max's project folder. Never edit the unpacked folders by hand.
- `build.sh` rebuilds `unpacked/production` (app2.karbonhq.com, the production candidate) and `unpacked/stage` (webapp-stage.karbonhq.com, never published) in place, so Chrome only needs Reload.
- It also writes versioned zips (store, stage, and source) to `dist/`, which git ignores.
- Git: commit each version and tag it `v<version>`. Release steps are in `docs/RELEASING.md`.
- Deleting files in the folder is off by default, so `build.sh` overwrites files and never removes them. A file dropped from `src/` must be removed from the unpacked folders by hand.

## Open threads
- Tab-free API calls: v0.7.2 checks once whether the background worker can call `{dataCenterUrl}/api/...` with the session cookie and no Karbon tab. If it works, the next step is moving reads (state, search, recents) and then actions to the background, with the tab as fallback (waiting on: Max's Connection line).
- Multiple tenants: the bootstrap cookie names the user's default tenant. A Karbon tab's URL still wins for that tab. Not tested with a user who works in several tenants (waiting on: a multi-tenant user).
- Blank start payload: the extension sends `entityPermaKey: null` and `entityLinkType: null`. Not yet compared with Karbon's own blank start (waiting on: live test).
- Required "None" values: the finish form treats a role or task type named "None" as empty when the firm requires one. Not tested on a firm with `isActorRequired` or `isTaskTypeRequired` on (waiting on: a firm with those settings).
- Adding a work item to a running blank timer, before stopping, would need the stopwatch `update` call with a new entity. Not captured, so not built (waiting on: Max, if wanted).
- Privacy policy: the hosted policy (effective 2026-10-23) predates the 0.7.2 `cookies` permission, the `*.karbonhq.com` host access, the stored firm name, and Chrome Sync of settings. Proposed edits are in `docs/PRIVACY.md`; the policy source is `docs/privacy-policy.md` (waiting on: Max).
- Store publishing: Max uploads to the Chrome Web Store by hand. Pushing a `v<version>` tag runs `.github/workflows/release.yml`, which builds and attaches the zips to a GitHub release. Automatic upload is on: a tag also uploads the store zip and submits it for review. Set up 2026-10-23 in Google Cloud project `reckonry-timer-for-karbon` with Workload Identity Federation, no key, and no cost. A manual workflow run read the store status successfully. The first real tag publish has not run yet (waiting on: Google to finish reviewing 0.6.1). Store and publisher IDs are in `docs/RELEASING.md`.
- Settings walkthrough: recommendations to add a "Your settings, explained" section to the setup guide, after moving `DEFAULTS` into a shared `src/defaults.js`, are in `artifacts/settings-walkthrough-review.md`. Not built (waiting on: Max).
- First store submission: Max uploaded 0.6.1 by hand (confirmed through the API), and it is waiting for Chrome Web Store review. A new version can't be submitted while one is in review. A scheduled task in the Claude app (`reckonry-send-074-after-approval`, every 3 hours) checks the review and, once 0.6.1 clears, moves the v0.7.4 tag to main (same source, but main has the workflow) and pushes it to publish 0.7.4 (waiting on: Google).
- Notes visibility: confirm whether time entry notes can reach invoices or client-facing reports, since auto-pause notes will be appended there (waiting on: nothing).
- Contractor terms: confirm a public extension that drives Karbon's UI does not conflict with the Karbon contractor agreement; collecting user emails and promoting Navica add to this question (waiting on: nothing).
- Trademark and listing name: check against the Karbon brand guide, which Max has (waiting on: nothing).
- Monetization model: not decided. Claude suggested launching free as a lead source for Navica, Reckonry, and Liminos, with a possible paid firm-admin tier later (waiting on: Max).
- Sign-in: not decided. Claude suggested guest-first with optional Google or Microsoft sign-in only when a server-backed feature needs it; Microsoft publisher verification would be needed first (waiting on: Max).
- Value exchange design: Claude drafted a ladder (breakage-alert email list at install, local value report before the week-one feedback ask, a concrete playbook offer with the newsletter invite, separate update and newsletter opt-ins); Max to review (waiting on: Max).

## Decisions
- Timer behavior and Preferences decisions are in `context/timer-behavior.md`.
- Capture session decisions are in `context/capture-session.md`.
- Growth and permission marketing decisions are in `context/growth.md`.
- 2026-10-23: Remove "Start your first timer" from setup entirely (Max).
- 2026-10-23: Keep one source (`src/`) and generate both unpacked builds from it (Max).

## Session log
### 2026-10-23, repository setup (Claude Code)
- Initialized git. Imported the 0.6.1 through 0.7.3 source zips as tagged commits, so history and diffs are available.
- Moved all zips to `dist/` and changed `build.sh` to write there. Added `.gitignore`, `README.md`, and `docs/` (releasing, privacy tracking, and the policy text).
- Reviewed the privacy policy against the code; gaps are listed in `docs/PRIVACY.md`.
- Connected the empty GitHub repository, Navica-Consulting/reckonry-timer-for-karbon, and pushed main with all version tags. Added the Release workflow and `scripts/cws-publish.sh`.
- v0.7.4: nested preferences restyled as a plain indent (see `context/timer-behavior.md`). Fixed the setup guide naming a "Logging" section that is now "Time entries."

### 2026-10-23, setup without Karbon session (Claude app)
- Found Karbon's readable `bootstrap-cookie-prod`: tenant, user profile key, and regional API host. Details are in `artifacts/capture-summary.md`.
- Confirmed the stopwatch and firm-settings reads work with only those values, before any timer is started. Captured `timeTrackingEntity: "WorkAndClients"`.
- Built v0.7.2: `cookies` permission and `https://*.karbonhq.com/*` host access; keys learned on install, browser start, and sign-in changes; a different user clears the last-used role and task type.
- Setup guide: three steps (pin, connect to Karbon, preferences). "Sign in to Karbon" shows only when no sign-in is found.
- Preferences, Troubleshooting: a Connection line reports whether tab-free calls work.
- Restored `src/` and `build.sh` to the project folder as the one source; `build.sh` now writes straight into both unpacked folders.
- v0.7.3: in Max's Chrome, 0.7.2 reported "not signed in" and did not recognize Karbon tabs. Cause: `page.js` only learned the user key from Karbon's own stopwatch fetch (the hidden reason for the first-timer step), and the background cookie read failed. Fix: `page.js` reads the keys from the bootstrap cookie and then Karbon's Ember session service, and passes them to the background; the background tries two cookie lookups and records why one fails. Both page sources verified on the live tenant.

### 2026-10-23, blank start session, part 2 (Claude app)
- v0.7.1: privacy policy linked in the Preferences footer and the setup guide.
- Preferences reorganized: a three-way no-timer choice (Auto-start, Remind me, Do nothing) with nested settings; Auto-switch as its own section with its own countdown; long-timer alert as a switch; the default work item removed.
- A persistent pop-up appears in Karbon when a blank timer is running and another item is opened, until answered.
- Set up `unpacked/production` and `unpacked/stage` in the project folder.

### 2026-10-23, blank start session (Claude app)
- Max found that Karbon starts a timer with no work, contact, role, or task type. This removes the quick-start blocker.
- Built v0.7.0: play with nothing chosen starts a blank timer; stop or switch with missing details pauses and opens a finish form.
- The finish form's values go into the time entry POST, so the stopwatch is never edited with an uncaptured call.
- Added the "!" badge while a timer waits to be finished, the end-of-day pause and notification for blank timers, and blank start on Alt+Shift+K.
- Tested in Chromium against a mock Karbon. No page errors.

### 2026-10-22, monetization session (Claude app)
- Discussed monetization options: free as a marketing lever, freemium, and a paid firm-admin tier; no model chosen.
- Max chose permission marketing through in-extension prompts over a login requirement.

### 2026-10-22, design and capture planning sessions (Claude app)
- Confirmed calling Karbon's internal web app endpoints from page-context scripts with the existing session; the websocket is the source of truth for timer state.
- Researched Chrome Web Store publishing: $5 registration, two-extension cap for new publishers, unlisted visibility for testing.

## Earlier summary
None.
