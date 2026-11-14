# Daily endpoint check

The extension uses Karbon's private web API, which can change without notice. This check runs
the extension's own `src/karbon.js` inside a signed-in Karbon tab, every day, through Playwright, and checks that
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

`scripts/endpoint-check/run.mjs` runs the check with Playwright, in its own Chromium profile, on
Max's computer. A systemd user timer runs it at 6 AM every day. No Claude session or browser pane
is needed.

### Setup (once)

1. Install Playwright for the check (it is not part of the extension, which has no dependencies):

   ```bash
   cd scripts/endpoint-check && npm ci && npx playwright install chromium
   ```

2. Create `scripts/endpoint-check/config.local.json` (not in git) with the test clients:

   ```json
   { "writes": true,
     "client": { "name": "Reach Foundation", "key": "<key>", "linkType": "Organization" },
     "clients": [ { "name": "...", "key": "<key>", "linkType": "Contact" } ] }
   ```

   `client` gets the saved minute; it must be a `Contact` or `Organization`. Leave it null to
   skip that test. `clients` are the work lists to read, ideally a person, an organization,
   and a client group. Max's test clients (2026-11-09): Reach Foundation, Abigail Silvers, and
   Silvers Client Group.
3. Sign in once: `npm run login`. A Chromium window opens. Sign in to Karbon with SSO and tick
   "Stay signed in" if Microsoft asks. The window closes by itself once Karbon loads. It saves:
   - `~/.local/share/reckonry-endpoint-check/profile/`: the Chromium profile, with the Microsoft
     or Google sign-in cookies. Treat it like a password. It is outside the repo, mode 700.
   - `~/.local/share/reckonry-endpoint-check/sso.json`: which SSO button was used.
4. Check it: `npm run check`. Then install the timer: `npm run timer:install`. It writes
   `~/.config/systemd/user/reckonry-endpoint-check.{service,timer}` pointing at this checkout,
   and enables the timer. `Persistent=true` runs a missed check when the computer wakes.
   Remove it with `./systemd/install.sh --remove`.

### How sign-in works

Karbon has no password sign-in, only Google, Office 365, and Microsoft Exchange SSO, and its
session cookie does not survive a browser restart (its idle `autologout` also signs it out). So
every run starts at `/signin` and clicks the SSO button recorded in `sso.json`. Microsoft's own
"Stay signed in" cookie, kept in the profile, signs Karbon back in with no prompt. This is why the
check no longer depends on a Karbon session lasting overnight.

If Microsoft shows a prompt, the script answers only these, and stops on anything else:

- "Pick an account" with one remembered account: it picks it.
- "Stay signed in?": yes.
- A password or a six-digit authenticator code: only if Max stored them in the GNOME keyring
  himself. Both are optional, and nothing else ever holds them:

  ```bash
  keyring set reckonry-endpoint-check password
  ```

  ```bash
  keyring set reckonry-endpoint-check totp
  ```

  `totp` is the authenticator app's base32 secret, not a code. A push approval or a text code
  cannot be automated; the run stops and asks for `npm run login`.

When the Microsoft cookie finally expires (90 days at most, or sooner by a password change or
tenant policy), the run logs `signin` and alerts. Run `npm run login` again. Claude never types
Karbon or Microsoft passwords.

### Commands

Run from `scripts/endpoint-check`:

- `npm run check`: the daily run. Reads and writes, retries a failure once, logs, alerts.
- `npm run check:read`: reads only, no alerts.
- `node run.mjs` options: `--read`, `--src` (test `src/` as it is now, for a fix), `--headed`
  (watch it), `--no-alert`, `--history <file>`.

It builds the bundle with `bundle.sh` (by default `src/karbon.js` at the newest `v*` tag, which is
what users run) and runs `out/run.full.js` in the Karbon tab through Playwright, the same code that
used to be pasted. Exit codes: 0 pass, 1 a check failed, 2 sign-in needed.

### Alerts

- Pass: nothing, except that an open `endpoint-check` issue is closed with a comment.
- A check fails, then passes on the retry: logged as `blip` in the history, no alert.
- A check fails twice, sign-in fails, or the run breaks: a desktop notification, and a GitHub
  issue labeled `endpoint-check` in this repo (GitHub emails Max). A repeat failure comments on
  the open issue instead of opening another. The timer reads `GH_TOKEN` from `~/.bashrc`.

Each run writes `out/last-report.json` (the full report) and, when the run itself breaks,
`out/last-error.png`.

### By hand, without Playwright

`bundle.sh` still writes `out/run.js` for pasting into a signed-in Karbon tab (`javascript_tool`,
or the DevTools console), as is. Never load it with `eval` or a script tag, which Karbon's policy
would report. It returns the report and leaves it in `window.__ktCheckReport`. Playwright's
`page.evaluate` runs it the same way a paste does, so it does not trip Karbon's report-only
content security policy either.

### The Claude scheduled task

The old `karbon-endpoint-check` scheduled task (it pasted the bundle into Claude's browser pane)
is turned off, since that pane's Karbon session did not last overnight. If it comes back, it
should only run `npm run check` (or read the last line of `out/history.jsonl` after the timer)
and handle "When a check fails" below.

## When a check fails

1. The runner already retried once, since a single failure can be a network blip. An alert
   means it failed twice.
2. Read the failed check's `feature`, `code`, and `detail` in `out/last-report.json`. The
   detail names missing fields and the fields that came back instead.
3. Do that feature by hand in Karbon's own UI, in the built-in browser, and watch the calls
   with `read_network_requests`. Prefer read-only steps. If a write is needed, use the test
   client and delete what you create.
4. Record the new call, body, and response in `artifacts/capture-summary.md`, dated.
5. Fix `src/` on a branch from `main` (`fix/endpoint-<date>`). Keep the change to what broke.
6. Run the check again against the fix, with `node run.mjs --src --no-alert` from the fix's
   checkout (run `npm ci` there and copy `config.local.json` in first), until it passes. Also run
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
