# Timer behavior

Settled design decisions for how the extension controls the Karbon timer.

## Switching and starting
- 2026-10-22: Add auto-start in addition to auto-switch (Max).
- 2026-10-22: Work item switching uses a delayed-commit toast, "Switching timer to this work item (cancel)," rather than switch-then-undo (Max).
- 2026-10-23: Auto-start on work items with a 2-second default, and optional auto-start on contacts (people, organizations, client groups) with an 8-second default (Max). The seconds are the visible cancel countdown itself; the separate dwell delay was removed.
- 2026-10-23: The start panel follows Karbon's field order (Work, Role, Task type, Notes) and is always visible. Picking a work item selects it; the play button starts it (Max).
- 2026-10-23: The default work item was removed (Max).

## Blank start and finishing (v0.7.0 and later)
- 2026-10-23: Karbon allows a timer with no work item, contact, role, or task type. The extension can start a timer from anywhere with nothing chosen; work is optional at start (Max).
- 2026-10-23: When a stop or switch from the extension finds missing details, the timer is paused and a finish form asks for them. Required: a work item or contact always; role, task type, and notes when the firm requires them (Max).
- 2026-10-23: The finish form's values go straight into the saved time entry (POST). The running stopwatch is never edited, so no uncaptured call is needed (Claude).
- 2026-10-23: The finish form shows in the toolbar panel for panel actions, and in a small pop-up window otherwise. Options: Save (or Save and switch), Keep paused, and Discard (two presses) (Claude, from Max's request; confirm).
- 2026-10-23: Opening a work item or contact in Karbon while a blank timer runs shows a persistent pop-up, whatever the settings. It has no countdown and stays through page changes until answered: "Finish timer" (or "Finish and switch here" with auto-switch on) or "Keep it running." The item you opened is offered as a one-click pick on the finish form (Max asked for the persistent pop-up; details by Claude).
- 2026-10-23: At 11:59 PM a blank timer is paused rather than split, and a notification asks to finish it. It still saves to the day it was recorded (Claude; confirm).
- 2026-10-23: Alt+Shift+K starts a blank timer when none is running (Claude; confirm).

## Setup (v0.7.2 and later)
- 2026-10-23: No "Start your first timer" step. Setup is pin, connect to Karbon (automatic from the sign-in already in the browser), and preferences (Max asked to remove the step; flow by Claude).

## Preferences (v0.7.1 layout)
- 2026-10-23: Order: When I open a work item with no timer running; Auto-switch; Away from the computer; Alerts and badge; Time entries; Troubleshooting (Max asked for logical order; grouping by Claude).
- 2026-10-23: The no-timer choice is one of three: Auto-start, Remind me, or Do nothing. Each option's settings are nested under it. Contact auto-start is nested under Auto-start and only applies while it is on (Max).
- 2026-10-23: Auto-switch is its own section below, with its own countdown, "Switch after," defaulting to 2 seconds (Max asked for the section; separate countdown by Claude).
- 2026-10-23: Nested settings are a plain indent that lines up with the parent's label text, with no shaded box or accent edge. They dim when the parent is off. Radios sit before their labels. "Start contacts after" nests under "Also on contacts" (Max rejected the v0.7.1 shaded area with an accent edge; layout by Claude, v0.7.4).
- 2026-10-23: The long-timer alert is a switch, with the hours nested under it. Upgrades turn the switch off where the hours were set to 0 (Max).
- 2026-10-22: Auto-pause, auto-resume, and auto-start are user preferences, not fixed behavior (Max).
- 2026-10-23: Work-item auto-start is the default; upgrades keep an explicit earlier choice of "do nothing" or "remind me" (Claude, from Max's request; confirm).
- 2026-10-23: Badge location is a preference: Everywhere, Away from Karbon (default), or Never (Max).
- 2026-10-23: The default panel should open without a scroll bar when possible (Max).
- 2026-10-23: The privacy policy is linked from the Preferences footer and the setup guide: https://sites.google.com/navicaconsulting.com/reckonry-timer-privacy-policy/home (Max).

## Pausing and away time
- 2026-10-22: Pause on screen lock. On wake after sleep, flag the away time in the time entry note rather than backdating (Max).
- 2026-10-22: Auto-pause appends a note to the time entry: "Auto paused at [datetime]" (Max).
