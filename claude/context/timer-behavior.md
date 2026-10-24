# Timer behavior

Settled design decisions for how the extension controls the Karbon timer.

## Switching and starting
- 2026-10-24: Timer calls go straight to Karbon's API from the background, so no Karbon tab is needed. When that fails, play reloads the Karbon tab, or opens one if Karbon is closed, and tries again. The panel no longer shows a reload or open link (Max asked; routing by Claude, v0.7.18).
- 2026-10-22: Add auto-start in addition to auto-switch (Max).
- 2026-10-22: Work item switching uses a delayed-commit toast, "Switching timer to this work item (cancel)," rather than switch-then-undo (Max).
- 2026-10-23: Auto-start on work items with a 2-second default, and on contacts (people, organizations, client groups) with an 8-second default (Max). The seconds are the visible cancel countdown itself; the separate dwell delay was removed.
- 2026-10-23: The start panel follows Karbon's field order (Work, Role, Task type, Notes) and is always visible. Picking a work item selects it; the play button starts it (Max).
- 2026-10-23: The default work item was removed (Max).
- 2026-10-24: One form at a time. With a timer running, the panel shows only its card, and the start form is hidden. The card's action row has Pause (or Resume), Stop, Swap, and Discard icons. Stop and Swap save from the card; required fields still empty bounce instead of opening the finish form. Swap then starts a blank timer with the last-used role and task type. Focus stays on the button, so the Work field's recents don't open over the red outline (Max). Discard takes two presses, and play then starts a new timer (Max; icon choice and bounce by Claude, v0.7.15). This replaces "the start panel is always visible" and the v0.7.14 save-or-discard question.
- 2026-10-24: The timer card shows the timer's full notes in an editable box, which replaces the add-a-note field and its plus button. Edits save after a pause in typing, when you leave the box, and before a stop or swap. Stamped notes appear in the box too and can be edited (Max asked; saving by Claude, v0.7.15).
- 2026-10-24: Discard confirms on the button itself, not with a status note. The first press fills the button red with a white icon and relabels it "Press again to discard N minutes"; the second press discards. It disarms after 4 seconds or when focus leaves the button (Max; v0.7.16).

## Blank start and finishing (v0.7.0 and later)
- 2026-10-23: Karbon allows a timer with no work item, contact, role, or task type. The extension can start a timer from anywhere with nothing chosen; work is optional at start (Max).
- 2026-10-23: When a stop or switch from the extension finds missing details, the timer is paused and a finish form asks for them. Required: a work item or contact always; role, task type, and notes when the firm requires them (Max).
- 2026-10-23: The finish form's values go straight into the saved time entry (POST). The running stopwatch is never edited, so no uncaptured call is needed (Claude).
- 2026-10-23: While a timer runs, the panel's timer card keeps its work item (or contact, where the firm allows contact time), role, and task type visible and editable. Required ones that are missing get a red outline. Edits use the stopwatch `update` call, which was only captured for notes, so each edit is re-read and reported as failed if Karbon didn't keep it. This replaces "the running stopwatch is never edited" for edits made in the panel (Max asked; details by Claude, v0.7.13).
- 2026-10-23: The finish form shows in the toolbar panel for panel actions, and in a small pop-up window otherwise. Options: Save (or Save and switch), Keep paused, and Discard (two presses) (Claude, from Max's request; confirm).
- 2026-10-24: The finish form opens in the toolbar panel itself, from the page prompt, an automatic switch, and notifications too. The small window is only a fallback when Chrome can't open the panel (before Chrome 127, or with no focused browser window). The form keeps its state if the panel closes, so reopening the icon brings it back. Discard is the panel's trash icon, armed red on the first press. This replaces "a small pop-up window otherwise" (Max asked why not open the extension; v0.7.20).
- 2026-10-24: The finish form marks required fields still empty with the panel's red outline from the start, not only after Save. A work item already on the timer shows in the panel's box with Change. A timer on a client shows the client on its own line with Change, which searches clients, and a Work search box under it (work items only). A work item picked there wins over the client. Work is required only where the firm books time to work items only. Required fields carry no "(required)" text in the form or the panel; the red outline while empty is the signal, and screen readers get aria-required (Max; v0.7.21).
- 2026-10-24: Page messages (countdown toasts, the start reminder, the no-work-item prompt, and the sign-in warning) use one card that matches the panel: its light or dark colors, type, buttons, and a status pill, under a small "Reckonry Timer" label (Max asked for one consistent style; design by Claude, v0.7.20).
- 2026-10-23: Opening a work item or contact in Karbon while a blank timer runs shows a persistent pop-up, whatever the settings. It has no countdown and stays through page changes until answered: "Finish timer" (or "Finish and switch here" with auto-switch on) or "Keep it running." The item you opened is offered as a one-click pick on the finish form (Max asked for the persistent pop-up; details by Claude).
- 2026-10-23: At 11:59 PM a blank timer is paused rather than split, and a notification asks to finish it. It still saves to the day it was recorded (Claude; confirm).
- 2026-10-23: Alt+Shift+K starts a blank timer when none is running (Claude; confirm).

## Setup (v0.7.2 and later)
- 2026-10-23: No "Start your first timer" step. Setup is pin, connect to Karbon (automatic from the sign-in already in the browser), and preferences (Max asked to remove the step; flow by Claude).

## Preferences
- 2026-10-23: Order: Work; Clients; Auto-switch; Away from the computer; Alerts and badge; Time entries; Troubleshooting (Max asked for logical order; grouping by Claude).
- 2026-10-23: Work items and contacts each get their own choice for opening with no timer running: Auto-start, Remind me, or Do nothing. The groups are headed "Work" and "Clients"; the choices explain themselves. Each option's seconds nest under it. Contacts default to Do nothing (Max, v0.7.7).
- 2026-10-23: Upgrades from before 0.7.7 turn contact auto-start off where work-item auto-start was off, since contact auto-start used to apply only under it (Claude).
- 2026-10-23: Auto-switch is its own section below, with its own countdown, "Switch after," defaulting to 2 seconds (Max asked for the section; separate countdown by Claude).
- 2026-10-23: Nested settings are a plain indent that lines up with the parent's label text, with no shaded box or accent edge. They dim when the parent is off. Radios sit before their labels (Max rejected the v0.7.1 shaded area with an accent edge; layout by Claude, v0.7.4).
- 2026-10-23: The long-timer alert is a switch, with the hours nested under it. Upgrades turn the switch off where the hours were set to 0 (Max).
- 2026-10-22: Auto-pause, auto-resume, and auto-start are user preferences, not fixed behavior (Max).
- 2026-10-23: Work-item auto-start is the default; upgrades keep an explicit earlier choice of "do nothing" or "remind me" (Claude, from Max's request; confirm).
- 2026-10-23: Badge location is a preference: Everywhere, Away from Karbon (default), or Never (Max).
- 2026-10-23: The default panel should open without a scroll bar when possible (Max).
- 2026-10-23: New defaults (Max, v0.7.11): work items auto-start after 1 second; contacts get a reminder after 60 seconds, and wait 5 seconds when set to auto-start; auto-switch is on after 1 second; resume after a lock or idle pause is on; the badge shows everywhere; the toolbar icon suits dark themes. The cancel countdown stays a fixed 5 seconds.
- 2026-10-23: Auto-switch is set separately for Work and Clients, as two switches. Work is on by default, Clients off. Both share one countdown (Max asked for the split; Clients default by Claude, confirm).
- 2026-10-23: The new defaults apply to existing users too, for any setting they never changed (Max). Upgrades turn contact auto-switch on only where someone had turned on both auto-switch and contact auto-start, as before (Claude).
- 2026-10-23: The setup guide (`welcome.html`) is also the full settings, help, and support page, and Chrome's Options menu opens it. It has every setting, in the panel's group order and names, each with what it does, when to change it, its default, and a Reset link when changed (Max asked for one page; layout and copy by Claude, confirm).
- 2026-10-23: The panel's Preferences keeps only Work, Clients, and Auto-switch, with a link to the page for the rest (Max).
- 2026-10-23: Once the extension is pinned and connected, the setup steps fold into a one-line "You're set up" note, so returning visitors land on settings (Claude; confirm).
- 2026-10-23: `DEFAULTS` lives in `src/defaults.js`, and the form logic in `src/prefs.js`, shared by the panel and the page (Claude).
- 2026-10-23: The privacy policy is linked from the Preferences footer and the setup guide: https://sites.google.com/navicaconsulting.com/reckonry-timer-privacy-policy/home (Max).

## Pausing and away time
- 2026-10-22: Pause on screen lock. On wake after sleep, flag the away time in the time entry note rather than backdating (Max).
- 2026-10-22: Auto-pause appends a note to the time entry: "Auto paused at [datetime]" (Max).

## Work-only firms
- 2026-10-23: Firms that book time to work items only still get the Clients preferences. Opening a contact can start or suggest a timer, but it starts with no work item, and the finish form asks for one at stop. A blank timer running when a contact opens gets no finish prompt, since the contact can't take the time (Max asked to keep contact timers; details by Claude, v0.7.8).

## Signed out of Karbon
- 2026-10-24: When Karbon is signed out, the extension shows no timer, so no one records time without knowing Karbon signed out. The panel shows only a sign-in message and button, the badge shows a red "!". Karbon's sign-in page opens only when you press the panel's Sign in button: no warning on Karbon's pages, and nothing opens on its own (Max, 0.7.21). The shortcut and notifications do nothing while signed out. Automatic pauses and day-end saves just skip, and no background Karbon tab is opened (Max asked; details by Claude, v0.7.19).
