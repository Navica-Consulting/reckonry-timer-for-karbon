# Chrome Web Store Privacy practices tab

Text to paste into the dashboard's Privacy practices tab. Keep it in step with
`src/manifest.json` and [privacy-policy.md](privacy-policy.md). Each field takes up to 1,000
characters.

## Single purpose

Reckonry Timer for Karbon adds a faster timer to Karbon, the practice management app. It starts,
switches, pauses, and stops Karbon's own time tracking from the toolbar and from Karbon's pages,
and it reminds you when a timer should be running or has been left on.

## Permission justifications

### storage

Saves the user's timer preferences (reminder times, auto-start choices, toolbar icon) and the
Karbon account keys the extension needs to call Karbon's time tracking for the signed-in user.
Also keeps short lists for convenience, such as recent work items and the last role and task type
used on each one. Record keys only, no names. Nothing is sent to us.

### idle

Detects when the computer is idle, locked, or asleep, so the extension can pause or flag a running
Karbon timer and offer to remove the away time. The idle state is used on the spot and never
stored or sent anywhere.

### alarms

Runs a regular check that the timer shown matches Karbon's timer, and fires the user's start of
day and end of day reminders when they're due.

### notifications

Shows reminders the user turned on: no timer running during work hours, a timer still running at
the end of the day, or a timer paused because the computer was away.

### cookies

Reads one cookie Karbon sets for its own app, `bootstrap-cookie-*` on karbonhq.com. It holds the
user's firm ID, user ID, and Karbon's regional server address. The extension needs these to reach
the signed-in user's own timer without a Karbon tab open. It doesn't read any other cookie, and it
never reads, stores, or changes session or sign-in cookies. Karbon's own sign-in still applies to
every request. The extension also listens for that cookie to change, so it notices when a
different Karbon user signs in on the browser.

## Host permission justification

`https://app2.karbonhq.com/*` is Karbon's web app. The extension adds its timer controls to these
pages and learns the timer's state from them.

`https://*.karbonhq.com/*` covers Karbon's regional API servers (for example us3.karbonhq.com).
Karbon stores each firm's data in one region and names it in the cookie above, so the exact host
isn't known in advance. The extension calls only Karbon's time tracking, work, and search
services there, as the signed-in user, to start, stop, and look up their own timers. It sends no
data to any server other than Karbon.

## Remote code

No. All code ships in the package.

## Data usage

The extension sends nothing to the developer. It sends timer and work item data only to Karbon,
the service the user signed in to, to do the timer actions they ask for. Feedback goes through a
Google Form the user opens and submits themselves, which the privacy policy covers.

Data types, chosen 2026-11-05 (Max), each matched to the policy:
- Personally identifiable information: checked. Karbon user and firm IDs, and the optional email on the feedback form.
- Web history: checked. The address and title of the open Karbon page.
- User activity: checked. Idle, locked, or asleep, for auto-pause.
- Website content: checked. Work item and client names and timer notes, read from and sent to Karbon.
- Authentication information: unchecked. The bootstrap cookie holds no password or session token.
- Health, financial, personal communications, and location: unchecked.

Tick all three certifications.
