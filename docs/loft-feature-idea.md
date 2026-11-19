# Loft feature idea: timer that follows your work

Posted by Max on 2026-11-19: https://theloft.bykarbon.com/c/feature-request/timer-that-follows-your-work-auto-switch-on-work-and-pause-when-you-re-away
Linked from `site/index.html`, the README, and the navica.llc tool page.

Cover image: `store/screenshots/out/loft-cover.png` (1680x600, from `store/screenshots/loft-cover.html`).
Alt text: "Rendered screenshot of a Karbon work item with a Reckonry Timer card switching the timer
in 4 seconds, beside the toolbar panel showing a timer running at 42 minutes."

Screenshots to upload, in order, from `store/screenshots/out/`:

1. `1-timer.png`: the timer from any tab
2. `2-switch.png`: auto-switch with a countdown
3. `5-away.png`: pause when you step away
4. `4-finish.png`: finish an entry Karbon can't save yet

---

## Title

Timer that follows your work: start from any tab, auto-switch, pause when you're away, plus a time entry API

## Body

The Karbon timer is good. The hard part is remembering to use it while you jump between emails, clients, and calls all day. You dive into a return and look up an hour later, and the timer never started. Or it stays on the last client for forty minutes, or runs through lunch, and someone rebuilds the day from memory at 5 PM. Short tasks never get logged at all.

On fixed-fee work that missing time matters. It's how you find out which clients cost the most before you renew them.

I'd love Karbon's timer to keep up with the way people actually work.

**1. Run the timer from any tab.** Start, pause, stop, and switch from the browser toolbar or a keyboard shortcut, without finding a Karbon tab first. Change the client, work, role, task type, and notes while it runs. Show the running time on the toolbar icon.

[image: 1-timer.png]

**2. Let the timer follow the work.** When you open a work item, offer to start or switch the timer after a short countdown you can cancel, so a quick look doesn't count. Make it a per-user setting, with separate choices for work items and client pages.

[image: 2-switch.png]

**3. Pause when you step away.** Pause when the screen locks or the computer sleeps, and optionally after some idle minutes. Resume when you're back, and add a short note to the entry so the gap is explained.

[image: 5-away.png]

**4. Never lose a half-finished entry.** Let me start a blank timer and pick the work item when I stop. If the firm requires a role or task type, ask for it at stop or switch time, with the missing field highlighted, instead of losing the entry.

[image: 4-finish.png]

**5. Safety nets.** Alert me when a timer has run past a set number of hours. Split a timer at midnight so each day's time lands on the right day.

**6. Presets.** One-click role and task type combinations for the stages of a job, such as prep, the client meeting, and review.

**Or open it up.** The public API can read time entries today, but it can't create or update them, and there's no timer endpoint. Adding those would let firms and partners build this on supported endpoints.

I built a proof of concept as a Chrome extension to show what this could feel like. Karbon let me know it isn't allowed under the terms, so I've pulled it from the Chrome Web Store. The screenshots above are from it. More detail: https://navica.llc/tools/reckonry-timer-for-karbon/

If better time capture would help your firm, add your vote, and tell us which of these you'd use first.
