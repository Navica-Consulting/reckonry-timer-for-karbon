# Handoff: Karbon Timer Tools

## Status
Build stage. 0.7.35 is on `origin/main` (commit `e28f2e0`) and is the release candidate. The newest tag is `v0.7.32`; 0.7.33 through 0.7.35 are untagged. Max is testing 0.7.35 as an unpacked build on his Linux machine, starting 2026-11-05. Version 0.6.1 was in Chrome Web Store review as of 2026-10-24; whether it has cleared isn't recorded. The scheduled store submission task is disabled, and uploads are by hand. The privacy policy is live at https://timer.reckonry.ai/privacy (effective 2026-10-24).

## Next step
Max tests 0.7.34 (the setup probe waits for the bootstrap cookie) and 0.7.35 (toast dismiss X and Escape) in Chrome. Then check whether 0.6.1 cleared review. If it has, tag `v0.7.35`, upload `dist/reckonry-timer-for-karbon-0.7.35.zip` by hand, and paste `docs/store-privacy-tab.md` into the store's Privacy practices tab. Then use the store build on a live tenant, starting with the threads below that wait on a live test.

Also: 0.7.36 adds shortcut buttons (built, tested with stubbed Chrome APIs only, not committed). See the session log.

## Builds and releases
- One source: `src/`. Never edit the unpacked folders by hand.
- `build.sh` rebuilds `unpacked/production` (app2.karbonhq.com, the production candidate) and `unpacked/stage` (webapp-stage.karbonhq.com, never published) in place, so Chrome only needs Reload. It also writes versioned zips to `dist/`. Git ignores both.
- The stage build is the same extension pointed at Karbon's own stage environment. It is not a pre-release of the extension.
- Load unpacked takes `unpacked/production`, never `dist/` (zips only, no manifest). After a rebuild, click Reload on the extension, then refresh open Karbon tabs so they get the new content scripts.
- Two checkouts: Max's Karbon Mac (`Documents/Projects/Reckonry Timer for Karbon`, synced to OneDrive) and his Linux machine (`~/Documents/Dev Projects/reckonry-timer-for-karbon`, cloned 2026-11-05). GitHub is the only way to move code between them. The OneDrive connector can't read `.js` files. Pull before starting work on either machine.
- `build.sh` overwrites files and never removes them. A file dropped from `src/` must be removed from the unpacked folders by hand.
- Git: GitHub repo Navica-Consulting/reckonry-timer-for-karbon, branch `main`. Every version is tagged `v<version>`.
- Releasing: bump the version, commit, and push a tag. The Release workflow builds, creates a GitHub release, uploads the store zip, and submits it for review. It signs in through Workload Identity Federation in Google Cloud project `reckonry-timer-for-karbon`, with no key and no cost. Details, IDs, and a read-only test are in `docs/RELEASING.md`.

## Open threads
- Time entry rules (internal vs. client roles and task types, and a confirm step for time logged straight to a contact): planned on 2026-11-05 in `artifacts/time-entry-rules-plan.md`, then parked by Max as high effort for moderate gain. Most entry points (manual Add time, timesheet grid, edits) and the contact custom field calls are still not captured (waiting on: Max, if it comes back).
- Signed out of Karbon: 0.7.19 hides the timer when Karbon is signed out and offers a Sign in button that opens Karbon's sign-in page. 0.7.21 removed the page warning and the automatic opens (Max). It treats a 401, or Karbon's sign-in page where data should be, as signed out; what Karbon really returns when signed out wasn't captured. Tested only with stubbed Chrome APIs (waiting on: a live sign-out test).
- First store submission: Max uploaded 0.6.1 by hand, and it is in review. A new version can't be submitted until it clears. On 2026-10-24 Max chose to upload the next version by hand too, and the scheduled task `reckonry-send-074-after-approval` was disabled (not deleted). Draft justifications for `cookies`, `*.karbonhq.com`, and the other permissions are in `docs/store-privacy-tab.md` (waiting on: Google, then Max).
- Privacy policy: hosted on GitHub Pages at https://timer.reckonry.ai/privacy since 0.7.29, published from `docs/privacy-policy.md` on every version tag. The store listing points there. Effective 2026-10-24, with the feedback form and error log. It still doesn't cover the 0.7.2 `cookies` permission, the `*.karbonhq.com` host access, the stored firm name, or Chrome Sync of settings. Proposed edits are in `docs/PRIVACY.md` (waiting on: Max).
- Tab-free API calls: 0.7.18 runs every command from the background worker through `src/karbon.js`, shared with `page.js`. A Karbon tab is used only when Karbon can't be reached directly, and then an action reloads the tab or opens one. Max confirmed on 2026-10-24 that play works with Karbon closed and the Connection line reports tab-free timer changes. Search, recents, pause, stop, and the lock and day-end paths haven't been tried live without a tab (waiting on: Max's use).
- Settings and help page: built on 2026-10-23 from `artifacts/settings-page-plan.md` and committed in 0.7.14. The help copy and FAQ answers are Claude's drafts, and the version is now 0.7.14 after parallel sessions; the plan suggested 0.8.0 (waiting on: Max's review).
- Toolbar icon color: 0.7.5 lets the person pick a dark or light toolbar icon, in setup step 1 and in Preferences. No theme setting; pages keep following the system. 0.7.6 gives the manifest icons a white face and a thin white outline so they show on a dark extensions page. Details in `artifacts/theme-plan.md` (waiting on: Max's review).
- Work and Clients preferences: 0.7.7 gives contacts their own choice of Auto-start, Remind me, or Do nothing, with new settings `remindContacts` and `contactNudgeSeconds`. Max checked it in Chrome on 2026-10-23 (waiting on: nothing).
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
- Role and task type prefill: 0.7.32 fills them in the way Karbon's timer does, by the firm's prefill mode: last entry on the work item (the extension's own `workPicks` memory), then the work item's budget line (`estimateActualInfos`), then last used. Logic tested against a stubbed Karbon; the budget call confirmed live, read-only. The extension still learns "last used" from any running timer, so a budget prefill can become last used, which Karbon's own Last selected wouldn't do. Not loaded in Chrome yet (waiting on: Max's test).
- Feedback form: Send feedback opens a Google Form, committed in 0.7.30 and tested by Max locally. Confirm in the form's own settings that "Restrict to users in Navica LLC" is off and the "Pease add more details" typo is fixed, and remove the `feedback-preview` entry from `.claude/launch.json` (waiting on: Max).
- Error log and stale content scripts: 0.7.26 keeps the last 15 extension errors in `storage.local` (`errorLog`, in `src/errors.js`) and adds them to the feedback form's Logs field, the email draft, and Copy details. `content.js` now stops quietly after the extension reloads, instead of throwing "Extension context invalidated". Committed as 0.7.30 together with the feedback-form and finish-form changes that shared the working tree. Max tested it locally. 0.7.31 also cancels pending start, switch, and reminder waits when it stops Max tested 0.7.31 locally (waiting on: nothing).

## Decisions
- Timer behavior and Preferences decisions are in `context/timer-behavior.md`.
- Capture session decisions are in `context/capture-session.md`.
- Growth and permission marketing decisions are in `context/growth.md`.
- 2026-10-23: Remove "Start your first timer" from setup entirely (Max).
- 2026-10-23: Keep one source (`src/`) and generate both unpacked builds from it (Max).
- 2026-10-23: Publish to the store automatically from version tags, now that it has no Google Cloud cost (Max).
- 2026-10-24: Host the privacy policy on GitHub Pages at timer.reckonry.ai/privacy, republished on each version tag. The old Google Site links to it for older versions (Max).
- 2026-10-24: Skip 0.7.4. The first update after 0.6.1 is 0.7.30 (Max).
- 2026-10-24: Send 0.7.31 instead of 0.7.30 (Max).

## Session log
### 2026-11-05, shortcut buttons (Claude Code)
- Max asked for one-click buttons that carry a role and task type, to move one work item's time between stages like pre-session, session, and post-session.
- New `src/shortcuts.js` (storage and labels). The panel shows a Shortcuts row in the timer card and the start form, with an Edit link. The settings page has a Shortcut buttons card under Auto-switch. The TOC's keyboard link is now "Keyboard shortcuts" to avoid a clash.
- Behavior is recorded in `context/timer-behavior.md`. The one-minute fill-in rule is Claude's call, waiting on Max.
- Privacy review added to `docs/PRIVACY.md`: one new `storage.sync` key, no new permissions or calls.
- Built as 0.7.36. Checked in the browser pane with stubbed Chrome APIs: switch, fill-in on a fresh timer, fill-in on an empty one, and start with no timer. Not loaded in Chrome, not committed.

### 2026-11-05, Linux checkout and unpacked build (Claude Code)
- Max asked to make sure the extension is tracked. It already had this repo. The Mac had 0.7.33 through 0.7.35 built but not committed; Max pushed them from the Mac as `e28f2e0`.
- Cloned to `~/Documents/Dev Projects/reckonry-timer-for-karbon` on the Linux machine and ran `build.sh`. Chrome there is a Flatpak with access to `~/Documents`, so Load unpacked works from the project folder.
- Max loaded `unpacked/production` and is testing 0.7.35 (waiting on: Max's test of 0.7.34 and 0.7.35).
- No source changes. Nothing tagged or uploaded.

### 2026-10-24, toasts get a dismiss X (Claude Code)
- Max asked for a way to dismiss toasts. 0.7.35: every toast has an X at the top right, and Escape closes it while focus is in the toast. Both act like Cancel or Not now, so a countdown doesn't fire and a dismissed reminder stays dismissed for that item. The finish prompt is unchanged, since it waits for an answer by design.
- Built, not committed, and not tested in Karbon (waiting on: Max's test, together with the 0.7.34 probe check).

### 2026-10-24, setup page looks for Karbon in a background tab (Claude Code)
- Max reported that the setup page doesn't see Karbon when it first loads, and asked it to check in a background tab instead of asking the person to sign in.
- 0.7.33: when step 2 finds no account, the page asks the background once per visit (`probeKarbon` in `background.js`). It opens Karbon's home page in an unfocused tab, waits until the account is known, the tab reports signed out, or about 15 seconds pass, then closes the tab. The step says "Looking for your Karbon sign-in." and hides Sign in meanwhile.
- No privacy review needed: no new permissions, storage keys, destinations, or data read. The step's help text says it may open a background tab.
- Max tested 0.7.33: the tab opened and closed quickly and found Navica LLC, but the Connection line said "Account read from a Karbon tab; cookie: url: 3 cookies; domain: 14 cookies".
- Checked cookie names in Max's Chrome (names only): `bootstrap-cookie-prod` is present on `.karbonhq.com`, not partitioned, with a 7-day life that a page load doesn't renew. So the read logic matches. Most likely the cookie had expired and the probe closed the tab before Karbon wrote it again.
- 0.7.34: the probe now waits for the cookie, or up to about 4.5 seconds after the page reports keys. Built, not committed, and not loaded in Chrome (waiting on: Max's test, which should then show no "Account read from a Karbon tab").

### 2026-10-24, 0.7.32 release prep (Claude Code)
- Max chose to upload by hand. Disabled the scheduled task, and the Release workflow now uploads to the store only when `CWS_AUTO_PUBLISH` is `true` (unset).
- Drafted the Privacy practices tab text, with justifications for `cookies` and `*.karbonhq.com`, in `docs/store-privacy-tab.md`.
- Pushed `main` and tagged `v0.7.32` for the GitHub release and the policy page. The store upload is Max's, once 0.6.1 clears.

### 2026-10-24, role and task type prefill (Claude Code)
- Max asked to find the call behind Karbon's timer prefill. It's Karbon's own logic, read from its app code, with one server call. Details in `artifacts/capture-summary.md` under Prefill.
- `prefill` command in `src/karbon.js`; `start` uses it when no role or task type is given. The background adds the per-work memory, last used, and list keys (`withPrefill`), and records each saved work item's role and task type (`onSaved`, relayed from Karbon tabs too).
- The start form, timer card, and finish form apply a work item's own role and task type when you pick it. The page, shortcut, and Swap starts prefill in the background.
- Privacy review in `docs/PRIVACY.md`; the policy names the new memory. Built as 0.7.32, since main took 0.7.31. Merged into local `main` for testing, not pushed.

### 2026-10-24, stale content script waits and 0.7.31 (Claude Code)
- Max reported "Extension context invalidated" at `content.js:153`. That line is the route loop's `chrome.storage.sync.get` in 0.7.29, so it came from an old script left in a tab, which 0.7.30 already handles.
- 0.7.30 still let pending waits (settle, auto-start, auto-switch, reminder) fire after it stopped. 0.7.31 clears them when it stops, and each wait checks `chrome.runtime.id` before acting.
- Max made 0.7.31 the store candidate. Pushed to `origin/main`, not tagged, and pointed the scheduled task at `v0.7.31`. Max then tested 0.7.31 locally.

### 2026-10-24, privacy policy on GitHub Pages and 0.7.30 (Claude Code)
- Max asked to host the policy on GitHub Pages with the domain `timer.reckonry.ai/privacy`. Pages is on, public, with the domain verified and HTTPS enforced. Max set the Cloudflare DNS, verified the domain, and changed the store URL.
- New `.github/workflows/privacy-page.yml` and `scripts/privacy-page.sh`: on each `v*` tag, or by hand, they render `docs/privacy-policy.md` with GitHub's Markdown API and deploy it. The `github-pages` environment allows `main` and `v*` tags. A manual run published it and the page checked out.
- The panel and settings page link to the new address (0.7.29). Max is adding a link on the old Google Site.
- Committed the main checkout's error-log, feedback-form, and finish-form work on top as 0.7.30, gave the policy an effective date of 2026-10-24, and pointed the scheduled task at `v0.7.30`. Pushed to `origin/main`, not tagged.
- The main checkout still has those edits uncommitted on an older local `main`. Its working tree matches 0.7.30 for those files, so discard them there and pull.

### 2026-10-24, error log in feedback and stale content scripts (Claude Code)
- Max asked for the feedback form's Logs field to show errors the extension records, and reported "Extension context invalidated" at `content.js:24` on a Karbon page.
- New `src/errors.js`, loaded by the background, content script, panel, finish form, and settings page. It records failed Karbon calls once, in `toKarbon` (signed out is not counted), plus uncaught errors in extension pages and the service worker, and failed starts on Karbon pages. Karbon's own page errors are not watched. Repeats show once with a count. Messages are cut to 160 characters, with links and record keys replaced. Times are in UTC.
- `currentDetails()` in `src/prefs.js` adds the errors, so Send feedback, Email us instead, and Copy details for support all include them. The settings page's Support copy now says so.
- `content.js` checks `chrome.runtime.id` before using Chrome's APIs. Once it's gone, the script removes its message listener, clears its loops, and removes its cards.
- Privacy review: `errorLog` added to the inventory with a review note in `docs/PRIVACY.md`. The Feedback section of `docs/privacy-policy.md` now mentions recent errors.
- Built as 0.7.26. Not committed, and not loaded in Chrome. To test: reload `unpacked/production`, make a call fail, and check the Logs field. Then reload the extension with a Karbon tab open and check that tab's console.

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
