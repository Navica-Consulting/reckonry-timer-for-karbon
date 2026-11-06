// Store screenshot stub: stands in for Chrome's extension APIs with made-up firms and work.
// render.sh loads it before the extension's own scripts. ?shot=N picks the scene.
(() => {
  const SHOT = new URLSearchParams(location.search).get('shot') || '1';
  const now = Date.now();
  const ago = (secs) => new Date(now - secs * 1000).toISOString();
  // Notes stamps use a fixed afternoon, so a render at night doesn't read oddly.
  const stamp = (hh, mm, text) => `[${new Date(2026, 9, 23, hh, mm).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}] ${text}.`;

  const LK = {
    roles: [{ key: 'r1', name: 'Accountant', isDefault: true }, { key: 'r2', name: 'Manager' }, { key: 'r3', name: 'Partner' }],
    taskTypes: [{ key: 'NONE', name: 'None', isDefault: true }, { key: 't1', name: 'Bookkeeping' }, { key: 't2', name: 'Tax preparation' }, { key: 't3', name: 'Client meeting' }],
  };
  const work = (key, title, client) => ({ key, linkType: 'WorkItem', title, subtitle: client, client });
  const WORK = [
    work('w1', 'Q3 2026 bookkeeping', 'Harbor & Pine Dental'),
    work('w4', '2026 tax return', 'Northwind Bakery'),
    work('w2', 'Payroll setup', 'Harbor & Pine Dental'),
    work('w5', 'Sales tax filing, Q3', 'Larkspur Studio'),
    work('w3', 'September monthly close', 'Harbor & Pine Dental'),
    work('w6', '2026 year-end planning', 'Harbor & Pine Dental'),
    work('w7', 'Quarterly estimates', 'Cedar Row Builders'),
  ];
  const onW1 = { work: 'w1', linkType: 'WorkItem', title: 'Q3 2026 bookkeeping', client: 'Harbor & Pine Dental', roleKey: 'r1' };

  // Each scene: the timer, the firm's settings, what's pending, and what to do once the page has drawn.
  const SCENES = {
    // The running timer card.
    1: { state: { ...onW1, state: 'Started', taskTypeKey: 't1', recordedSeconds: 0, startDateTime: ago(2537),
      description: 'Reconciled the operating and payroll accounts.' } },
    // The start form, with a client chosen and its recent work open.
    3: { state: { state: 'Stopped' }, after: () => {
      start.client.show({ key: 'c1', linkType: 'Organization', title: 'Harbor & Pine Dental' }, true);
      start.work.q.focus();
    } },
    // The finish form after an automatic switch, with a required task type still empty.
    4: { state: { ...onW1, state: 'Paused', taskTypeKey: null, recordedSeconds: 4360, startDateTime: ago(4360),
      description: 'Bank feeds and receipt matching for September.' },
      pending: { reason: 'switch', thenTitle: '2026 tax return', missing: ['taskType'] }, local: { taskTypeKey: null },
      after: () => document.activeElement && document.activeElement.blur() },
    // The timer card's notes after a lock pause and its resume.
    5: { state: { ...onW1, state: 'Started', taskTypeKey: 't1', recordedSeconds: 3120, startDateTime: ago(1260),
      description: `${stamp(14, 58, 'Timer paused: screen locked')}\n${stamp(15, 12, 'Timer resumed: screen unlocked')}` },
      sync: {}, after: () => { $('curNotes').style.height = '104px'; } },
    // The settings page, open to Away from the computer.
    settings: { state: { state: 'Stopped' },
      after: () => setTimeout(() => { document.documentElement.style.scrollBehavior = 'auto'; $('g-away').scrollIntoView({ block: 'start' }); }, 600) },
  };
  const scene = SCENES[SHOT] || SCENES[1];
  const S = scene.state;

  const local = {
    timeCfg: { workOnly: false, roleRequired: true, taskTypeRequired: true, notesRequired: false },
    lookups: LK, signedIn: true, user: 'u1', firmName: 'Larch & Finch CPAs',
    directApi: { ok: true }, directWrites: { ok: true }, roleKey: 'r1', taskTypeKey: 't1',
    ...scene.local,
  };
  // Presets show in the timer card and the start form, unless a scene sets its own sync.
  const sync = scene.sync || { presets: [
    { id: 'p1', name: 'Prep', roleKey: 'r1', taskTypeKey: 't1' },
    { id: 'p2', name: 'Client meeting', roleKey: 'r2', taskTypeKey: 't3' },
    { id: 'p3', name: 'Review', roleKey: 'r3', taskTypeKey: 't2' },
  ] };

  const cmd = (c, a) => {
    if (c === 'getState') return { ok: true, result: { ...S } };
    if (c === 'lookups') return { ok: true, result: LK };
    if (c === 'recents') return { ok: true, result: WORK.slice(0, a.take || 6) };
    if (c === 'search') return { ok: true, result: a.kind === 'work' ? WORK : [] };
    return { ok: true, result: { ...S } };
  };
  const listeners = [];
  const ev = { addListener() {}, removeListener() {} };
  const area = (store, name) => ({
    get: async (k) => {
      if (k == null) return { ...store };
      if (typeof k === 'string') return k in store ? { [k]: store[k] } : {};
      if (Array.isArray(k)) return Object.fromEntries(k.filter((x) => x in store).map((x) => [x, store[x]]));
      return { ...k, ...store };
    },
    set: async (o) => { Object.assign(store, o); listeners.forEach((f) => f({}, name)); },
    remove: async () => {},
  });
  const msg = async (m) => {
    if (m.type === 'cmd') return cmd(m.cmd, m.args || {});
    if (m.type === 'getCached') return { ...S };
    if (m.type === 'canReach') return true;
    if (m.type === 'getPending') return scene.pending || null;
    return null;
  };
  window.chrome = {
    runtime: { sendMessage: msg, onMessage: ev, getManifest: () => ({ version: '0.7.37', name: 'Reckonry Timer for Karbon' }), getURL: (p) => p },
    storage: { local: area(local, 'local'), sync: area(sync, 'sync'), session: area({}, 'session'), onChanged: { addListener: (f) => listeners.push(f) } },
    tabs: { query: async () => [], create() {}, reload() {} },
    action: { getUserSettings: async () => ({ isOnToolbar: true }) },
  };
  window.close = () => {};
  if (scene.after) addEventListener('load', () => setTimeout(scene.after, 300));
})();
