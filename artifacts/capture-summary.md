# Capture summary: Karbon timer endpoints

Captured 2026-10-23 on Max's test tenant. Keys are shown as `{tenant}`, `{user}`, `{work}`, and similar placeholders. No tokens or cookies were recorded.

## Authentication
- Karbon's own API calls carry no `Authorization` header. They rely on the signed-in session cookie, so same-origin `fetch` from the page works with no extra auth.
- Karbon's calls send three custom headers:
  - `x-karbon-connection-id`: the tab's SignalR connection ID (22 characters). The server uses it to skip echoing a change back to the tab that made it.
  - `x-karbon-local-time`: local ISO time with offset, for example `2026-10-23T09:17:06-05:00`.
  - `x-practiceiq-current-route`: the route without the tenant, for example `/work/{work}`.
- `content-type: application/json`.

## The stopwatch
- There is one stopwatch per user. Its ID is the user's profile key: `/time/api/{tenant}/stopwatches/{user}`.
- `GET` returns the current state. Every write is a `PUT` to the same URL with the body `{ "stopwatch": { ...full object..., "action": "<verb>" } }`.
- Fields: `entityPermaKey` (work item key), `entityLinkType` ("WorkItem"), `actorPermaKey` (role), `taskTypePermaKey`, `description`, `stopwatchState` ("Stopped", "Started", or "Paused"), `initialStartDateTime`, `startDateTime`, `pauseDateTime`, `recordedSeconds`, `budgetMinutes`, plus display fields (`workItemTitle`, `clientName`, `taskTypeName`, and similar) that may be null on requests.

## Actions observed
| User step | Calls |
| --- | --- |
| Start | `PUT action=start` with state "Stopped", the work key, role, and task type. The UI then sends `PUT action=update`. |
| Pause | `PUT action=pause` |
| Resume | `PUT action=start` with state "Paused" |
| Edit note | `PUT action=update` with `description` |
| Stop and save | `PUT action=pause`, then `POST /time/api/{tenant}/timeEntries` (201), then `PUT action=Confirm`, which clears the stopwatch |
| Discard | `PUT action=Cancel`, which clears the stopwatch with no entry saved |
| Delete an entry | `DELETE /time/api/{tenant}/timeEntries/{guid}` (204) |

## Saving a time entry
- `POST /time/api/{tenant}/timeEntries` with `{ "timeEntry": {...} }`.
- Key fields: `entryType: "Timer"`, `timeType: "Daily"`, `startDateTime` as a date only (`2026-10-23`), `minutes`, `description`, `entityPermaKey`, `entityLinkType`, `actorPermaKey`, `taskTypePermaKey`, and `userProfilePermaKey`.
- Karbon always rounds up to the next whole minute. Confirmed by Max: 27 seconds saved as 1 minute, and 1:01 saved as 2 minutes.
- The response returns a GUID `id`. Deletion uses that GUID.
- Reading one entry back: `GET /time/api/{tenant}/timeEntries/{guid}` returns the stored entry with display names filled in (`actorName`, `taskTypeName`, `taskTypeBillable`).
- The POST response echoes the request's null display fields and `taskTypeBillable: false`. The stored entry derives billable from the task type, so the request's `taskTypeBillable` value does not matter.

## Live sync
- The SignalR hub is at `wss://us3socket.karbonhq.com/karbonAppHub`.
- Other tabs receive `StopwatchChanged` with null arguments, then re-fetch the stopwatch. The tab that made the change does not receive it.
- Other messages seen: `TriageUpdated`, `CalendarUpdated`, `Changed` (timesheet), and the client invocations `Subscribe` and `SubscribeWork`.

## Side effects of starting a timer
- `PUT /todo/api/{tenant}/myWeekListItemWorks/{work}` with `action: "move"` moves the work item in My Week.
- `POST /tenant/api/{tenant}/recentsList` records the item in recents.
- The extension does not need to replicate either one.

## Prefill
- The start request carries role and task type from the client side. Karbon's UI chooses them; the server only supplies the budget source below.
- Lookups are available at `/tenant/api/{tenant}/userActorListItems` and `/tenant/api/{tenant}/taskTypes`. Response formats are under "Role and task type lists" below.
- Read from Karbon's app code on 2026-10-24 (`resolvePrefillDataForMode`). Karbon prefills only when the timer has no role or task type, and again whenever a work item is picked. The firm's `timeEntryPrefillMode` picks the source:
  - `WorkItem`: the role and task type of your last saved entry on this work item. Karbon keeps these in the browser's IndexedDB (`RecentTimeEntries`, keyed by tenant and work item) for 100 days, written on each save, even when empty.
  - `Budget`: `GET /time/api/{tenant}/estimateActualInfos?entityPermaKey={work}&entityLinkType=WorkItem&Assignee[]={user}` returns `estimateActualInfos[]` with `actorPermaKey` and `taskTypePermaKey`. Used only when exactly one row comes back. Confirmed live with a 200 on the test tenant.
  - `LastSelected`: `localStorage` keys `{tenant}-time-entry-role` and `{tenant}-time-entry-task-type`, written whenever you pick one in Karbon's timer.
  - `Smart` (the test tenant's mode): those three in order, the first that gives either key. `Blank`: nothing.
  - Karbon follows the firm's mode only with the `PrefillRoleAndTaskTypeImprovements` feature flag on; otherwise it always uses Smart.
- Also seen: `GET /time/api/{tenant}/workItemRoleTaskTypeRestrictions?workItemPermaKey={work}` returns `{ restricted, pairs }`. Karbon calls it only when the firm's `roleTaskTypeFilterMode` is `ByWorkTasksAndBudgetEstimates`. The test tenant has it `Disabled`. The extension doesn't use it yet.

## Behavior notes
- Only one timer can run at a time. Switching work items means stopping and saving (or discarding) first, then starting the new item.
- Starting a timer on a work item sends the full stopwatch object, so the extension should always read the current state before writing.
- Analytics calls (`/v1/track`, `/v1/page`) carry user traits. The extension never sends to or reads from them.

## Search and recents (captured 2026-10-23, second session)
- Search: `GET /search/api/{tenant}/globalSearchItems?searchTerm=…&skip=0&take=N&filterType=work|contact&showEmailAsSubtitle=true`.
  - Work searches add `statuses[]` for each status to include: InProgress, Waiting, ReadyToStart, Planned, and Completed.
  - Response: `globalSearchItems[]` with `id` (the key), `entityType`, `title`, `subtitle`, and `workItemStatus`.
  - `entityType` values: "WorkItem" for work; "contact", "organization", and "client-group" for contacts.
- Recents: `GET /tenant/api/{tenant}/recentsList?entityType=WorkItems&skip=0&take=N`.
  - Response: `recentsLists[]` with `id`, `entityLinkType`, `entityName`, `workItemClientName`, `workItemStatus`, and `workItemDueDate`.
  - The call fails without the `entityType` parameter.
- Not yet verified: starting a timer on a contact or organization. The extension sends `entityLinkType` "Contact" or "Organization" and reports an error if Karbon does not accept it.

## Contacts, firm time settings, and drafts (captured 2026-10-23, third session)
- Timer link types: `WorkItem`, `Contact` (a person), `Organization`, and `ClientGroup`. Starting a timer on a contact uses the same stopwatch `PUT`, with `entityLinkType` set to the contact type. Confirmed working.
- Karbon page URLs: `/{tenant}/work/{key}`, `/{tenant}/contacts/{key}`, `/{tenant}/organizations/{key}`, and `/{tenant}/client-groups/{key}`.
- Firm time settings: `GET /time/api/{tenant}/timeTenantSettings/{tenant}` returns `timeTenantSettings`.
  - `timeTrackingEntity: "Work"` means time can be booked to work items only. `"WorkAndClients"` means contacts are allowed too (captured in the fifth session).
  - Also present: `isNotesRequired`, `isActorRequired`, `isTaskTypeRequired`, `timeEntryPrefillMode` ("Smart"), `timesheetApprovalEnabled`, and `budgetsEnabled`.
  - Saving the settings page sends `PUT` to the same path with `{ timeTenantSetting: {...} }`.
- Email drafts: `POST /contentitems/api/{tenant}/draftEmails` with `{ draftEmail: {...} }`. `attachToContactPermaKey`, `attachToOrganizationPermaKey`, `attachToClientGroupPermaKey`, and `attachToWorkItemPermaKey` can all be null, so a draft can exist with no contact attached. Deleting uses `DELETE /contentitems/api/{tenant}/draftEmails/{key}`. The format for recipients, and the call that saves edits, have not been captured yet.

## Role and task type lists (captured 2026-10-23, fourth session)
- Roles: `GET /tenant/api/{tenant}/userActorListItems` returns `{ userActorListItems: [{ id, name, isDefault, avatarColorId }] }`.
  - The test tenant returned 10 roles. "None" has `id: "NONE"` and `isDefault: true`; the others have 10 to 12 character perma keys.
- Task types: `GET /tenant/api/{tenant}/taskTypes` returns `{ taskTypes: [{ id, title, billable, isAvailable, isDefault, action, replaceWithTaskType }] }`.
  - The test tenant returned "None" (default), "Billable", and "Not Billable". The name field is `title`, not `name`.
- Confirmed by a live start and save: list `id` values are the stopwatch's `actorPermaKey` and `taskTypePermaKey`. A timer started with Consultant and Billable showed both names, and the saved entry read back as Consultant, Billable, and billable.
- Role "None": starting with `actorPermaKey: "NONE"` and with `null` both work. Karbon stores either as a null role, so a running timer never reports "NONE". Firms with `isActorRequired` on were not tested.
- The extension hides task types where `isAvailable` is false, and saves the role and task type picked in the panel as last used, since a "None" role cannot be learned from the timer.

## Setup without opening Karbon or starting a timer (captured 2026-10-23, fifth session)
- Karbon sets a readable cookie, `bootstrap-cookie-prod`, on `app2.karbonhq.com`. It is not HttpOnly and holds no secrets.
  - Its value is URL-encoded `key=value` pairs joined by `&`: `tenantPermaKey`, `userProfilePermaKey`, `dataCenterUrl` (for example `https://us3.karbonhq.com`), and `bootstrapEndpoint`.
  - The suffix is Karbon's boot environment. Production is `prod`. The stage suffix was not captured; matching any cookie named `bootstrap-cookie-*` covers both.
  - Checked 2026-10-24: the cookie is on `.karbonhq.com`, path `/`, not partitioned, and expires 7 days after it is written. Loading Karbon again did not renew it, so it is written at sign-in or bootstrap. A browser can stay signed in after it expires, and then the extension finds no cookie until Karbon writes it again.
  - The cookie is not Secure. Chrome's cookies API checks an extension's host access against `http://` for non-Secure cookies, so with https-only host permissions the extension never sees it (0.7.34 showed "url: 3 cookies", the Secure ones). Seeing it needs `http://*.karbonhq.com/*` host access.
  - The cookie names the user's default tenant. A user with several tenants may be working in another one; the tenant in an open Karbon tab's URL wins when present.
- Bootstrap endpoint: `GET {dataCenterUrl}/api/{tenant}/userEnvironmentSettings/{user}` returns `{ userEnvironmentSettings }` with `tenantPermaKey`, `userProfilePermaKey`, `tenantName`, `userFullName`, `userEmail`, `dataCenter` ("us3"), `dataCenterUrl`, `socketUrl` (`https://us3socket.karbonhq.com`), `enableTimeAndBudgets`, `roles`, and feature flags. It also returns analytics and push keys the extension must not store.
- In a Karbon tab, the same values are on Ember's session service: `StagingApp.__deprecatedInstance__.lookup('service:session')` exposes `tenantPermaKey`, `userProfilePermaKey`, `siteBaseUrl`, `dataCenter`, and `socketUrl`.
- The API host is regional (`us3` here). The extension should read `dataCenterUrl` rather than hard-code a host.
- With only the cookie's values, and no timer ever started in the session, these calls returned 200:
  - `GET /time/api/{tenant}/stopwatches/{user}` (state "Stopped").
  - `GET /time/api/{tenant}/timeTenantSettings/{tenant}`.
- Verified 2026-10-24 (0.7.18): the extension's background worker can read and write the stopwatch on `us3.karbonhq.com` with no Karbon tab open. Karbon accepts the extension's origin and needs no CSRF token or connection ID.

## A client's Work tab (captured 2026-11-06, Max's tenant, read-only)
- Opening a client's Work tab sends `POST /todo/api/{tenant}/workViewListItems` to the regional API host. Seen on a person, an organization, and a client group.
- Body: `{ take: 40, skip: 0, <client filter>, listSortBy: "status", sortDescending: false, status: [...], impliedStatus: [...] }`.
  - The client filter is keyed by kind: `client: [key]` for a person (contact) or an organization, and `clientgroup: [groupKey]` for a client group. A person was captured on 2026-11-06 (page `/{tenant}/contacts/{key}/work-view`), with the same body as an organization.
  - Calling it from the page with the same body, read-only, returned 200 and matched what the tab showed (a person with no work returned an empty list).
  - Default view (active work): `status: ["Planned"]`, `impliedStatus: ["ReadyToStart", "InProgress", "Waiting"]`. With completed work included, both are empty arrays, which means every status.
  - Paging: `take` 40, `skip` grows as the list scrolls.
- Response: `{ workViewListItems: [...] }`, each with `workItemPermaKey`, `workItemTitle`, `workItemStatus`, `clientPermaKey`, `clientLinkType`, `clientDisplayName`, `clientGroupPermaKey`, `clientGroupName`, `workTemplateTitle`, `startDate`, `dueDate`, `completedDate`, and checklist counts. No search term: the list is filtered by client only.
- A client group's list includes work for its member clients, each with its own `clientPermaKey`.
- The tab also sends `POST /todo/api/{tenant}/viewFilterResultSummaries` with the same client filter and a `status` list of built-in names plus the firm's custom status keys, for the filter counts. `GET /tenant/api/{tenant}/statusLookups` and `workTypeLookups` load the filter menus.
- Use in the extension: with a client chosen, fetch that client's active work with this call (by its key and kind) and filter titles locally, instead of matching client names in global search. This fixes the 25-result limit and client groups.
