# Plan: Admin time

Drafted 2026-10-24 from Max's request. Not built. First mockup (fixed sections): https://claude.ai/artifact/CizYaeVtr1zJKio9n9wTNP. Groups mockup (current direction): https://claude.ai/artifact/2kuBYAU5uceeWqMQY3C37G

## Goal
Time spent on Karbon pages that aren't a client or a work item (Triage, Billing, Settings, and the like) goes to an admin setup: client, work item, role, and task type. Default is the fallback. The person makes their own groups, each with its own setup, and drags Karbon's pages into them. A page can be in only one group, and a page in no group uses Default.

## Karbon page map
Walked Karbon's left navigation and settings menu, read-only, on 2026-10-24. Paths leave out `/{tenant}`.

| Section | Karbon pages | Paths |
| --- | --- | --- |
| Email | Triage, Later, Low Priority, Scheduled, Sent, Cleared, Drafts | `/triage`, `/later`, `/low-priority`, `/scheduled`, `/sent`, `/cleared`, `/drafts`, `/conversation/{key}/email` |
| Planning | My Week, Colleague's Week, Assignments, Work and Contacts lists | `/my-week`, `/colleagues-week-list`, `/assignments`, `/work-overview`, `/contacts` (list only), `/segments` |
| Reports | Analytics, Insights, Colleague Utilization | `/intelligence/*`, `/insights/*`, `/timesheets/colleague-report` |
| Timesheets | Current timesheet, All timesheets | `/timesheet/{key}`, `/timesheets/previous-periods`, `/timesheet-period/{key}` |
| Billing | Dashboard, Recurring Billing, Unbilled, Billing Runs, Invoices, Realization | `/billing`, `/billing/recurring-billing`, `/billing/unbilled`, `/billing/billing-runs`, `/billing/invoices/*`, `/billing/realization` |
| Receivables | Receivables, Finance (payments, payouts, accounting periods) | `/billing/receivables/*`, `/billing/finance/*` |
| Engagements | Engagements, Service Templates | `/engagements`, `/settings/service-templates-gateway` |
| Workflow and templates | Workflow, Automators, Queues, Work Templates, Email and Billing Templates, Filing Deadlines | `/workflow/*`, `/work-templates`, `/settings/email-templates`, `/settings/billing-templates`, `/settings/filing-deadlines` |
| Firm settings | Everything else under Settings, Colleagues, Teams, Roles, Time and Budgets, Subscription, Connected Apps | `/settings/*`, `/subscription`, `/colleagues/*`, `/time`, `/contact-settings`, `/connected-apps/*` |

Left to the existing Work and Clients rules: `/work/{key}`, `/contacts/{key}`, `/organizations/{key}`, `/client-groups/{key}`.

Open on the map:
- Engagement detail (`/engagements/{key}/services`) is for one client. It counts as Engagements for now.
- An email filed to a work item would be better booked to that work item. The URL of an email opened inside Triage, and how to read its work item, aren't captured.
- Shared Triage inboxes weren't opened. Check that they stay under `/triage`.
- Unmatched internal pages fall back to the default only if they're on an allow list, so a new Karbon page doesn't start a timer by surprise.

## Behavior
- Off until set up. Turning it on needs at least a client or a work item in the default.
- No timer running: Auto-start (default, 10 seconds then the 5-second countdown), Remind me, or Do nothing.
- A timer running on other work: "Switch a running timer to admin time," off by default, 30 seconds when on. The long wait keeps a quick look at Triage from splitting client time.
- Moving between two admin sections with different setups switches after the same wait. Same setup: nothing happens.
- Opening a work item or client from admin time follows the existing Auto-switch Work and Clients settings.
- A paused timer is left alone. A blank running timer is left alone too (see open questions).
- Role and task type come from the setup, not from prefill.
- Stamped notes name only the section, like "Auto started on Receivables," never a client or work item.
- The page card has Cancel and "Not on this page," which turns that section off.

## Settings and setup
- 2026-10-24: Max asked for user-made groups instead of fixed sections. The headings in the page map only sort the pages inside Default.
- New "Admin time" card after Auto-switch on the settings page, two columns wide. The panel's Preferences gets a one-line switch with a link to the page.
- Left: Default, with its setup and every page that isn't in a group, under the page map's headings. Dragging a heading moves all of its pages.
- Right: the groups, which stay in view while you scroll the list. Each has a name, a color, a one-line setup with Edit (Client, Work, Role, Task type, using the same `pickField` and selects as the start form), and its pages. Deleting a group sends its pages back to Default.
- A built-in "Leave the timer alone" group has no setup, and its pages never start or switch the timer.
- Pressing a page or a heading opens a "Move to" menu, so keyboards and touch screens can do what dragging does.
- Setup gets an optional step 4, "Track admin time," that links to the card. It doesn't hold back "You're set up."

## Code outline
- `src/defaults.js`: `adminTime: false`, `adminStartMode`, `adminStartSeconds: 10`, `adminSwitch: false`, `adminSwitchSeconds: 30`.
- New storage key `adminGroups` in `storage.sync`: `{ default: {client, work, role, taskType}, groups: [{ id, name, color, setup, pages: [pageId] }], leave: [pageId] }`. Each pick keeps key, link type, and display name. Page IDs are stable names like `triage`, so a group survives changes to Karbon's paths.
- New `src/sections.js`: the page list (ID, name, heading, path pattern) and `pageFromPath()`, loaded by `content.js` and the settings page.
- `content.js`: the route loop also watches for a section change, and `onOpen` gets an admin branch that reuses `later`, `autoAct`, and the toast.
- `background.js`: start with the section's setup, skipping prefill. Compare the running timer's work, role, and task type to the setup before switching.
- `welcome.html` and `welcome.js`: the card and step 4. `popup.html`: the switch.

## Privacy
New storage key with internal client and work names, synced through Chrome Sync. No new permissions, hosts, or destinations. Needs the `docs/PRIVACY.md` review and a line in `docs/privacy-policy.md`.

## Open questions for Max
- Should Planning pages (My Week, Assignments, the Work and Contacts lists) start in Default or in Leave the timer alone?
- Should a new install come with example groups, or with Default only?
- A blank timer running when you open Triage: leave it, or offer "Book this timer to admin time"?
- Should the running-timer switch default to on? The mockup leaves it off.
