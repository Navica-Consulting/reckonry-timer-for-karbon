# Plan: Time entry rules (internal vs. client contacts)

Drafted 2026-11-05 from Max's feature brief. Not built. Parked on 2026-11-05: Max judged it high effort for moderate gain. If it comes back, start with the capture session in section 4.

## 1. What the codebase has today

### Manifest and permissions (0.7.35)
- Manifest V3. Permissions: `storage`, `idle`, `alarms`, `notifications`, `cookies`.
- Host access: `https://app2.karbonhq.com/*` and `https://*.karbonhq.com/*` (the regional API host, like `us3.karbonhq.com`). `build.sh` rewrites the app origin per target.
- Background service worker: `background.js`. Toolbar panel: `popup.html`. Options page: `welcome.html` (setup, settings, help, and support on one page). Finish form: `complete.html`, opened in the panel or a small window.

### Content scripts
| Script | World | Timing | Job |
| --- | --- | --- | --- |
| `karbon.js` + `page.js` | MAIN | `document_start` | Shared API client. Wraps `window.fetch` read-only to learn keys, API host, and timer state. Hooks `WebSocket.prototype.send` to hear `StopwatchChanged`. Runs commands sent by `content.js`. |
| `defaults.js`, `notes.js`, `errors.js`, `content.js` | Isolated | `document_start` | Bridge to the background via `postMessage`. Watches SPA routes (polling `location.pathname`) for work and contact pages. Shows toasts and prompts. |

`XMLHttpRequest` is not wrapped anywhere today.

### Settings storage
- `storage.sync`: user settings only, read with `DEFAULTS` from `defaults.js`.
- `storage.local`: account keys, `timeCfg`, `lookups` (roles and task types), last-used picks, `workPicks`, `errorLog`, and connection state.
- `storage.session`: timer state, pending finish form, and short-lived flags.
- No `storage.managed`, and no import or export.

### How it talks to Karbon
- Karbon's internal JSON API, never the public API, with the signed-in session cookie. `karbon.js` is the one client. It runs in the background worker with no tab, and in a Karbon tab through `page.js` as a fallback.
- The DOM is read only for the URL (work item and contact keys) and Karbon's Ember session service. The extension never reads or changes Karbon's own forms today.

### UI patterns
- Page cards: `makeCard()` in `content.js`, a closed shadow root with the panel's tokens, `role="status"` toasts, and a `role="alertdialog"` prompt with labelled heading and description. Dismiss X and Escape since 0.7.35.
- Extension pages: `el()` and `$()` from `ui.js`, shared `ui.css`, switches as `input[role=switch]` with `aria-describedby` help, a `role=status` save line, Reset links per setting.
- No tests, no test runner, and no dependencies. Node 24 is on the Linux machine, so `node --test` works with no install.

## 2. Time entry entry points

Confirmed means captured on the live tenant (`artifacts/capture-summary.md`). Not captured means I have not observed it, and I will not guess its endpoint or fields.

| Entry point | Endpoint | Method | Status |
| --- | --- | --- | --- |
| Karbon timer: stop and save | `/time/api/{tenant}/timeEntries`, body `{ timeEntry }` | POST | Confirmed |
| Karbon timer: start, or change role and task type | `/time/api/{tenant}/stopwatches/{user}`, body `{ stopwatch, action }` | PUT | Confirmed for start and notes. Role and task type edits only as the extension sends them. |
| Extension finish form, Stop, Swap, and day-end save | Same POST, sent by `karbon.js` from the **background worker** | POST | Confirmed |
| Delete an entry | `/time/api/{tenant}/timeEntries/{guid}` | DELETE | Confirmed (not a rule target) |
| Manual "Add time" on a work item | | | Not captured |
| Time logged on a contact or organization page | | | Not captured |
| Timesheet grid (cell edit, add row) | | | Not captured |
| Weekly or bulk timesheet save | | | Not captured |
| Edit an existing entry | Probably a PUT on the entry, but not seen | | Not captured |

Fields confirmed on a saved entry: `entityPermaKey` and `entityLinkType` (`WorkItem`, `Contact`, `Organization`, or `ClientGroup`), `actorPermaKey` (role), `taskTypePermaKey`, `userProfilePermaKey`, `minutes`, `startDateTime`, `entryType: "Timer"`, `timeType: "Daily"`.

## 3. Roles, task types, and contacts

- Roles: `GET /tenant/api/{tenant}/userActorListItems`. Task types: `GET /tenant/api/{tenant}/taskTypes`. Both confirmed and already cached by the extension, keyed by ID. "None" is `NONE` or null.
- Contact custom fields: **not captured.** No call that lists the firm's custom field definitions, or reads one contact's values, has been observed.
- A work item's client: **by name only** today. Search and recents return the client's name, not its key (see the 0.7.28 thread in `handoff.md`). Classifying a work item's contact needs a work item detail call that returns the client key. Not captured.
- A client's open work items: **not captured.** This is the same gap as the Client and Work fields thread.
- Karbon has a native rule system of its own. Its app code calls `GET /time/api/{tenant}/workItemRoleTaskTypeRestrictions?workItemPermaKey={work}`, which returns `{ restricted, pairs }`, when the firm's `roleTaskTypeFilterMode` is `ByWorkTasksAndBudgetEstimates`. The test tenant has it `Disabled`. This limits by work item budgets, not by internal or client, but it shows where Karbon itself filters its pickers.

## 4. Capture session needed before building

Step 2 of the brief asks for real traffic, and most of it isn't captured yet. This needs Max signed in to Karbon in the browser pane (or Claude in Chrome), and approval to create and then delete test entries on the live tenant, as in the earlier capture sessions. Read the network log for each of these:

1. Manual Add time on a work item, then edit that entry, then delete it.
2. Add time on a contact page and an organization page.
3. Timesheet grid: edit a cell, add a row, and save a week with several rows changed.
4. Open a work item and find the call that returns its client key.
5. Open a client's Work tab and find the call that lists its work items.
6. Open a contact and find the calls for custom field definitions and values. Edit a custom field and record the save call.
7. For each save, note whether Karbon uses `fetch` or `XMLHttpRequest`, and how its UI reacts to a 4xx response and to a rejected promise. This decides how a cancel looks to Karbon.
8. Snapshot each payload, with keys replaced, into `test/fixtures/` for the parsing tests.

If an entry point uses a call the fetch wrapper can't see (a websocket, a form post), the plan for that entry point changes, and I'll say so before building it.

## 5. Implementation plan

### New files
- `src/rules.js`: pure logic. No DOM, no `chrome`, no network. Exports `classify(contact, rules)`, `allowed(kind, key, contactClass, rules)`, `check(entry, ctx, rules)` returning a list of violations, and `merge(managed, sync, local)` for precedence. Works as a browser global and through `module.exports`, so `node --test` can load it.
- `src/entries.js`: pure payload parsing and rewriting, one adapter per confirmed endpoint. `parse(method, url, body)` returns zero or more normalized entries `{ index, workKey, linkType, contactKey?, roleKey, taskTypeKey, existingId? }`. `rewrite(body, index, { roleKey, taskTypeKey, workKey })` returns the corrected body. Unknown endpoints return nothing, so they pass through untouched.
- `src/guard.js`: MAIN world, `document_start`, loaded with `karbon.js` and `page.js`. Wraps `fetch` and `XMLHttpRequest.prototype.open` and `send` for the confirmed endpoints only. Holds a matching request, asks `content.js` for a verdict, and shows the modal through it.
- `src/classify.js`: contact classification with a cache in `storage.local` (key `ruleContacts`, TTL 12 hours). Resolves a work item to its client key. Used by the background and the page.
- `test/rules.test.js`, `test/entries.test.js`, `test/fixtures/*.json`, and `test/MANUAL.md`.

### Changes to existing files
- `page.js`: merge the fetch wrapper with the guard, so there is one wrapper, not two stacked ones.
- `karbon.js`: `stopAndSave` and `start` call the rules before writing. The extension's own saves go from the background worker, so the page wrapper never sees them. The finish form shows the same violations inline and filters its Role and Task type selects.
- `content.js`: the modal (a `role="dialog"` `aria-modal` card with a focus trap, built on `makeCard`), the "Mark as internal" button on contact, organization, and client group pages, and the form filtering observer.
- `welcome.html` and `welcome.js`: a new "Time entry rules" card. `popup.html`: a one-line status with a link.
- `defaults.js`: new settings below.
- `manifest.json`: add `guard.js` to the MAIN world entry, and `"storage": { "managed_schema": "managed_schema.json" }`. New file `src/managed_schema.json`.
- `build.sh`: no change expected.

### Settings (`storage.sync`)
`rulesOn: false`, `roleRulesOn: true`, `directConfirmOn: false`, `unclassifiedAs: 'Client'`, `failMode: 'open'`, `ruleField: { fieldKey, value } | null`, `roleTags: { [roleKey]: 'Internal' | 'Client' }`, `taskTypeTags: { [key]: ... }` (Both is stored as no entry, so an empty rule set is the default), `directExempt: [taskTypeKey]`, `internalKeys: [contactKey]`.

`internalKeys` moves to `storage.local` when the sync write fails with a quota error, and a flag says where it lives. Display names are cached in `storage.local` only, so sync holds keys.

### Precedence
Managed rules, when present, replace user rules entirely and the card shows them read-only. Then the manual list, then the custom field rule, then the unclassified default.

### Enforcement
1. **Form filtering.** A `MutationObserver` in `content.js` finds Karbon's Role and Task type pickers in time entry forms, and disables options the rules block, with a short reason. Karbon's pickers are custom Ember components, not `select` elements, so this depends on what the capture session shows. It's best effort. Layers 2 and 3 are what enforce.
2. **Pre-submit check.** A capture-phase listener on the form's save button runs the same check and shows an inline message beside the button.
3. **Network backstop.** The guard holds a matching request and resolves it in one of three ways: the original request with the original body, the original request with a corrected body, or a clean rejection. A hold never outlives 60 seconds; at that point it follows `failMode`. Classification lookups time out after 3 seconds and follow `failMode` too.

The stopwatch start is not blocked. Blocking it would lose the time that's already running. A start that breaks a rule gets a warning toast, and the rule is enforced when the entry is saved.

### Feature 3
The guard and `karbon.js` treat an entry with `entityLinkType` other than `WorkItem` as direct to a contact. "Choose a work item" lists the contact's open work once the call from capture step 5 is known. Until then it cancels the save and returns the person to the form. One modal lists every violation and the direct-to-contact question together.

### Import, export, and managed rules
- Export writes a JSON file with a schema version, the rules, and display names for review. Import shows a summary before it applies, and drops keys this firm doesn't have.
- Stale rules: any tagged key not in the latest role or task type list is listed on the card with a Remove button.

### Commits
1. `rules.js` and its unit tests.
2. Capture fixtures and `entries.js` with its tests.
3. Settings, storage, import, export, and managed schema.
4. Options page card.
5. Classification, cache, and the Mark as internal button.
6. Enforcement in the extension's own saves (`karbon.js`, finish form).
7. Guard and modal.
8. Form filtering and pre-submit check.
9. Feature 3.
10. README section, manual checklist, and the privacy review.

Each commit leaves the extension working, and with every option at Both and Feature 3 off, the guard passes every request through without a hold.

## 6. Permissions and privacy

- **New permissions: none expected.** The existing `storage` covers `storage.managed`. The existing host access covers every Karbon call. No `debugger`, no `webRequest`.
- **New data:** contact keys and names in the internal list, custom field values for the chosen field, a contact classification cache, and a work item to client map. These are new kinds of client data, and the internal list syncs through Chrome Sync.
- That triggers the review in `docs/PRIVACY.md`, a policy update in `docs/privacy-policy.md`, and the store's Privacy tab.

## 7. Open questions

1. **Capture session.** May I run it on the live tenant, creating and deleting test entries, with you signed in to Karbon in the browser pane? Or would you rather use the stage tenant?
2. **Single purpose.** The store listing is a timer extension. Enforcing time entry rules fits "time tracking in Karbon" but widens it. Do you want it in this extension, or as a separate one?
3. **Who sets the rules.** Is this for a firm admin pushing one setup, or for each person? Managed policy needs Google Workspace or Chrome Enterprise; most small firms will use Import.
4. **Karbon's own setting.** Have you checked whether Karbon's Time and Budgets settings, or the role and task type filter mode, already cover part of this?
5. **Cancelling a held save.** A rejected request may show Karbon's generic error toast. Is that acceptable, or should cancel try to look like a silent no-op? The capture session will show what Karbon does with each.
6. **Starts.** Is a warning at start, with enforcement at save, the right call for the timer?
7. **Partial support.** If a timesheet or bulk save turns out not to be safely rewritable, may it ship as "block and explain" only, with no in-modal fix?
8. **Version.** 0.8.0 for this feature, or keep going in 0.7.x?
