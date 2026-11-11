# Daily endpoint check

The extension uses Karbon's private web API, which can change without notice. This check runs
the extension's own `src/karbon.js` inside a signed-in Karbon tab, every day, and checks that
each call still works and still returns the fields the code reads. When something breaks, it
is fixed here and released to the store.

## What it checks

`scripts/endpoint-check/check.js` reports one line per check, with the feature that breaks and
the code that uses it.

- Sign-in and keys: Karbon's Ember session service (`page.js`), the `bootstrap-cookie-*`
  cookie (`background.js`), and `userEnvironmentSettings` (the background's signed-in check).
- Reads, through the extension's own commands: the stopwatch, firm time settings, roles and
  task types, recents, work and client search, a client's work list, budget prefill, and the
  work templates in the Create work item form.
- The SignalR hub socket, which page.js uses for live timer updates.
- Writes, only when no timer is running: a blank timer is started, noted, paused, resumed,
  and discarded. Nothing is saved. The hub must send `StopwatchChanged` meanwhile.
- With a test client set, also a saved minute: it creates a work item named "Reckonry
  endpoint check (safe to delete)" through the extension's own `createWork`, times it, saves the
  entry, reads it back, then deletes the entry and the work item. If `clients` has a client group,
  it also creates one for the group (a different `clientType`) and deletes it right away.

Write safety: every write step first checks that the running timer is the one the check started
(same initial start time). If anyone starts a timer meanwhile, the check stops and leaves it
alone. Run it when nobody is timing on the account, which is why it is scheduled early.

Not checked: Karbon's page URLs and DOM (auto-switch reads the route only), and the store
listing.

## Running it

1. `scripts/endpoint-check/bundle.sh` writes `scripts/endpoint-check/out/run.js`, using
   `src/karbon.js` from the newest `v*` tag, which is what users run. Add `--src` to test
   `src/` as it is now, and `--read` for reads only. Options come from `scripts/endpoint-check/config.local.json`
   (not in git):

   ```json
   { "writes": true,
     "client": { "name": "Reach Foundation", "key": "<key>", "linkType": "Organization" },
     "clients": [ { "name": "...", "key": "<key>", "linkType": "Contact" } ] }
   ```

   `client` gets the saved minute; it must be a `Contact` or `Organization`. Leave it null to
   skip that test. `clients` are the work lists to read, ideally a person, an organization,
   and a client group. Max's test clients (2026-11-09): Reach Foundation, Abigail Silvers, and
   Silvers Client Group.
2. Open https://app2.karbonhq.com/ in Claude's built-in browser, signed in.
3. Paste the whole of `out/run.js` into the tab (`javascript_tool`, or the DevTools console),
   as is. Never load it with `eval` or a script tag, which Karbon's policy would report.
   It returns the report and also leaves it in `window.__ktCheckReport`. Read that if the paste
   times out.

Karbon's content security policy is report-only, so loading the bundle from a local server
would work, but it would send violation reports to Karbon's logging. Pasting avoids that.

`ok: false` with `signedOut: true` means Karbon needs a sign-in. Claude never types Karbon
passwords. Max signs in once in the built-in browser, which keeps the session.

## When a check fails

1. Run it again once. A single failure can be a network blip.
2. Read the failed check's `feature`, `code`, and `detail`. The detail names missing fields
   and the fields that came back instead.
3. Do that feature by hand in Karbon's own UI, in the built-in browser, and watch the calls
   with `read_network_requests`. Prefer read-only steps. If a write is needed, use the test
   client and delete what you create.
4. Record the new call, body, and response in `artifacts/capture-summary.md`, dated.
5. Fix `src/` on a branch from `main` (`fix/endpoint-<date>`). Keep the change to what broke.
6. Run the check again against the fix, with `bundle.sh --src`, until it passes. Also run
   `node --check` on the changed files.
7. Privacy: a changed path on the same Karbon hosts is a network call change, so add a review
   note to `docs/PRIVACY.md`. Stop and ask Max instead of releasing when the fix needs a new
   permission, a new host, a new storage key, or a change to the store's Privacy tab.
8. Release (Max asked on 2026-11-09 for broken endpoints to be fixed and released without
   waiting for his test):
   - Bump `version` in `src/manifest.json` past every tag and every branch's manifest version.
   - `./build.sh`, add a session log entry to `claude/handoff.md`, commit, merge to `main`,
     tag `v<version>`, and push `main` and the tag. The Release workflow submits it.
   - If another version is in review, cancel it first (Release workflow, action `cancel`).
     The fix is built on `main`, so it includes that version's changes.
   - Check the Release run with `gh run list --workflow release.yml`.
9. Tell Max what broke, what changed, and the version. Other branches need `main` merged in.

## History

Each daily run adds a line to `scripts/endpoint-check/out/history.jsonl` (not in git). A
failure and its fix are recorded in `claude/handoff.md`.
