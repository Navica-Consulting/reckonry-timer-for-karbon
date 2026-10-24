# Handoff: Karbon Timer Tools

## Status
Build stage. v0.7.4 is the latest tag; 0.7.5 through 0.7.16 are committed to `main` but not tagged or pushed. 0.7.12 through 0.7.16 haven't run as a loaded extension yet: the settings page, editable timer card, and switch button (0.7.14); one form at a time and editable notes on the card (0.7.15); and the red discard confirmation (0.7.16). Commit `310c9e3` is labeled 0.7.15 but already carries the 0.7.16 manifest. The extension connects to Karbon on install from Karbon's bootstrap cookie, with no Karbon tab. It has not run on a live tenant yet. Version 0.6.1 is in Chrome Web Store review; 0.7.4 goes out automatically once that clears.

## Next step
Reload `unpacked/production` in Chrome. Open the stopwatch, then Preferences, then "All settings and help." Check the new page, and read the Connection line under Support: it says whether the background can reach Karbon's API without a tab. Then run one blank start. With the timer running, the panel should show only the timer card. In the card, set its work item, role, task type, and notes; each should save, or say plainly that Karbon didn't keep it. Press Swap with a field empty (it should bounce), then with all filled (it should save and start a blank timer). Then discard it: the first press should turn the button red, and the second should discard. Then finish.

## Builds and releases
- One source: `src/`. Never edit the unpacked folders by hand.
- `build.sh` rebuilds `unpacked/production` (app2.karbonhq.com, the production candidate) and `unpacked/stage` (webapp-stage.karbonhq.com, never published) in place, so Chrome only needs Reload. It also writes versioned zips to `dist/`. Git ignores both.
- `build.sh` overwrites files and never removes them. A file dropped from `src/` must be removed from the unpacked folders by hand.
- Git: GitHub repo Navica-Consulting/reckonry-timer-for-karbon, branch `main`. Every version is tagged `v<version>`.
- Releasing: bump the version, commit, and push a tag. The Release workflow builds, creates a GitHub release, uploads the store zip, and submits it for review. It signs in through Workload Identity Federation in Google Cloud project `reckonry-timer-for-karbon`, with no key and no cost. Details, IDs, and a read-only test are in `docs/RELEASING.md`.

## Open threads
- Signed out of Karbon: 0.7.19 hides the timer when Karbon is signed out and offers a Sign in button that opens Karbon's sign-in page. 0.7.21 removed the page warning and the automatic opens (Max). It treats a 401, or Karbon's sign-in page where data should be, as signed out; what Karbon really returns when signed out wasn't captured. Tested only with stubbed Chrome APIs (waiting on: a live sign-out test).
- First store submission: Max uploaded 0.6.1 by hand, and it is in review. A new version can't be submitted until it clears. A scheduled task in the Claude app (`reckonry-send-074-after-approval`, every 3 hours) checks the review and, once 0.6.1 clears, moves the v0.7.4 tag to `main` (same source; `main` has the workflow) and pushes it to submit 0.7.4. It reports back and tries to disable itself; if it keeps running afterward, turn it off in the sidebar (waiting on: Google).
- Privacy policy: the hosted policy (effective 2026-10-23) predates the 0.7.2 `cookies` permission, the `*.karbonhq.com` host access, the stored firm name, and Chrome Sync of settings. Proposed edits are in `docs/PRIVACY.md`; the policy source is `docs/privacy-policy.md` (waiting on: Max).
- Tab-free API calls: 0.7.18 runs every command from the background worker through `src/karbon.js`, shared with `page.js`. A Karbon tab is used only when Karbon can't be reached directly, and then an action reloads the tab or opens one. Max confirmed on 2026-10-24 that play works with Karbon closed and the Connection line reports tab-free timer changes. Search, recents, pause, stop, and the lock and day-end paths haven't been tried live without a tab (waiting on: Max's use).
- Settings and help page: built on 2026-10-23 from `artifacts/settings-page-plan.md` and committed in 0.7.14. The help copy and FAQ answers are Claude's drafts, and the version is now 0.7.14 after parallel sessions; the plan suggested 0.8.0 (waiting on: Max's review).
- Toolbar icon color: 0.7.5 lets the person pick a dark or light toolbar icon, in setup step 1 and in Preferences. No theme setting; pages keep following the system. 0.7.6 gives the manifest icons a white face and a thin white outline so they show on a dark extensions page. Details in `artifacts/theme-plan.md` (waiting on: Max's review).
- Work and Clients preferences: 0.7.7 gives contacts their own choice of Auto-start, Remind me, or Do nothing, with new settings `remindContacts` and `contactNudgeSeconds`. Max checked it in Chrome on 2026-10-23. Not tagged, so the scheduled 0.7.4 task isn't affected (waiting on: nothing).
- Multiple tenants: the bootstrap cookie names the user's default tenant. A Karbon tab's URL still wins for that tab. Not tested with a user who works in several tenants (waiting on: a multi-tenant user).
- Blank start payload: the extension sends `entityPermaKey: null` and `entityLinkType: null`. Not yet compared with Karbon's own blank start (waiting on: live test).
- Required "None" values: the finish form treats a role or task type named "None" as empty when the firm requires one. Not tested on a firm with `isActorRequired` or `isTaskTypeRequired` on (waiting on: a firm with those settings).
- Editing a running timer: 0.7.13 changes its work item, role, and task type from the timer card with the stopwatch `update` call, which was only captured for notes. Each edit is re-read and reported as failed if Karbon didn't keep it. Tested only against a stubbed panel. Committed in 0.7.14 (waiting on: a live test).
- Notes visibility: confirm whether time entry notes can reach invoices or client-facing reports, since auto-pause notes will be appended there (waiting on: nothing).
- Contractor terms: confirm a public extension that drives Karbon's UI does not conflict with the Karbon contractor agreement; collecting user emails and promoting Navica add to this question (waiting on: nothing).
- Trademark and listing name: check against the Karbon brand guide, which Max has (waiting on: nothing).
- Monetization model: not decided. Claude suggested launching free as a lead source for Navica, Reckonry, and Liminos, with a possible paid firm-admin tier later (waiting on: Max).
- Sign-in: not decided. Claude suggested guest-first with optional Google or Microsoft sign-in only when a server-backed feature needs it; Microsoft publisher verification would be needed first (waiting on: Max).
- Value exchange design: Claude drafted a ladder (local value report before the week-one feedback ask, a concrete playbook offer with the newsletter invite, separate update and newsletter opt-ins); Max to review. Max ruled out a breakage-alert list and marketing use of feedback emails on 2026-10-24 (waiting on: Max).
- Client and Work fields: 0.7.28 scopes Work to the chosen client by matching the client's name, since Karbon gives a work item's client by name only. It filters up to 25 results, so a common search term can miss some of that client's work, and a client group's work may not match. Capturing the call behind a client's Work tab in Karbon would make it exact. A client filled in from a work item gets its key by an exact name search (waiting on: a capture session).
- Feedback form: Send feedback opens a Google Form, uncommitted in 0.7.19. To do before release: turn off "Restrict to users in Navica LLC" in the form's settings, fix the "Pease add more details" typo, test the button in Chrome, give `docs/privacy-policy.md` a new effective date (the tag publishes it to timer.reckonry.ai), and remove the `feedback-preview` entry from `.claude/launch.json` (waiting on: Max).

## Decisions
- Timer behavior and Preferences decisions are in `context/timer-behavior.md`.
- Capture session decisions are in `context/capture-session.md`.
- Growth and permission marketing decisions are in `context/growth.md`.
- 2026-10-23: Remove "Start your first timer" from setup entirely (Max).
- 2026-10-23: Keep one source (`src/`) and generate both unpacked builds from it (Max).
- 2026-10-23: Publish to the store automatically from version tags, now that it has no Google Cloud cost (Max).

## Session log
### 2026-10-24, separate Client and Work fields (Claude Code)
- The panel's timer card, the start form, and the finish form now share one field (`pickField` in `ui.js`) for Client and for Work. Work-only firms get Work only.
- Clicking a chosen box searches again, and an x inside it clears it. The Change buttons and the work item's link to Karbon are gone.
- Work with no client searches all work and fills Client. With a client set, Work lists only that client's work. Switching or clearing the client clears Work.
- Work search results show only the client, without Karbon's "Assigned to" part.
- 0.7.22 through 0.7.28. Max confirmed 0.7.28 works in Chrome. Committed on its own, apart from the error-log work that shares the working tree.

### 2026-10-24, feedback form (Claude Code)
- Max chose a Google Form over a Karbon email draft. The draft plan is replaced in `artifacts/feedback-draft-plan.md`.
- Send feedback opens the form with the version and settings prefilled in its Logs field (`entry.1196218190`). The settings page keeps "Email us instead," the old `mailto:` link.
- Changed `src/prefs.js`, `src/welcome.html`, and `src/welcome.js`. Updated the privacy policy's Feedback section, the `docs/PRIVACY.md` inventory and review note, and `context/growth.md`.
- Checked with stubbed Chrome APIs: the link opens the live form with the details filled in, line breaks intact. Not submitted, and not tested as a loaded extension.
- Not committed. It shares the working tree and version 0.7.19 with the signed-out work, so commit these files on their own.

### 2026-10-24, consistent page cards and finish form in the panel (Claude Code)
- Toasts, the no-work-item prompt, and the sign-in warning in `content.js` share one card (`makeCard`) built from the panel's tokens, with a status pill. Light and dark follow the system.
- The finish form now opens in the toolbar panel via `chrome.action.openPopup()`, with the old window as a fallback. No new permission.
- The finish form matches the timer card: bordered card, 26px time, role and task type side by side, trash icon for Discard.
- Bumped to 0.7.20 and rebuilt. Tested in the browser pane with stubbed Chrome APIs (`cards-preview`). Not yet loaded in Chrome, so `openPopup` from a page prompt is untested live.

### 2026-10-24, signed out of Karbon (Claude Code)
- Max found the panel showing a running timer while Karbon was on its sign-in page.
- 0.7.19: a 401 or an HTML answer marks the browser signed out (`signedIn: false`). The panel then shows only "You're signed out of Karbon" and a Sign in button. The badge shows a red "!", and Karbon pages show a sign-in warning. Actions, the shortcut, notifications, and the finish form open Karbon's sign-in page in front. No background tab is opened while signed out.
- The heartbeat reads the stopwatch each minute while a timer shows or while signed out, so a sign-out or sign-in is noticed. A cookie removal also triggers a check. Privacy review added to `docs/PRIVACY.md`.
- Tested the panel and the page warning in the browser pane with stubbed Chrome APIs only.
- 0.7.21: Max dropped the page warning and every automatic open. Only the panel's Sign in button opens Karbon's sign-in page.

### 2026-10-23 and 24, Swap and Discard on the timer card (Claude Code)
- 0.7.14 asked "Save and switch, or Discard and switch?" from the start panel. Max rejected the two forms.
- 0.7.15 and 0.7.16: one form at a time. With a timer running, only its card shows, with Pause, Stop, Swap, and Discard icons in one row. Stop and Swap bounce empty required fields instead of opening the finish form, and focus stays on the button so the Work recents don't cover the red outline. Swap starts a blank timer with the last-used role and task type. Discard takes two presses; play then starts a new timer.
- Tested in the browser pane with stubbed Chrome APIs only.

### 2026-10-23, editable timer card (Claude Code)
- The running timer card keeps work item (or contact, where the firm allows contact time), role, and task type visible and editable. Missing required fields get a red outline (Max asked).
- New page command `edit` in `page.js`, using the stopwatch `update` call with a read-back check. The "None counts as empty" check moved to `ui.js` and is shared with the finish form.
- Recorded the decision in `context/timer-behavior.md`. No privacy review needed: no new permissions, storage keys, or destinations.
- Tested in the browser pane with stubbed Chrome APIs (`popup-preview` in `.claude/launch.json`, serving a scratchpad copy). Not tested on live Karbon.

### 2026-10-23, settings and help page (Claude Code)
- `welcome.html` is now one page: setup checklist, every setting with help, how it works, shortcuts, questions, and support. Chrome's Options menu opens it (`options_ui`).
- The panel's Preferences keeps Work, Clients, and Auto-switch, plus links to the page, feedback, and the privacy policy.
- New shared `src/defaults.js` and `src/prefs.js`; `background.js`, `content.js`, and `popup.js` no longer keep their own `DEFAULTS`. The panel and page follow each other's changes.
- Tested in the browser pane with stubbed Chrome APIs: saving, number limits, dimming, Changed tags, Reset, Restore all, panel and page in sync, phone width, light and dark. Not yet loaded as a real extension.

### 2026-10-23, new defaults and per-kind auto-switch (Claude Code)
- Max chose new defaults: work auto-start after 1 second, contact reminders on, contact auto-start wait 5 seconds, auto-switch on after 1 second, resume after a pause on, badge everywhere, toolbar icon for dark themes.
- Auto-switch is now two switches, Work and Clients, with new setting `autoSwitchContacts` (off by default).
- The new defaults reach existing users too, for any setting they never changed (Max). Bumped to 0.7.11 and rebuilt. Checked the Preferences panel with a stubbed browser page, not yet in Chrome.

### 2026-10-23, Work and Clients preferences (Claude Code)
- Split the no-timer preference into two groups, "Work" and "Clients," each with Auto-start, Remind me, or Do nothing and its own seconds.
- Contacts can now get a start reminder. Contact auto-start no longer depends on work-item auto-start.
- Added an upgrade step for 0.7.7 that keeps contact auto-start off where it was in effect off. Bumped to 0.7.7 and rebuilt.
- Updated the setup guide, the feedback email, the `docs/PRIVACY.md` inventory, and `context/timer-behavior.md`.
- Max checked it in Chrome. Committed 0.7.5 through 0.7.7 to `main`, untagged.

### 2026-10-23, repository and release setup (Claude Code)
- Initialized git, imported the 0.6.1 through 0.7.3 source zips as tagged commits, and pushed to the empty GitHub repo.
- Moved zips to `dist/`. Added `.gitignore`, `README.md`, a root `CLAUDE.md`, and `docs/` (releasing, privacy tracking, and the policy text).
- Reviewed the privacy policy against the code; gaps are in `docs/PRIVACY.md`.
- v0.7.4: nested preferences restyled as a plain indent. Fixed the setup guide naming a "Logging" section that is now "Time entries."
- Built the Release workflow and `scripts/cws-publish.sh`; set up Workload Identity Federation and the repository variables. A read-only run confirmed sign-in and showed 0.6.1 in review.
- Scheduled 0.7.4 to submit once 0.6.1 clears. Moved a settings review note from the project root into `artifacts/`.

## Earlier summary
- 2026-10-22: planned the extension and the capture session. Confirmed the extension can call Karbon's internal endpoints from the page with the existing session, and that the websocket is the source of truth for timer state. Chrome Web Store basics: $5 registration, two-extension cap for new publishers, unlisted visibility for testing. Max chose permission marketing through in-extension prompts over a login requirement; no monetization model yet.
- 2026-10-23, Claude app sessions: captured Karbon's timer, search, recents, contact, firm settings, and bootstrap endpoints (`artifacts/capture-summary.md`). Built v0.7.0 (blank start and the finish form), v0.7.1 (Preferences regrouped, privacy policy linked), v0.7.2 (account learned from the bootstrap cookie, three-step setup, Connection line), and v0.7.3 (keys read from an open Karbon tab when the cookie read fails, verified on the live tenant). Tested in Chromium against a mock Karbon.
