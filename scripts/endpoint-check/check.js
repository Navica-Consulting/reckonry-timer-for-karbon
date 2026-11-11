// Daily endpoint check. Runs inside a signed-in Karbon tab (app2.karbonhq.com), after src/karbon.js.
// bundle.sh wraps both files into one script; see docs/ENDPOINT-CHECK.md.
// It drives the extension's own KTKarbon, so a pass means the shipped code still works, and it also
// checks the raw response shapes, since karbon.js reads missing fields as empty lists.
// opts: { writes, client: { key, linkType }, clients: [...] }. client gets the saved-minute test; clients the work lists. Writes run only when no timer is running, and clean up.
// eslint-disable-next-line no-unused-vars
async function KTCheck(KTKarbon, opts = {}) {
  const checks = [];
  const raw = {}; // the last JSON body per masked path
  const t0 = Date.now();
  const mask = (p) => p.replace(/\?.*$/, '').replace(/\/[A-Za-z0-9-]{10,40}(?=\/|$)/g, (s) => (/\d/.test(s) ? '/{key}' : s));

  // ---- Keys, the way page.js learns them ----
  const session = () => {
    const app = window.StagingApp;
    const inst = app && (app.__deprecatedInstance__ || (app._applicationInstances && [...app._applicationInstances][0]));
    return inst && inst.lookup && inst.lookup('service:session');
  };
  const cookie = () => {
    const c = document.cookie.split(';').map((x) => x.trim()).find((x) => x.startsWith('bootstrap-cookie-'));
    if (!c) return null;
    const o = { name: c.slice(0, c.indexOf('=')) };
    decodeURIComponent(c.slice(c.indexOf('=') + 1)).split('&').forEach((pair) => {
      const i = pair.indexOf('=');
      if (i > 0) o[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1));
    });
    return o;
  };
  const K = { tenant: location.pathname.split('/')[1] || null, user: null, base: null };

  // ---- Recording ----
  // feature: what the person loses if this breaks. code: where the extension uses it.
  async function check(id, feature, code, fn) {
    const c = { id, feature, code, status: 'pass', detail: '' };
    try {
      const r = await fn();
      if (r && r.skip) Object.assign(c, { status: 'skip', detail: r.skip });
      else c.detail = typeof r === 'string' ? r : '';
    } catch (e) {
      c.status = 'fail';
      c.detail = String((e && e.message) || e).slice(0, 300);
    }
    checks.push(c);
    return c.status === 'pass';
  }
  const need = (cond, msg) => { if (!cond) throw new Error(msg); };
  const fields = (o, list, where) => {
    need(o && typeof o === 'object', `${where}: no object`);
    const gone = list.filter((f) => !(f in o));
    need(!gone.length, `${where}: missing ${gone.join(', ')}. Has: ${Object.keys(o).slice(0, 25).join(', ')}`);
  };
  const list = (body, key, item, where) => {
    need(body && Array.isArray(body[key]), `${where}: no ${key} array. Has: ${Object.keys(body || {}).join(', ')}`);
    if (body[key].length && item) fields(body[key][0], item, `${where} item`);
    return body[key];
  };
  const last = (re) => {
    const k = Object.keys(raw).reverse().find((p) => re.test(p));
    return k ? raw[k] : undefined;
  };

  // Records each response, so shapes can be checked after karbon.js has used them.
  const origFetch = window.fetch.bind(window);
  const calls = [];
  const fetchRec = async (url, init) => {
    const res = await origFetch(url, init);
    const p = mask(new URL(url).pathname);
    calls.push(`${(init && init.method) || 'GET'} ${p} ${res.status}`);
    res.clone().text().then((t) => { try { raw[p] = t ? JSON.parse(t) : null; } catch { raw[p] = '(not JSON)'; } }).catch(() => {});
    return res;
  };
  const settle = () => new Promise((r) => setTimeout(r, 50));
  // Writes touch only a timer this check started. mine: that timer's initial start time.
  // Someone may start their own timer at any moment, so every write step checks first.
  let mine = null;
  const guard = async () => {
    const s = await api.run('getState');
    need(s.state === 'Stopped', `a timer is ${s.state}, so the write checks stopped and left it alone`);
  };
  const stillMine = async () => {
    const s = await api.run('getState');
    need(s.state !== 'Stopped' && s.initialStart === mine, 'the timer is no longer the one this check started, so the write checks stopped');
  };
  const isMine = (s) => !!(s && mine && s.state !== 'Stopped' && s.initialStart === mine);
  const api = KTKarbon({ fetch: fetchRec, keys: () => K, route: () => location.pathname.replace(/^\/[^/]+/, '') || '/' });
  // Commands added after a release are skipped on older code, so main and test branches both run.
  const has = async (cmd) => new RegExp(`\\b${cmd}\\b`).test(KTKarbon.toString());
  const run = async (cmd, args) => { const r = await api.run(cmd, args); await settle(); return r; };
  const rawCall = async (method, path, body) => {
    const res = await fetchRec(K.base + path, {
      method, credentials: 'include', body: body ? JSON.stringify(body) : undefined,
      headers: { 'content-type': 'application/json', 'x-karbon-local-time': new Date().toISOString() },
    });
    need(res.ok, `${method} ${mask(path)} returned ${res.status}`);
    const t = await res.text();
    return t ? JSON.parse(t) : null;
  };

  // SignalR: page.js listens on the karbonAppHub socket for StopwatchChanged. Karbon pings it every
  // few seconds, so hooking send finds the open socket without reloading the page.
  let hubSeen = false; let hubMsg = false;
  const wsSend = WebSocket.prototype.send;
  const hooked = new WeakSet();
  WebSocket.prototype.send = function (d) {
    if (!hooked.has(this) && /karbonAppHub/.test(this.url)) {
      hooked.add(this); hubSeen = true;
      this.addEventListener('message', (ev) => { if (typeof ev.data === 'string' && ev.data.includes('StopwatchChanged')) hubMsg = true; });
    }
    return wsSend.apply(this, arguments);
  };

  // Firm settings and lists, read below and used again by saveCycle.
  let cfg = null;
  let lists = { roles: [], taskTypes: [] };

  try {
    // ---- Sign-in and keys ----
    const ses = session();
    const signedIn = await check('page.session', 'Keys and sign-in state in a Karbon tab', 'page.js learnFromPage, loggedIn', () => {
      need(window.StagingApp, 'window.StagingApp is gone');
      need(ses, 'service:session lookup failed');
      need(ses.isLoggedIn === true, `session.isLoggedIn is ${ses.isLoggedIn}; sign in to Karbon and run again`);
      need(ses.tenantPermaKey && ses.userProfilePermaKey && ses.siteBaseUrl, 'session lacks tenantPermaKey, userProfilePermaKey, or siteBaseUrl');
      K.tenant = K.tenant || ses.tenantPermaKey;
      K.user = ses.userProfilePermaKey;
      K.base = new URL(ses.siteBaseUrl).origin;
    });
    await check('page.cookie', 'Account keys without a Karbon tab (setup page, background calls)', 'background.js readCookie, page.js learnFromPage', () => {
      const c = cookie();
      need(c, 'no bootstrap-cookie-* cookie (it expires 7 days after sign-in, so sign out and in if this repeats)');
      fields(c, ['tenantPermaKey', 'userProfilePermaKey', 'dataCenterUrl'], c.name);
      K.user = K.user || c.userProfilePermaKey;
      K.base = K.base || new URL(c.dataCenterUrl).origin;
      return c.name;
    });
    if (!signedIn && !(K.user && K.base)) throw new Error('signed out');

    await check('api.userEnvironmentSettings', 'Signed-in check in the background', 'background.js checkSignedIn', async () => {
      const j = await rawCall('GET', `/api/${K.tenant}/userEnvironmentSettings/${K.user}`);
      fields(j && j.userEnvironmentSettings, ['tenantPermaKey', 'userProfilePermaKey', 'dataCenterUrl', 'socketUrl'], 'userEnvironmentSettings');
    });

    // ---- Reads through the extension's own commands ----
    let state = null;
    await check('getState', 'Reading the timer (panel, badge, every action)', 'karbon.js getState', async () => {
      state = await run('getState');
      fields(last(/stopwatches/).stopwatch, ['stopwatchState', 'entityPermaKey', 'entityLinkType', 'actorPermaKey', 'taskTypePermaKey',
        'description', 'recordedSeconds', 'initialStartDateTime', 'startDateTime', 'pauseDateTime'], 'stopwatch');
      need(['Stopped', 'Started', 'Paused'].includes(state.state), `unknown stopwatchState ${state.state}`);
      return state.state;
    });
    await check('timeSettings', 'Firm rules: work-only time, required role, task type, and notes, prefill mode', 'karbon.js timeSettings', async () => {
      cfg = await run('timeSettings', { fresh: true });
      const s = last(/timeTenantSettings/);
      fields(s && (s.timeTenantSettings || s.timeTenantSetting), ['timeTrackingEntity', 'isNotesRequired', 'isActorRequired', 'isTaskTypeRequired', 'timeEntryPrefillMode'], 'timeTenantSettings');
      return `${cfg.entity}, prefill ${cfg.prefillMode}`;
    });
    await check('lookups', 'Role and task type lists', 'karbon.js lookups', async () => {
      lists = await run('lookups');
      list(last(/userActorListItems/), 'userActorListItems', ['id', 'name', 'isDefault'], 'roles');
      list(last(/taskTypes/), 'taskTypes', ['id', 'title', 'isAvailable', 'isDefault'], 'task types');
      need(lists.roles.length && lists.taskTypes.length, `got ${lists.roles.length} roles and ${lists.taskTypes.length} task types`);
      return `${lists.roles.length} roles, ${lists.taskTypes.length} task types`;
    });
    let recent = [];
    await check('recents', 'Recent work in the Work field', 'karbon.js recents', async () => {
      recent = await run('recents', { take: 6 });
      list(last(/recentsList/), 'recentsLists', ['id', 'entityName', 'workItemClientName'], 'recents');
      return `${recent.length} items`;
    });
    // A search term that should match: a word from a recent title, else a common letter.
    const term = ((recent[0] && recent[0].title) || '').split(/\s+/).find((w) => w.length > 3) || 'a';
    let workHit = null;
    await check('search.work', 'Searching work', 'karbon.js search', async () => {
      const r = await run('search', { term, kind: 'work', take: 6 });
      const items = list(last(/globalSearchItems/), 'globalSearchItems', ['id', 'entityType', 'title', 'subtitle', 'workItemStatus'], 'work search');
      need(items.length, `no results for a term from recent work`);
      need(r.length, `results came back, but none had a known entityType: ${[...new Set(items.map((x) => x.entityType))].join(', ')}`);
      workHit = r[0];
      return `${r.length} results`;
    });
    let clientHit = null;
    await check('search.contact', 'Searching clients', 'karbon.js search', async () => {
      const r = await run('search', { term: 'a', kind: 'contact', take: 10 });
      const items = list(last(/globalSearchItems/), 'globalSearchItems', ['id', 'entityType', 'title'], 'client search');
      need(items.length, 'no clients matched "a"');
      need(r.length, `no known entityType among: ${[...new Set(items.map((x) => x.entityType))].join(', ')}`);
      clientHit = r.find((x) => x.linkType === 'Contact' || x.linkType === 'Organization') || null;
      return `${r.length} results`;
    });
    await check('clientWork', "A client's work in the Work field", 'karbon.js clientWork', async () => {
      if (!(await has('clientWork'))) return { skip: 'not in this version' };
      // The test clients cover a person, an organization, and a client group (a different filter key).
      const cs = (opts.clients && opts.clients.length) ? opts.clients : clientHit ? [{ name: 'first search hit', key: clientHit.key, linkType: clientHit.linkType }] : [];
      if (!cs.length) return { skip: 'no client to look up' };
      const out = [];
      for (const c of cs) {
        const r = await run('clientWork', { client: c.key, linkType: c.linkType, max: 40 });
        list(last(/workViewListItems/), 'workViewListItems', ['workItemPermaKey', 'workItemTitle', 'workItemStatus', 'clientDisplayName', 'startDate', 'completedDate'], `${c.linkType} work`);
        out.push(`${c.linkType} ${r.items.length}`);
      }
      return out.join(', ');
    });
    await check('budget', 'Role and task type prefill from the budget', 'karbon.js budgetPick', async () => {
      const w = (recent[0] && recent[0].key) || (workHit && workHit.key);
      if (!w) return { skip: 'no work item to look up' };
      const q = new URLSearchParams({ entityPermaKey: w, entityLinkType: 'WorkItem', 'Assignee[]': K.user });
      list(await rawCall('GET', `/time/api/${K.tenant}/estimateActualInfos?${q}`), 'estimateActualInfos', null, 'budget');
    });
    await check('workTemplates', 'Templates in the Create work item form', 'karbon.js workTemplates', async () => {
      if (!(await has('workTemplates'))) return { skip: 'not in this version' };
      const r = await run('workTemplates');
      list(last(/workTemplateSummaries/), 'workTemplateSummaries', ['id', 'name', 'lastPublishedDateTime'], 'templates');
      return `${r.length} published`;
    });
    await check('hub.socket', 'Live timer updates from other tabs and devices', 'page.js onHubMessage', async () => {
      for (let i = 0; i < 40 && !hubSeen; i++) await new Promise((r) => setTimeout(r, 250));
      need(hubSeen, 'no karbonAppHub socket sent anything in 10 seconds');
    });

    // ---- Writes: a blank timer, then a timer saved to a throwaway work item ----
    if (!opts.writes) {
      checks.push({ id: 'writes', feature: 'Timer actions', code: 'karbon.js', status: 'skip', detail: 'writes off' });
    } else if (!state || state.state !== 'Stopped') {
      checks.push({ id: 'writes', feature: 'Timer actions', code: 'karbon.js', status: 'skip', detail: `a timer is ${state ? state.state : 'unknown'}; left alone` });
    } else {
      try {
        await check('timer.start', 'Starting a blank timer', 'karbon.js start', async () => {
          await guard();
          const s = await run('start', { prefill: false });
          need(s.state === 'Started', `timer is ${s.state}`);
          mine = s.initialStart;
        });
        need(mine, 'the blank timer did not start, so the other write checks were skipped');
        await check('timer.note', 'Adding a note to the running timer', 'karbon.js appendNote', async () => {
          await stillMine();
          const s = await run('appendNote', { text: 'Endpoint check' });
          need(s.description.includes('Endpoint check'), 'note not kept');
        });
        await check('timer.pause', 'Pausing', 'karbon.js pause', async () => { await stillMine(); need((await run('pause')).state === 'Paused', 'not paused'); });
        await check('timer.resume', 'Resuming', 'karbon.js resume', async () => { await stillMine(); need((await run('resume')).state === 'Started', 'not started'); });
        await check('hub.stopwatchChanged', 'Live timer updates from other tabs and devices', 'page.js onHubMessage', async () => {
          for (let i = 0; i < 20 && !hubMsg; i++) await new Promise((r) => setTimeout(r, 250));
          need(hubMsg, 'no StopwatchChanged message on the hub after timer changes');
        });
        await check('timer.discard', 'Discarding a timer', 'karbon.js discard', async () => { await stillMine(); need((await run('discard')).state === 'Stopped', 'not stopped'); mine = null; });
        await saveCycle();
      } finally {
        // Only ever discards the check's own timer, never one someone started meanwhile.
        const s = await api.run('getState').catch(() => null);
        if (isMine(s)) await api.run('discard').catch(() => {});
      }
    }
  } catch (e) {
    if (e.message !== 'signed out') checks.push({ id: 'run', feature: 'The check itself', code: 'scripts/endpoint-check/check.js', status: 'fail', detail: String(e.message || e) });
  } finally {
    WebSocket.prototype.send = wsSend;
  }

  // Saves a minute to a throwaway work item, reads it back, then deletes both.
  // Needs opts.client, a test client that Max picked, so no real client's work changes.
  async function saveCycle() {
    if (!opts.client || !opts.client.key) {
      checks.push({ id: 'timer.save', feature: 'Stopping and saving time', code: 'karbon.js stopAndSave', status: 'skip', detail: 'no test client in config.local.json' });
      return;
    }
    let work = null; let entryId = null;
    try {
      await check('work.create', 'Create work item, and the fixture for the save check', 'karbon.js createWork', async () => {
        work = await createTestWork(opts.client);
        return opts.client.linkType;
      });
      if (!work) return;
      // A client group is sent with a different clientType, so it gets its own create, then is deleted.
      const group = (opts.clients || []).find((c) => c.linkType === 'ClientGroup');
      if (group) {
        let gw = null;
        await check('work.createGroup', 'Create work item for a client group', 'karbon.js createWork', async () => {
          if (!(await has('createWork'))) return { skip: 'not in this version' };
          gw = await createTestWork(group);
        });
        if (gw) await check('cleanup.workGroup', 'Removing the client group test work item', 'scripts/endpoint-check', () => deleteWork(gw));
      }
      const pick = (l, req) => (req ? (l.find((x) => x.key !== 'NONE' && !x.isDefault) || l[0] || {}).key : null);
      await check('timer.startWork', 'Starting a timer on a work item', 'karbon.js start', async () => {
        await guard();
        const s = await run('start', { workKey: work.id, prefill: false, roleKey: pick(lists.roles, cfg && cfg.roleRequired), taskTypeKey: pick(lists.taskTypes, cfg && cfg.taskTypeRequired) });
        need(s.state === 'Started' && s.work === work.id, `timer is ${s.state} on ${s.work === work.id ? 'the test item' : 'something else'}`);
        mine = s.initialStart;
      });
      await check('timer.save', 'Stopping and saving time', 'karbon.js stopAndSave', async () => {
        await stillMine();
        const r = await run('stopAndSave', { note: 'Endpoint check' });
        mine = null;
        need(r.saved, `not saved${r.missing ? `; missing ${r.missing.join(', ')}` : ''}`);
        entryId = r.entryId;
        need(entryId, 'no time entry id came back');
        fields((await rawCall('GET', `/time/api/${K.tenant}/timeEntries/${entryId}`)).timeEntry, ['minutes', 'entityPermaKey', 'description'], 'timeEntry');
        return `${r.minutes} min`;
      });
    } finally {
      if (entryId) await check('cleanup.entry', 'Removing the test time entry', 'scripts/endpoint-check', () => rawCall('DELETE', `/time/api/${K.tenant}/timeEntries/${entryId}`));
      if (work) await check('cleanup.work', 'Removing the test work item', 'scripts/endpoint-check', () => deleteWork(work));
    }
  }

  // Creates "Reckonry endpoint check (safe to delete)" for a test client and returns Karbon's full
  // workItem, which the delete needs. Uses the extension's createWork when this version has it.
  async function createTestWork(c) {
    const name = 'Reckonry endpoint check (safe to delete)';
    let r = null;
    if (await has('createWork')) {
      r = await run('createWork', { title: name, clientKey: c.key, clientLinkType: c.linkType });
    } else {
      await rawCall('POST', `/work/api/${K.tenant}/workItems`, { workItem: {
        name, description: '', startDate: new Date().toLocaleDateString('en-CA'), dueDate: null,
        sourceWorkTemplatePermaKey: null, clientPermaKey: c.key, clientType: c.linkType,
        assignedTo: K.user, assignedByPermaKey: K.user, actorUserProfileMapping: [], privacyLevel: 'public', type: 'work-item',
      } });
      await settle();
    }
    const w = (last(/\/workItems$/) || {}).workItem;
    fields(w, ['id', 'name', 'status', 'clientFullName'], 'workItem');
    need(!r || r.key === w.id, 'createWork returned a different key than Karbon');
    return w;
  }
  function deleteWork(w) { return rawCall('PUT', `/work/api/${K.tenant}/workItems/${w.id}`, { workItem: { ...w, status: 'Deleted' } }); }

  const failed = checks.filter((c) => c.status === 'fail');
  const ses = session();
  const signedOut = (ses && ses.isLoggedIn === false) || checks.some((c) => /signed out of Karbon|isLoggedIn is false/.test(c.detail));
  const report = {
    ok: !failed.length, signedOut, at: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000),
    host: location.host, base: K.base, counts: { pass: checks.filter((c) => c.status === 'pass').length, fail: failed.length, skip: checks.filter((c) => c.status === 'skip').length },
    checks, calls,
  };
  window.__ktCheckReport = report;
  return report;
}
