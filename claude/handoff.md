# Handoff: Karbon Timer Tools

## Status
Live. 0.7.37 cleared Chrome Web Store review and is live, unlisted. Max uploaded it by hand and pasted `docs/store-privacy-tab.md` into the Privacy practices tab. It is tagged `v0.7.37` (2026-11-06). Max tested 0.7.37 on the live tenant: tab-free search, adding and editing timers, role and task type prefill, presets, and required-field outlines all work. The landing page at https://timer.reckonry.ai went live on 2026-11-06 (`site/`), and the privacy policy at https://timer.reckonry.ai/privacy is effective 2026-11-06. 0.7.38 (open Karbon on install) is built and committed, not tagged or uploaded.

## Next step
Max tests 0.7.38's install flow: remove the extension, then Load unpacked `unpacked/production` again. That counts as a fresh install. The setup page should open with Karbon in a new tab behind it, step 2 should connect, and the Presets card should list roles and task types without refreshing anything. If it works, tag `v0.7.38` and upload `dist/reckonry-timer-for-karbon-0.7.38.zip` by hand.

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
- Landing page copy: timer.reckonry.ai says "it's free" in the button and FAQ, though the monetization model isn't decided. Real customer stories would replace the typical scenarios in Use cases (waiting on: Max).
- Install connection: 0.7.38 opens Karbon in a new background tab on a fresh install and leaves it open, since Chrome doesn't add content scripts to Karbon tabs that were already open. The setup probe watches that tab instead of opening its own. The background fetches the role and task type lists once the account is known, and the settings page's Presets card picks them up when they arrive. Step 2's text asks people to refresh Karbon tabs they had open before installing. Tested in Node with stubbed Chrome APIs (install and update paths), not in Chrome (waiting on: Max's test).
- Help copy: the settings page's help text and FAQ answers (in `src/welcome.html`) were drafted by Claude in 0.7.14 and never reviewed word for word. Worth a read before listing publicly (waiting on: Max, low priority).
- Time entry rules (internal vs. client roles and task types, and a confirm step for time logged straight to a contact): planned on 2026-11-05 in `artifacts/time-entry-rules-plan.md`, then parked by Max as high effort for moderate gain (waiting on: Max, if it comes back).
- Signed out of Karbon: 0.7.19 hides the timer when signed out and offers a Sign in button. It treats a 401, or Karbon's sign-in page where data should be, as signed out; what Karbon really returns when signed out wasn't captured (waiting on: a live sign-out test).
- Multiple tenants: the bootstrap cookie names the user's default tenant, and a Karbon tab's URL wins for that tab. Not tested with a user in several tenants. Not critical now, since most firms don't work that way, but needed before a Karbon-wide release (waiting on: a multi-tenant user).
- Blank start payload: the extension sends `entityPermaKey: null` and `entityLinkType: null`. Not yet compared with Karbon's own blank start (waiting on: live test).
- Client and Work fields: with a client chosen, Work lists that client's work by name-matching global search results (up to 25), which can miss work and doesn't match client groups. Captured on 2026-11-06: a client's Work tab uses `POST /todo/api/{tenant}/workViewListItems` filtered by the client's key (`client` for a person or organization, `clientgroup` for a group), and a group's list includes its members' work. Details in `artifacts/capture-summary.md`. Switching the Work field to it is not built yet (waiting on: Max's go-ahead).
- Trademark and listing name: Karbon's brand guide (`~/Documents/Dev Projects/Brand Guides/Karbon/.../karbon-logo-guidance.pdf`, 2025) covers only the logo and monogram. The extension uses neither: its icon is a stopwatch, and the listing says it is independent and not endorsed by Karbon. The guide says nothing about naming a product "for Karbon". For certainty, ask Ian Clazie, Karbon's design director, named in the guide as the contact (waiting on: Max, optional).
- Monetization model: not decided. Claude suggested launching free as a lead source for Navica, Reckonry, and Liminos, with a possible paid firm-admin tier later (waiting on: Max).
- Sign-in: not decided. Claude suggested guest-first with optional Google or Microsoft sign-in only when a server-backed feature needs it (waiting on: Max).
- Value exchange design: Claude drafted a ladder (local value report before the week-one feedback ask, a playbook offer with the newsletter invite, separate update and newsletter opt-ins). Max ruled out a breakage-alert list and marketing use of feedback emails on 2026-10-24 (waiting on: Max).

### Closed on 2026-11-06
- Store submission: 0.7.37 is live (unlisted), with the Privacy practices tab filled in.
- Privacy policy: covers the sign-in cookie, the firm name, Chrome Sync of settings and presets, and Karbon's servers.
- Feedback form: open to anyone, typo fixed (checked 2026-11-06). The Mac checkout's `.claude/launch.json` may still have a `feedback-preview` entry; it's ignored by git, so it's harmless.
- Tested live by Max: tab-free search, adding and editing a running timer, prefill, required "None" values (red outlines), the reminder (it works; the earlier report was a testing slip), toolbar icon color, settings page, setup probe, and toast dismiss.
- Notes visibility: notes can reach invoices, and billers can edit them during billing. This is why notes never name other work items or clients.
- Contractor terms: Max confirmed the Karbon contractor agreement doesn't cover the public extension.

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
- 2026-11-06: Serve a landing page at timer.reckonry.ai from `site/`, deployed with the policy. Use cases are written as typical scenarios, not quotes (Max).

## Session log
### 2026-11-06, landing page (Claude Code)
- Max asked for a landing page at timer.reckonry.ai with screenshots, copy, use cases, and links to the privacy policy and the store.
- New `site/index.html` (no outside scripts or fonts) and `site/img/`, cropped from the store screenshots. The use-case stories are labeled as typical scenarios, not quotes. Max reviewed the draft.
- `scripts/privacy-page.sh` now copies `site/` into the Pages build in place of the redirect, and the privacy page links back home. Committed `e3f8de8`, pushed, and deployed by a manual run of the Privacy page workflow. The home page, `/privacy`, the images, and the store link all checked out live.
- Docs: README, root `CLAUDE.md`, `docs/RELEASING.md`, and `docs/PRIVACY.md` describe `site/`. Any analytics, outside scripts, or forms on the site are now a privacy review trigger.
- Open: the page says "free" in two places though monetization isn't decided, and it links to an unlisted store listing (waiting on: Max).

### 2026-11-06, store release, open items, and install connection (Claude Code)
- Max reported 0.7.37 live and unlisted in the store, tested on the live tenant, and closed most open threads (see Closed on 2026-11-06).
- Privacy policy: it already named the cookie. Added the stored firm name, Chrome Sync of settings and presets, and Karbon's servers as the destination. Effective 2026-11-06. Committed the store listing text and icon in `store/`. Tagged `v0.7.37`; the Release and Privacy page workflows ran (no store upload, since `CWS_AUTO_PUBLISH` is unset).
- Found Karbon's brand guide; it's logo-only, and the extension uses no Karbon logo.
- Max found that after install the role and task type lists didn't load until he refreshed Karbon and the settings page. Cause: open Karbon tabs get no content script on install, and the settings page asked for the lists once, before the account was known. 0.7.38 opens Karbon behind the setup page on install, warms the lists in the background, and updates the Presets card when they arrive. Privacy review in `docs/PRIVACY.md`. Tested in Node with stubbed Chrome APIs only.

### 2026-11-05, presets (Claude Code)
- Max found it unclear that a button ends the timer and starts a new one, and asked for the name "presets."
- Renamed to presets everywhere (`src/presets.js`, storage key `presets`, settings card `#g-presets`). 0.7.36's `shortcuts` key moves over once on load.
- On a running timer each preset is a split button: the name changes this timer, and the swap icon saves it and starts a new one. A short hint under them says so. The one-minute fill-in rule is gone.
- Max reported no reminder on a client page. Not changed: a reminder only shows with no timer running, after the 60-second default wait, with the Karbon tab focused the whole time. Waiting on Max's retest with Diagnostic logging on.
- Built as 0.7.37.

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
