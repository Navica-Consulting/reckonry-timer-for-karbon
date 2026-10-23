// Runs in Karbon's page context (MAIN world). Learns the tenant, user, API host, and timer state
// by observing Karbon's own calls, listens for StopwatchChanged on the SignalR hub, and performs
// timer actions with the signed-in session. Talks to content.js only via window.postMessage.
(() => {
  if (window.__ktPage) return;
  window.__ktPage = true;

  // base: the regional API origin (for example https://us3.karbonhq.com).
  // timeCfg: the firm's time settings. entity "Work" means time can only be booked to work items.
  const K = { tenant: null, user: null, sw: null, base: null, debug: false, timeCfg: null };
  const SW_RE = /\/time\/api\/([A-Za-z0-9]+)\/stopwatches\/([A-Za-z0-9]+)/;
  const API_RE = /^(https:\/\/[a-z0-9-]+\.karbonhq\.com)\/(time|work|tenant|todo|contentitems|search)\/api\//i;
  const learnBase = (url) => {
    const m = String(url).match(API_RE);
    if (m && m[1] !== location.origin) K.base = m[1];
  };
  try { performance.getEntriesByType('resource').forEach((e) => learnBase(e.name)); } catch {}

  // Learn the tenant, user, and API host without waiting for Karbon to fetch the stopwatch.
  // 1) Karbon's readable bootstrap cookie (default tenant only, so it must match this page's tenant).
  // 2) Karbon's own session service, which follows the tenant in the URL.
  const pageTenant = () => location.pathname.split('/')[1] || null;
  function learnFromPage() {
    try {
      const raw = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith('bootstrap-cookie-'));
      if (raw) {
        const o = {};
        decodeURIComponent(raw.slice(raw.indexOf('=') + 1)).split('&').forEach((pair) => {
          const i = pair.indexOf('=');
          if (i > 0) o[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1));
        });
        const t = pageTenant();
        if (o.tenantPermaKey && o.userProfilePermaKey && (!t || t === o.tenantPermaKey)) {
          if (!K.tenant) K.tenant = o.tenantPermaKey;
          if (!K.user && K.tenant === o.tenantPermaKey) K.user = o.userProfilePermaKey;
        }
        if (!K.base && o.dataCenterUrl) K.base = new URL(o.dataCenterUrl).origin;
      }
    } catch {}
    try {
      const app = window.StagingApp;
      const inst = app && (app.__deprecatedInstance__ || (app._applicationInstances && [...app._applicationInstances][0]));
      const ses = inst && inst.lookup && inst.lookup('service:session');
      if (ses && ses.isLoggedIn) {
        const t = ses.tenantPermaKey;
        if (t && (!K.tenant || K.tenant === t)) {
          K.tenant = t;
          if (!K.user) K.user = ses.userProfilePermaKey || null;
        }
        if (!K.base && ses.siteBaseUrl) K.base = new URL(ses.siteBaseUrl).origin;
      }
    } catch {}
    return !!(K.tenant && K.user && K.base);
  }
  learnFromPage();
  const origFetch = window.fetch.bind(window);

  const post = (msg) => window.postMessage({ src: 'kt-page', ...msg }, location.origin);

  const summarize = (sw) => sw && {
    state: sw.stopwatchState,
    work: sw.entityPermaKey,
    linkType: sw.entityLinkType,
    title: sw.workItemTitle,
    client: sw.clientName,
    description: sw.description || '',
    recordedSeconds: sw.recordedSeconds || 0,
    initialStart: sw.initialStartDateTime,
    startDateTime: sw.startDateTime,
    pauseDateTime: sw.pauseDateTime,
    roleKey: sw.actorPermaKey,
    taskTypeKey: sw.taskTypePermaKey,
    tenant: K.tenant,
    user: K.user,
    base: K.base,
  };

  function noteStopwatch(sw) {
    if (!sw) return;
    K.sw = sw;
    post({ event: 'state', state: summarize(sw) });
  }

  // Observe Karbon's own fetch calls (read-only): learn keys, API host, and state.
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    learnBase(url);
    const res = await origFetch(input, init);
    const m = url.match(SW_RE);
    if (m) {
      K.tenant = m[1];
      K.user = m[2];
      res.clone().json().then((j) => j && noteStopwatch(j.stopwatch)).catch(() => {});
    }
    return res;
  };

  // Listen to the SignalR hub for timer changes made in other tabs or devices.
  let refetchTimer = null;
  const onHubMessage = (ev) => {
    if (typeof ev.data !== 'string' || !ev.data.includes('StopwatchChanged')) return;
    clearTimeout(refetchTimer);
    refetchTimer = setTimeout(() => getState().catch(() => {}), 300);
  };
  const seen = new WeakSet();
  const wsSend = WebSocket.prototype.send;
  WebSocket.prototype.send = function (d) {
    if (!seen.has(this) && /karbonAppHub/.test(this.url)) {
      seen.add(this);
      this.addEventListener('message', onHubMessage);
    }
    return wsSend.apply(this, arguments);
  };

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
  const log = (...a) => { if (K.debug) console.info('[KT]', ...a); };
  const joinNote = (desc, note) => (note ? (desc ? `${desc}\n${note}` : note) : desc || '');

  // No x-karbon-connection-id: without it, Karbon notifies every tab, including this one,
  // so Karbon's own timer display refreshes after the extension changes the timer.
  function headers() {
    return {
      'content-type': 'application/json',
      'x-karbon-local-time': localIso(),
      'x-practiceiq-current-route': location.pathname.replace(/^\/[^/]+/, '') || '/',
    };
  }

  function apiBase() {
    if (!K.base) {
      try { performance.getEntriesByType('resource').forEach((e) => learnBase(e.name)); } catch {}
    }
    if (!K.base) learnFromPage();
    if (!K.base) throw new Error('Karbon is still loading. Try again in a few seconds.');
    return K.base;
  }

  async function call(method, path, body) {
    const res = await origFetch(apiBase() + path, {
      method,
      headers: headers(),
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include',
    });
    const where = `${method} ${path.split('/').slice(1, 4).join('/')}`;
    log(method, K.base + mask(path), res.status);
    if (!res.ok) throw new Error(`Karbon returned ${res.status} for ${where}`);
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Karbon sent a page instead of data for ${where}. Reload the Karbon tab and try again.`);
    }
  }

  function ensureKeys() {
    if (!K.user) learnFromPage();
    if (!K.tenant) K.tenant = pageTenant();
    if (!K.user) throw new Error('Karbon is still loading. Try again in a few seconds.');
  }
  const swPath = () => `/time/api/${K.tenant}/stopwatches/${K.user}`;

  // ---- Timer actions ----
  async function getState() {
    ensureKeys();
    const j = await call('GET', swPath());
    noteStopwatch(j && j.stopwatch);
    return K.sw;
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
    ensureKeys();
    if (K.timeCfg && !fresh) return K.timeCfg;
    const j = await call('GET', `/time/api/${K.tenant}/timeTenantSettings/${K.tenant}`);
    const s = (j && (j.timeTenantSettings || j.timeTenantSetting)) || {};
    K.timeCfg = {
      entity: s.timeTrackingEntity || null,
      workOnly: s.timeTrackingEntity === 'Work',
      notesRequired: !!s.isNotesRequired,
      roleRequired: !!s.isActorRequired,
      taskTypeRequired: !!s.isTaskTypeRequired,
    };
    post({ event: 'timeSettings', settings: K.timeCfg });
    return K.timeCfg;
  }

  // A timer can start blank: no work item, contact, role, or task type. Karbon allows that,
  // and the missing details are collected when the timer is stopped or switched.
  // description: your own text for the new entry. note: a stamped activity note added after it.
  // stopNote: written on the entry being saved, when this start switches away from another timer.
  // interactive: someone is there to answer the finish prompt, so a required note is asked for, not filled in.
  // Returns the new timer, or { needsCompletion, missing, state } when the running timer can't be saved yet.
  async function start({ workKey = null, linkType = 'WorkItem', roleKey, taskTypeKey, description, note, stopNote, interactive = false }) {
    workKey = workKey || null;
    if (workKey && linkType !== 'WorkItem') {
      const cfg = await timeSettings().catch(() => null);
      if (cfg && cfg.workOnly) throw new Error('Your firm books time to work items only, so timers cannot start on a contact.');
    }
    const cur = await getState();
    if (cur.stopwatchState !== 'Stopped') {
      if ((cur.entityPermaKey || null) === workKey) {
        return cur.stopwatchState === 'Paused' ? resume({ note }) : cur;
      }
      const r = await stopAndSave({ note: stopNote, interactive });
      if (r.needsCompletion) return r;
    }
    const fresh = K.sw;
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

  async function search({ term, kind = 'work', take = 6 }) {
    ensureKeys();
    const q = new URLSearchParams({ searchTerm: term, skip: '0', take: String(take), filterType: kind, showEmailAsSubtitle: 'false' });
    if (kind === 'work') ACTIVE_STATUSES.forEach((s) => q.append('statuses[]', s));
    const j = await call('GET', `/search/api/${K.tenant}/globalSearchItems?${q}`);
    return ((j && j.globalSearchItems) || [])
      .filter((x) => LINK_TYPES[x.entityType])
      .map((x) => ({ key: x.id, linkType: LINK_TYPES[x.entityType], title: x.title, subtitle: x.subtitle || '' }));
  }

  async function recents({ take = 6 } = {}) {
    ensureKeys();
    const j = await call('GET', `/tenant/api/${K.tenant}/recentsList?entityType=WorkItems&skip=0&take=${take}`);
    return ((j && j.recentsLists) || []).map((x) => ({
      key: x.id, linkType: 'WorkItem', title: x.entityName, subtitle: x.workItemClientName || '',
    }));
  }

  // ---- Role and task type lists, for the start panel ----
  // Captured 2026-10-23:
  //   userActorListItems -> { userActorListItems: [{ id, name, isDefault, avatarColorId }] }  ("None" has id "NONE")
  //   taskTypes -> { taskTypes: [{ id, title, billable, isAvailable, isDefault, replaceWithTaskType }] }
  async function lookups() {
    ensureKeys();
    const [a, t] = await Promise.all([
      call('GET', `/tenant/api/${K.tenant}/userActorListItems`).catch(() => null),
      call('GET', `/tenant/api/${K.tenant}/taskTypes`).catch(() => null),
    ]);
    const roles = ((a && a.userActorListItems) || [])
      .filter((x) => x.id && x.name)
      .map((x) => ({ key: x.id, name: x.name, isDefault: !!x.isDefault }));
    const taskTypes = ((t && t.taskTypes) || [])
      .filter((x) => x.id && x.title && x.isAvailable !== false)
      .map((x) => ({ key: x.id, name: x.title, billable: !!x.billable, isDefault: !!x.isDefault }));
    log('lookups', { roles: roles.length, taskTypes: taskTypes.length });
    return { roles, taskTypes };
  }

  // ---- Settings pushed from content.js ----
  const setDebug = ({ on }) => { K.debug = !!on; return { debug: K.debug }; };
  const setKeys = ({ tenant, user, base }) => {
    if (!K.tenant && tenant && location.pathname.split('/')[1] === tenant) K.tenant = tenant;
    if (!K.user && user && K.tenant === tenant) K.user = user;
    if (!K.base && base) K.base = base;
    learnFromPage();
    return { ready: !!(K.tenant && K.user && K.base), tenant: K.tenant, user: K.user, base: K.base };
  };

  const COMMANDS = {
    getState, start, pause, resume, appendNote, autoPause, autoResume, stopAndSave, discard,
    search, recents, lookups, timeSettings, setDebug, setKeys,
  };

  window.addEventListener('message', async (ev) => {
    if (ev.source !== window || ev.origin !== location.origin) return;
    const m = ev.data;
    if (!m || m.src !== 'kt-cs' || !m.id) return;
    const fn = COMMANDS[m.cmd];
    try {
      if (!fn) throw new Error(`Unknown command: ${m.cmd}`);
      log('command', m.cmd);
      const result = await fn(m.args || {});
      post({ id: m.id, ok: true, result: result && result.stopwatchState ? summarize(result) : result });
    } catch (e) {
      console.warn('[KT] command failed', m.cmd, String((e && e.message) || e));
      post({ id: m.id, ok: false, error: String((e && e.message) || e) });
    }
  });
})();
