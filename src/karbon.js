// Karbon's timer API, shared by page.js (inside a Karbon tab) and background.js (no tab needed).
// env: { fetch, keys, route, onState, onTimeSettings, onSaved, log }. keys() returns { tenant, user, base }
// and may be async. Errors that mean Karbon couldn't be reached carry reach: true, so the
// background knows a Karbon tab might still work.
// eslint-disable-next-line no-unused-vars
const KT_SIGNED_OUT = 'You are signed out of Karbon. Sign in to Karbon, then try again.';
// eslint-disable-next-line no-unused-vars
function KTKarbon(env) {
  let K = { tenant: null, user: null, base: null };
  let sw = null;      // the last stopwatch read
  let timeCfg = null; // the firm's time settings. entity "Work" means time can only be booked to work items.
  let writes = 0;     // successful writes so far
  const log = (...a) => env.log && env.log(...a);
  const unreachable = (msg) => Object.assign(new Error(msg), { reach: true });
  // A 401, or Karbon's sign-in page where data should be, means this browser is signed out of Karbon.
  const signedOut = () => Object.assign(new Error(KT_SIGNED_OUT), { reach: true, signedOut: true });

  const summarize = (s) => s && {
    state: s.stopwatchState,
    work: s.entityPermaKey,
    linkType: s.entityLinkType,
    title: s.workItemTitle,
    client: s.clientName,
    description: s.description || '',
    recordedSeconds: s.recordedSeconds || 0,
    initialStart: s.initialStartDateTime,
    startDateTime: s.startDateTime,
    pauseDateTime: s.pauseDateTime,
    roleKey: s.actorPermaKey,
    taskTypeKey: s.taskTypePermaKey,
    tenant: K.tenant,
    user: K.user,
    base: K.base,
  };

  // k: keys from the caller, when the stopwatch came from Karbon's own call rather than ours.
  function noteStopwatch(s, k) {
    if (!s) return;
    if (k) K = { ...K, ...k };
    sw = s;
    if (env.onState) env.onState(summarize(s));
  }

  async function useKeys() {
    const k = await env.keys();
    if (!k || !k.tenant || !k.user || !k.base) throw Object.assign(unreachable('Karbon is still loading. Try again in a few seconds.'), { noKeys: true });
    K = { tenant: k.tenant, user: k.user, base: k.base };
  }

  // ---- Helpers ----
  const pad = (n) => String(n).padStart(2, '0');
  const localIso = (d = new Date()) => {
    const off = -d.getTimezoneOffset();
    const sign = off >= 0 ? '+' : '-';
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
  };
  const localDate = (iso) => {
    const d = iso ? new Date(iso) : new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const mask = (p) => p.replace(/\/[A-Za-z0-9]{10,14}(?=\/|$)/g, (s) => (/\d/.test(s) ? '/{key}' : s)).replace(/searchTerm=[^&]*/, 'searchTerm=…');
  const joinNote = (desc, note) => (note ? (desc ? `${desc}\n${note}` : note) : desc || '');

  // No x-karbon-connection-id: without it, Karbon notifies every tab,
  // so Karbon's own timer display refreshes after the extension changes the timer.
  function headers() {
    return {
      'content-type': 'application/json',
      'x-karbon-local-time': localIso(),
      'x-practiceiq-current-route': env.route ? env.route() : '/',
    };
  }

  async function call(method, path, body) {
    const where = `${method} ${path.split('/').slice(1, 4).join('/')}`;
    let res;
    try {
      res = await env.fetch(K.base + path, {
        method,
        headers: headers(),
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'include',
      });
    } catch {
      throw unreachable(`Could not reach Karbon for ${where}.`);
    }
    log(method, K.base + mask(path), res.status);
    if (res.status === 401) throw signedOut();
    // Karbon refused a call that didn't come from its own page.
    if (res.status === 403) throw unreachable(`Karbon returned ${res.status} for ${where}`);
    if (!res.ok) throw new Error(`Karbon returned ${res.status} for ${where}`);
    if (method !== 'GET') writes++;
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw signedOut();
    }
  }

  const swPath = () => `/time/api/${K.tenant}/stopwatches/${K.user}`;

  // ---- Timer actions ----
  async function getState() {
    const j = await call('GET', swPath());
    noteStopwatch(j && j.stopwatch);
    return sw;
  }

  // Re-read the timer after every write, so success is only reported when the change really happened.
  const EXPECT = { start: 'Started', pause: 'Paused', Confirm: 'Stopped', Cancel: 'Stopped' };
  async function verify(action, before, work) {
    const after = await getState();
    const want = EXPECT[action] || before;
    log(`${action}: ${before} -> ${after.stopwatchState} (expected ${want})`);
    if (after.stopwatchState !== want || (action === 'start' && work && after.entityPermaKey !== work)) {
      throw new Error(`Karbon accepted "${action}" but the timer is ${after.stopwatchState}, not ${want}.`);
    }
    return after;
  }

  async function putAction(action, overrides = {}) {
    const cur = await getState();
    const s = { ...cur, ...overrides, action, currentDateTime: null };
    delete s.id;
    if (s.customFields == null) s.customFields = [];
    if (s.activities == null) s.activities = [];
    await call('PUT', swPath(), { stopwatch: s });
    return verify(action, cur.stopwatchState, cur.entityPermaKey);
  }

  // The firm's time settings: whether time can go to contacts, and whether notes are required.
  async function timeSettings({ fresh = false } = {}) {
    if (timeCfg && !fresh) return timeCfg;
    const j = await call('GET', `/time/api/${K.tenant}/timeTenantSettings/${K.tenant}`);
    const s = (j && (j.timeTenantSettings || j.timeTenantSetting)) || {};
    timeCfg = {
      entity: s.timeTrackingEntity || null,
      workOnly: s.timeTrackingEntity === 'Work',
      notesRequired: !!s.isNotesRequired,
      roleRequired: !!s.isActorRequired,
      taskTypeRequired: !!s.isTaskTypeRequired,
      prefillMode: s.timeEntryPrefillMode || 'Smart',
    };
    if (env.onTimeSettings) env.onTimeSettings(timeCfg);
    return timeCfg;
  }

  // A timer can start blank: no work item, contact, role, or task type. Karbon allows that,
  // and the missing details are collected when the timer is stopped or switched.
  // description: your own text for the new entry. note: a stamped activity note added after it.
  // stopNote: written on the entry being saved, when this start switches away from another timer.
  // interactive: someone is there to answer the finish prompt, so a required note is asked for, not filled in.
  // With no role or task type given, they're filled in the way Karbon's own timer would (see prefill).
  // prefill: false when the caller's form already did that, so a "None" you chose stays None.
  // Returns the new timer, or { needsCompletion, missing, state } when the running timer can't be saved yet.
  async function start({ workKey = null, linkType = 'WorkItem', roleKey, taskTypeKey, description, note, stopNote, interactive = false, prefill: fill = true, remembered, last, known }) {
    workKey = workKey || null;
    // Firms that book time to work items only can't link a timer to a contact, so it starts blank.
    if (workKey && linkType !== 'WorkItem') {
      const cfg = await timeSettings().catch(() => null);
      if (cfg && cfg.workOnly) workKey = null;
    }
    const cur = await getState();
    if (cur.stopwatchState !== 'Stopped') {
      if ((cur.entityPermaKey || null) === workKey) {
        return cur.stopwatchState === 'Paused' ? resume({ note }) : cur;
      }
      const r = await stopAndSave({ note: stopNote, interactive });
      if (r.needsCompletion) return r;
    }
    if (fill && !realKey(roleKey) && !realKey(taskTypeKey)) {
      ({ roleKey, taskTypeKey } = await prefill({ workKey, linkType, remembered, last, known }));
    }
    const fresh = sw;
    const s = {
      entityPermaKey: workKey, entityLinkType: workKey ? linkType || 'WorkItem' : null, workItemTitle: null, clientName: null,
      actorPermaKey: roleKey || null, actorName: null, actorAvatarColorId: null,
      taskTypePermaKey: taskTypeKey || null, taskTypeName: null, taskTypeBillable: false,
      customFields: [], autoDescription: null, isAutoDescriptionOverridden: false, description: null,
      stopwatchState: 'Stopped', currentDateTime: null,
      initialStartDateTime: fresh.initialStartDateTime, startDateTime: fresh.startDateTime,
      pauseDateTime: fresh.pauseDateTime, recordedSeconds: fresh.recordedSeconds || 0,
      budgetMinutes: 0, action: 'start', activities: [],
    };
    await call('PUT', swPath(), { stopwatch: s });
    const started = await verify('start', 'Stopped', workKey);
    const text = joinNote((description || '').trim(), note);
    return text ? putAction('update', { description: text }) : started;
  }

  async function pause({ note } = {}) {
    const cur = await getState();
    if (cur.stopwatchState !== 'Started') throw new Error(`The timer is ${cur.stopwatchState}, so there is nothing to pause.`);
    const after = await putAction('pause');
    return note ? appendNote({ text: note }) : after;
  }

  async function resume({ note } = {}) {
    const cur = await getState();
    if (cur.stopwatchState !== 'Paused') throw new Error(`The timer is ${cur.stopwatchState}, so there is nothing to resume.`);
    const after = await putAction('start');
    return note ? appendNote({ text: note }) : after;
  }

  async function appendNote({ text }) {
    const cur = await getState();
    if (!text) return cur;
    if (cur.stopwatchState === 'Stopped') throw new Error('No timer is running, so there is nothing to add a note to.');
    return putAction('update', { description: joinNote(cur.description, text) });
  }

  // Changes the running timer's work item, contact, role, task type, or notes. Only the keys passed change.
  // Uses the same update call as notes; it isn't captured for the other fields, so the result is checked.
  async function edit({ workKey, linkType = 'WorkItem', roleKey, taskTypeKey, description }) {
    const cur = await getState();
    if (cur.stopwatchState === 'Stopped') throw new Error('No timer is running, so there is nothing to change.');
    const o = {};
    if (workKey !== undefined) {
      if (workKey && linkType !== 'WorkItem') {
        const cfg = await timeSettings().catch(() => null);
        if (cfg && cfg.workOnly) throw new Error('Your firm books time to work items only.');
      }
      Object.assign(o, { entityPermaKey: workKey || null, entityLinkType: workKey ? linkType : null, workItemTitle: null, clientName: null });
    }
    if (roleKey !== undefined) Object.assign(o, { actorPermaKey: roleKey || null, actorName: null });
    if (taskTypeKey !== undefined) Object.assign(o, { taskTypePermaKey: taskTypeKey || null, taskTypeName: null });
    if (description !== undefined) o.description = description;
    const after = await putAction('update', o);
    const kept = ['entityPermaKey', 'actorPermaKey', 'taskTypePermaKey'].every((k) => !(k in o) || realKey(after[k]) === realKey(o[k]));
    if (!kept) throw new Error('Karbon did not keep the change. Try it in Karbon, or set it when you stop.');
    return after;
  }

  // Used by lock, idle, sleep, and day-end handling: never errors when there is nothing to do.
  async function autoPause({ note }) {
    const cur = await getState();
    if (cur.stopwatchState !== 'Started') return { paused: false };
    await pause({ note });
    return { paused: true };
  }

  async function autoResume({ note }) {
    const cur = await getState();
    if (cur.stopwatchState !== 'Paused') return { resumed: false };
    await resume({ note });
    return { resumed: true };
  }

  // Karbon stores a "None" role or task type as no key.
  const realKey = (k) => (k && k !== 'NONE' ? k : null);

  // What a timer still needs before Karbon will save it: a work item or contact always, plus a role,
  // task type, or note when the firm requires them. userText is the description you wrote, without stamps.
  function missingFor(e, userText, cfg, interactive) {
    const missing = [];
    if (!e.entityPermaKey) missing.push('work');
    if (cfg && cfg.roleRequired && !realKey(e.actorPermaKey)) missing.push('role');
    if (cfg && cfg.taskTypeRequired && !realKey(e.taskTypePermaKey)) missing.push('taskType');
    if (cfg && cfg.notesRequired && interactive && !String(userText || '').trim()) missing.push('notes');
    return missing;
  }

  // fill: details from the finish prompt { workKey, linkType, roleKey, taskTypeKey, description }.
  // They go straight into the saved entry; the running stopwatch is never edited.
  // When something required is missing, nothing is saved and the timer is left as it is.
  async function stopAndSave({ note, fill = null, interactive = false } = {}) {
    let cur = await getState();
    if (cur.stopwatchState === 'Stopped') return { saved: false };
    const f = fill || {};
    const pick = (k, curVal) => (f[k] !== undefined ? f[k] : curVal);
    const e = {
      entityPermaKey: pick('workKey', cur.entityPermaKey) || null,
      entityLinkType: f.workKey ? f.linkType || 'WorkItem' : cur.entityLinkType || 'WorkItem',
      actorPermaKey: realKey(pick('roleKey', cur.actorPermaKey)),
      taskTypePermaKey: realKey(pick('taskTypeKey', cur.taskTypePermaKey)),
    };
    const userText = pick('description', cur.description) || '';
    const cfg = await timeSettings().catch(() => null);
    const missing = missingFor(e, userText, cfg, interactive);
    if (missing.length) {
      log('cannot save yet; missing', missing);
      return { saved: false, needsCompletion: true, missing, state: summarize(cur) };
    }
    const was = summarize(cur);
    if (cur.stopwatchState === 'Started') cur = await putAction('pause');
    // Karbon always rounds a timer up to the next whole minute (1:01 saves as 2 minutes).
    const minutes = Math.max(1, Math.ceil((cur.recordedSeconds || 0) / 60));
    // Firms that require notes reject an empty description. Unattended saves (end of day) add a neutral line.
    let description = joinNote(userText, note);
    if (!description.trim() && cfg && cfg.notesRequired) description = 'Time recorded with the Karbon timer.';
    const entry = {
      action: null, actorAvatarColorId: null, actorName: null, actorPermaKey: e.actorPermaKey,
      adjustedValue: null, billedStatus: null, billedValue: null, clientName: null,
      description, entityBillingType: null,
      entityPermaKey: e.entityPermaKey, entityLinkType: e.entityLinkType,
      entryType: 'Timer', externalSystem: null, hourlyRate: null, isImportedTime: false,
      isOnApprovedInvoice: false, minutes, privacyLevel: null,
      startDateTime: localDate(cur.initialStartDateTime), taskTypeBillable: false, taskTypeName: null,
      taskTypePermaKey: e.taskTypePermaKey, timeSheetStatus: null, timeType: 'Daily', totalCost: null,
      userHasPrivacyAccess: false, userHasViewAccess: false, userProfileAvatarColorId: null,
      userProfilePermaKey: K.user, userProfileName: null, workItemTitle: null,
      invoicePermaKey: null, isInvoiceDeleted: false, timeSheetPermaKey: null, orgUnitPublicKey: null,
    };
    const saved = await call('POST', `/time/api/${K.tenant}/timeEntries`, { timeEntry: entry });
    // Karbon's timer remembers each work item's last role and task type, even when they're empty.
    if (env.onSaved && e.entityPermaKey && e.entityLinkType === 'WorkItem') {
      env.onSaved({ workKey: e.entityPermaKey, roleKey: e.actorPermaKey, taskTypeKey: e.taskTypePermaKey });
    }
    await putAction('Confirm');
    return {
      saved: true, minutes, entryId: saved && saved.timeEntry && saved.timeEntry.id,
      was: { ...was, work: e.entityPermaKey, linkType: e.entityLinkType, roleKey: e.actorPermaKey, taskTypeKey: e.taskTypePermaKey },
    };
  }

  async function discard() {
    const cur = await getState();
    return cur.stopwatchState === 'Stopped' ? cur : putAction('Cancel');
  }

  // ---- Finding things to time ----
  const ACTIVE_STATUSES = ['InProgress', 'Waiting', 'ReadyToStart', 'Planned'];
  const LINK_TYPES = { WorkItem: 'WorkItem', contact: 'Contact', organization: 'Organization', 'client-group': 'ClientGroup' };

  // A work result's subtitle reads "Client - Assigned to Name". Only the client is shown or used.
  const workClient = (x) => (x.subtitle || '').replace(/ - (Assigned to .*|Unassigned.*)$/, '');

  async function search({ term, kind = 'work', take = 6 }) {
    const q = new URLSearchParams({ searchTerm: term, skip: '0', take: String(take), filterType: kind, showEmailAsSubtitle: 'false' });
    if (kind === 'work') ACTIVE_STATUSES.forEach((s) => q.append('statuses[]', s));
    const j = await call('GET', `/search/api/${K.tenant}/globalSearchItems?${q}`);
    return ((j && j.globalSearchItems) || [])
      .filter((x) => LINK_TYPES[x.entityType])
      .map((x) => {
        const client = x.entityType === 'WorkItem' ? workClient(x) : '';
        return { key: x.id, linkType: LINK_TYPES[x.entityType], title: x.title, subtitle: client || x.subtitle || '', client };
      });
  }

  async function recents({ take = 6 } = {}) {
    const j = await call('GET', `/tenant/api/${K.tenant}/recentsList?entityType=WorkItems&skip=0&take=${take}`);
    return ((j && j.recentsLists) || []).map((x) => ({
      key: x.id, linkType: 'WorkItem', title: x.entityName, subtitle: x.workItemClientName || '', client: x.workItemClientName || '',
    }));
  }

  // ---- Role and task type lists, for the start panel ----
  // Captured 2026-10-23:
  //   userActorListItems -> { userActorListItems: [{ id, name, isDefault, avatarColorId }] }  ("None" has id "NONE")
  //   taskTypes -> { taskTypes: [{ id, title, billable, isAvailable, isDefault, replaceWithTaskType }] }
  // A failed list counts as empty, but if both fail because Karbon can't be reached, say so.
  async function lookups() {
    let reach = 0;
    const get = (path) => call('GET', path).catch((e) => { if (e.reach) reach++; return null; });
    const [a, t] = await Promise.all([get(`/tenant/api/${K.tenant}/userActorListItems`), get(`/tenant/api/${K.tenant}/taskTypes`)]);
    if (reach === 2) throw unreachable('Could not reach Karbon for the role and task type lists.');
    const roles = ((a && a.userActorListItems) || [])
      .filter((x) => x.id && x.name)
      .map((x) => ({ key: x.id, name: x.name, isDefault: !!x.isDefault }));
    const taskTypes = ((t && t.taskTypes) || [])
      .filter((x) => x.id && x.title && x.isAvailable !== false)
      .map((x) => ({ key: x.id, name: x.title, billable: !!x.billable, isDefault: !!x.isDefault }));
    log('lookups', { roles: roles.length, taskTypes: taskTypes.length });
    return { roles, taskTypes };
  }

  // ---- Role and task type prefill ----
  // Follows Karbon's own timer (read from its app code on 2026-10-24). The firm's prefill mode picks the source:
  //   WorkItem: the role and task type of your last entry on this work item.
  //   Budget: the work item's budget line, when exactly one is assigned to you.
  //   LastSelected: your last picks anywhere. Smart: those three, in that order. Blank: nothing.
  // remembered and last come from the extension's storage. known holds the list keys, so stale ones drop out.
  // Returns { roleKey, taskTypeKey, source }, where source is 'work', 'budget', 'last', or null.
  async function budgetPick(workKey) {
    const q = new URLSearchParams({ entityPermaKey: workKey, entityLinkType: 'WorkItem', 'Assignee[]': K.user });
    const j = await call('GET', `/time/api/${K.tenant}/estimateActualInfos?${q}`).catch(() => null);
    const rows = (j && j.estimateActualInfos) || [];
    return rows.length === 1 ? { roleKey: rows[0].actorPermaKey, taskTypeKey: rows[0].taskTypePermaKey } : null;
  }

  async function prefill({ workKey = null, linkType = 'WorkItem', remembered = null, last = null, known = null }) {
    const cfg = await timeSettings().catch(() => null);
    const mode = (cfg && cfg.prefillMode) || 'Smart';
    const ok = (k, list) => (realKey(k) && !(list && list.length && !list.includes(k)) ? k : null);
    const clean = (p, source) => {
      const r = p && { roleKey: ok(p.roleKey, known && known.roles), taskTypeKey: ok(p.taskTypeKey, known && known.taskTypes), source };
      return r && (r.roleKey || r.taskTypeKey) ? r : null;
    };
    const work = workKey && (linkType || 'WorkItem') === 'WorkItem' ? workKey : null;
    const fromWork = () => (work ? clean(remembered, 'work') : null);
    const fromBudget = async () => (work ? clean(await budgetPick(work), 'budget') : null);
    const fromLast = () => clean(last, 'last');
    let p = null;
    if (mode === 'WorkItem') p = fromWork();
    else if (mode === 'Budget') p = await fromBudget();
    else if (mode === 'LastSelected') p = fromLast();
    else if (mode !== 'Blank') p = fromWork() || (await fromBudget()) || fromLast();
    log('prefill', mode, p && p.source);
    return p || { roleKey: null, taskTypeKey: null, source: null };
  }

  const COMMANDS = {
    getState, start, pause, resume, appendNote, edit, autoPause, autoResume, stopAndSave, discard,
    search, recents, lookups, timeSettings, prefill,
  };

  // Runs one command. Timer results go out in the extension's short form.
  // A command that already changed something isn't safe to run again elsewhere, so its error loses reach.
  async function run(cmd, args) {
    const fn = COMMANDS[cmd];
    if (!fn) throw new Error(`Unknown command: ${cmd}`);
    const before = writes;
    try {
      await useKeys();
      const result = await fn(args || {});
      return result && result.stopwatchState ? summarize(result) : result;
    } catch (e) {
      if (writes !== before) e.reach = false;
      throw e;
    }
  }

  return { run, noteStopwatch, writes: () => writes };
}
