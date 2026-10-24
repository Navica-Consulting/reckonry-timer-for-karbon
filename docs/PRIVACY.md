# Privacy policy tracking

The public policy lives at
https://sites.google.com/navicaconsulting.com/reckonry-timer-privacy-policy/home
and is linked from `src/popup.html` and `src/welcome.html`. The Chrome Web Store listing's
Privacy practices tab must point to the same URL and agree with it.

Three things must say the same thing, and drift between them is what gets an extension rejected
or taken down:

1. What the code does (`src/manifest.json` permissions, storage keys, network calls).
2. The hosted policy text.
3. The Chrome Web Store Privacy practices tab (single purpose, permission justifications,
   data-use checkboxes, Limited Use certification).

## Process

- `docs/privacy-policy.md` holds the current policy text, so every change is a reviewed diff.
  Edit it there first, then copy it to the Google Site.
- Bump the effective date in the policy on every substantive change, and add a line to the
  change log below.
- A pull request or commit that touches any of the triggers below must update this file's
  data inventory, and the policy if the inventory changed.
- Before each store submission, walk the checklist in [RELEASING.md](RELEASING.md).

### Triggers that require a privacy review

- Any change to `permissions` or `host_permissions` in `src/manifest.json`, or in what `build.sh`
  writes into them.
- A new `chrome.storage` key, or a key that starts holding a new kind of data.
- A new network destination (`fetch`, `XMLHttpRequest`, `mailto:`, links that carry data).
- Reading new data from Karbon pages, cookies, or requests.
- Anything that sends data off the device other than to Karbon.

## Data inventory (as of 0.7.14)

| Data | Source | Where it's kept | Leaves the device? |
|---|---|---|---|
| Tenant key, user profile key, API host | Karbon `bootstrap-cookie-*` (via `cookies` permission), or the open Karbon tab | `storage.local` | No |
| Firm name | Karbon `userEnvironmentSettings` API | `storage.local` | No (display only) |
| Current timer state, auto-pause reason | Karbon stopwatch API | `storage.session` | Sent to Karbon only |
| Open work item or contact (address, title, client) | Karbon page | Memory, recents | No |
| Roles, task types, last-used role and task type | Karbon API | `storage.local` | No |
| Firm time settings (work-only, notes required) | Karbon API | `storage.local` | No |
| Settings, including the toolbar icon color (0.7.5), contact reminders (0.7.7), and contact auto-switch (0.7.11) | User | `storage.sync` | Synced by Chrome Sync if the user has it on |
| Idle, locked, or asleep state | `idle` permission | Not stored | No |
| Notes on time entries | Extension | Karbon time entry | Sent to Karbon only |
| Feedback form (version, on/off settings prefilled; optional email typed by the user) | User clicks Send feedback | Not stored by the extension; Google Forms and its Sheet | Only if the user submits it |
| Feedback email (version, on/off settings) | User clicks Email us instead on the settings page | Not stored | Only if the user sends it |
| Diagnostic info (cookie lookup notes, connection check, whether timer changes work without a Karbon tab) | Extension | `storage.local` | No |

Network destinations: `app2.karbonhq.com` and Karbon's regional API hosts (`*.karbonhq.com`).
The extension makes no other calls. Send feedback opens a Google Form link (`docs.google.com`)
that carries the version and settings in its query string.

Settings and help page review (2026-10-23, 0.7.14): `welcome.html` became the settings page and
is registered as `options_ui`, which is not a permission. No new permissions, host access, storage
keys, or network calls. The page's "Send feedback" is the same `mailto:` the panel already had, and
"Copy details for support" writes the same version and settings text to the clipboard from a click,
with no `clipboardWrite` permission. The 0.7.13 timer card edits use Karbon's stopwatch API, an
existing destination. No inventory change.

Tab-free timer calls review (2026-10-24, 0.7.18): the background worker now runs timer, search,
recents, and list calls against Karbon's regional API host itself, with the signed-in session, and
uses a Karbon tab only when that fails. Same destination, same data, and the same calls the Karbon
tab already made. When it falls back, an action may reload the Karbon tab or open one in the
background. One new `storage.local` key, `directWrites`, records whether timer changes worked
without a tab, with the time and any error text, for the Connection line. No new permissions or
host access. The policy's open item about calling Karbon's API from the background worker now
covers all timer calls, not just the connection check.

Signed-out handling review (2026-10-24, 0.7.19): the extension now notices when Karbon is signed
out (a 401, or Karbon's sign-in page where data should be) and hides the timer. While a timer shows
as running, or while signed out, the background reads the stopwatch once a minute to notice a
sign-out or a sign-in. It also reuses the existing `userEnvironmentSettings` check when the
bootstrap cookie goes away. Same destinations and the same calls as before, just more often. The
existing `storage.local` key `signedIn` now turns false on a sign-out. 0.7.21 dropped the
sign-in warning on Karbon pages; nothing is added to Karbon's pages for it. No new permissions, host access, storage keys, or kinds of data. No
inventory change.

Feedback form review (2026-10-24, 0.7.19): Send feedback now opens a Google Form in a new tab
instead of a `mailto:` link. The link carries the same version and settings text as before, in the
form's "Extension details" field, which the user can edit or clear. Nothing personal goes in the
URL. The form asks for an optional email, used only to reply, typed by the user on Google's page
and never read or stored by the extension. If opt-ins (breakage alerts, newsletter) are added to
the form later, update the policy's Feedback section to name them. The `mailto:` stays on the
settings page as "Email us instead." No new permissions, host access, or storage keys. The policy's
Feedback section is updated in `docs/privacy-policy.md`, which needs a new effective date and a
copy to the Google Site. Store Privacy tab: the extension itself still collects no personal data,
so the data-use answers should not change; confirm before submitting.

## Open items

Changes since the policy's October 23, 2026 effective date that it may not cover yet:

- 0.7.2 added the `cookies` permission and reads Karbon's `bootstrap-cookie-*` to learn the
  account without a Karbon tab. The policy says identifiers are "learned from the Karbon web app";
  say they are also read from a Karbon sign-in cookie, and that the cookie holds no password or
  session token.
- 0.7.2 widened host access to `https://*.karbonhq.com/*` and calls Karbon's API from the
  background worker. Worth naming Karbon's regional API hosts.
- 0.7.2 stores the firm name for display.
- Settings use `chrome.storage.sync`, which Chrome syncs to the user's Google account when
  Chrome Sync is on. The policy says data stays in the browser's extension storage.
- In the store dashboard, add a justification for the new `cookies` permission and the wider
  host permission before submitting 0.7.2 or later.

## Change log

| Effective date | Extension version | Change |
|---|---|---|
| 2026-10-23 | 0.7.1 | First published policy. |
