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

## Data inventory (as of 0.7.7)

| Data | Source | Where it's kept | Leaves the device? |
|---|---|---|---|
| Tenant key, user profile key, API host | Karbon `bootstrap-cookie-*` (via `cookies` permission), or the open Karbon tab | `storage.local` | No |
| Firm name | Karbon `userEnvironmentSettings` API | `storage.local` | No (display only) |
| Current timer state, auto-pause reason | Karbon stopwatch API | `storage.session` | Sent to Karbon only |
| Open work item or contact (address, title, client) | Karbon page | Memory, recents | No |
| Roles, task types, last-used role and task type | Karbon API | `storage.local` | No |
| Firm time settings (work-only, notes required) | Karbon API | `storage.local` | No |
| Settings, including the toolbar icon color (0.7.5) and contact reminders (0.7.7) | User | `storage.sync` | Synced by Chrome Sync if the user has it on |
| Idle, locked, or asleep state | `idle` permission | Not stored | No |
| Notes on time entries | Extension | Karbon time entry | Sent to Karbon only |
| Feedback email (version, on/off settings) | User clicks Send feedback | Not stored | Only if the user sends it |
| Diagnostic info (cookie lookup notes, connection check) | Extension | `storage.local` | No |

Network destinations: `app2.karbonhq.com` and Karbon's regional API hosts (`*.karbonhq.com`).
Nothing else.

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
