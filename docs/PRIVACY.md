# Privacy policy tracking

The public policy lives at https://timer.reckonry.ai/privacy and is linked from
`src/popup.html` and `src/welcome.html`. Versions before 0.7.29 link to the old Google Site,
https://sites.google.com/navicaconsulting.com/reckonry-timer-privacy-policy/home, so keep that
page up with a link to the new address. The Chrome Web Store listing's
Privacy practices tab must point to the same URL and agree with it.

Three things must say the same thing, and drift between them is what gets an extension rejected
or taken down:

1. What the code does (`src/manifest.json` permissions, storage keys, network calls).
2. The hosted policy text.
3. The Chrome Web Store Privacy practices tab (single purpose, permission justifications,
   data-use checkboxes, Limited Use certification).

## Process

- `docs/privacy-policy.md` holds the current policy text, so every change is a reviewed diff.
  The Privacy page workflow (`.github/workflows/privacy-page.yml`) renders it with
  `scripts/privacy-page.sh` and publishes it to GitHub Pages on every version tag. To publish a
  policy fix between releases, run that workflow by hand from Actions.
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

## Data inventory (as of 0.7.37)

| Data | Source | Where it's kept | Leaves the device? |
|---|---|---|---|
| Tenant key, user profile key, API host | Karbon `bootstrap-cookie-*` (via `cookies` permission), or the open Karbon tab | `storage.local` | No |
| Firm name | Karbon `userEnvironmentSettings` API | `storage.local` | No (display only) |
| Current timer state, auto-pause reason | Karbon stopwatch API | `storage.session` | Sent to Karbon only |
| Open work item or contact (address, title, client) | Karbon page | Memory, recents | No |
| Roles, task types, last-used role and task type | Karbon API | `storage.local` | No |
| Last saved role and task type per work item (keys only, 100 days, at most 300 work items) | Extension, from entries it saves | `storage.local` (`workPicks`) | No |
| Work item budget role and task type, for prefill | Karbon `estimateActualInfos` API | Not stored | No |
| Firm time settings (work-only, notes required) | Karbon API | `storage.local` | No |
| Settings, including the toolbar icon color (0.7.5), contact reminders (0.7.7), and contact auto-switch (0.7.11) | User | `storage.sync` | Synced by Chrome Sync if the user has it on |
| Presets (the user's label, plus role and task type keys; at most 8) (0.7.36) | User | `storage.sync` (`presets`) | Synced by Chrome Sync if the user has it on |
| Idle, locked, or asleep state | `idle` permission | Not stored | No |
| Notes on time entries | Extension | Karbon time entry | Sent to Karbon only |
| Feedback form (version, on/off settings, recent errors prefilled; optional email typed by the user) | User clicks Send feedback | Not stored by the extension; Google Forms and its Sheet | Only if the user submits it |
| Feedback email (version, on/off settings, recent errors) | User clicks Email us instead on the settings page | Not stored | Only if the user sends it |
| Diagnostic info (cookie lookup notes, connection check, whether timer changes work without a Karbon tab) | Extension | `storage.local` | No |
| Recent errors (last 15 of the extension's own error messages, with time and where; links and record keys removed) | Extension | `storage.local` (`errorLog`) | Only inside feedback the user submits or sends |

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

Policy hosting move (2026-10-24, 0.7.29): the policy moves from the Google Site to GitHub Pages
at `timer.reckonry.ai/privacy`. Only the link in the panel and the settings page changes. The page
is plain HTML with no scripts, cookies, or analytics. No new permissions, host access, storage
keys, or network calls. No inventory change. Store listing: change the privacy policy URL by hand.

Error log review (2026-10-24, 0.7.26): one new `storage.local` key, `errorLog`, keeps the last 15
errors the extension raised itself: failed timer, search, and list calls, and uncaught errors in
the panel, finish form, settings page, and service worker. Each entry has the time, where it
happened (a command or page name), and the message, cut to 160 characters with links and record
keys replaced. The messages are the extension's own text, so they hold no client or work names.
Errors from Karbon's page are not watched. The log is added to the feedback form's details field,
the email draft, and Copy details for support, where the user can read, edit, or clear it before
sending. No new permissions, host access, or network calls. The policy's Feedback section now says
recent errors are included.

Role and task type prefill review (2026-10-24, 0.7.32): starts now fill in the role and task type
the way Karbon's own timer does, following the firm's prefill mode. One new `storage.local` key,
`workPicks`, keeps the role and task type keys of the last entry the extension saved on each work
item, with the time. Entries older than 100 days drop out, it holds at most 300 work items, and it
is cleared when another Karbon user signs in on the browser. It holds record keys only, never names.
Karbon keeps the same thing in its own browser storage, which the extension doesn't read. One new
read call to an existing destination: `GET /time/api/{tenant}/estimateActualInfos` for the work
item's budget line assigned to you. Nothing from it is stored. The firm's `timeEntryPrefillMode` is
read from the time settings call the extension already makes. No new permissions or host access.
The policy's list of what the extension handles now names the per-work-item memory.

Presets review (2026-11-05, 0.7.36; renamed in 0.7.37): one new `storage.sync` key, `presets`
(called `shortcuts` in 0.7.36, moved over once on load), holds up
to 8 buttons, each a label the user types (at most 30 characters) and Karbon role and task type
keys, never their names. Chrome Sync carries it to the user's other computers when it's on, like
the other settings. It is not in the feedback form, the email draft, or Copy details. The buttons
use calls the extension already makes (start, stop and save, and the stopwatch update). No new
permissions, host access, or network calls. The policy's open item on Chrome Sync now covers this
key too, so the policy needs no separate change.

## Hosting setup (done 2026-10-24)

GitHub Pages is on for this repository, public, built by Actions, with the custom domain
`timer.reckonry.ai` (verified for the org, HTTPS enforced). Cloudflare DNS has `timer` as a
DNS-only CNAME for `navica-consulting.github.io`. The `github-pages` environment allows deploys
from `main` and from `v*` tags. The store listing's privacy policy URL points to the new address.

## Open items

None. The 2026-11-06 policy names the firm name, Chrome Sync of settings and presets, and
Karbon's servers. The store's Privacy practices tab, with the `cookies` and `*.karbonhq.com`
justifications, was filled in for 0.7.37.

## Change log

| Effective date | Extension version | Change |
|---|---|---|
| 2026-10-23 | 0.7.1 | First published policy. |
| 2026-10-24 | 0.7.30 | Feedback opens a Google Form with recent errors. Moved to timer.reckonry.ai/privacy. |
| 2026-10-24 | 0.7.32 | Names the per-work-item role and task type memory used for prefill. |
| 2026-11-05 | 0.7.37 | Says identifiers are also read from a Karbon sign-in cookie, which holds no password or session token. |
| 2026-11-06 | 0.7.37 | Names the stored firm name, Chrome Sync of settings and presets, and Karbon's servers as the only destination. |
