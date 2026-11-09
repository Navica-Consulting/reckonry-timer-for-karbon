// Service worker: badge, settings, lock and idle pause, sleep gaps, day-end split, long-timer alert,
// shortcuts, and running commands against Karbon's API (through a Karbon tab only when a direct call fails).
importScripts('config.js', 'defaults.js', 'notes.js', 'errors.js', 'karbon.js');
ktWatchErrors('background');

const KARBON = KT_ORIGIN;
const HEARTBEAT_MIN = 1;
const SLEEP_GAP_MS = 3 * 60 * 1000;
const COLORS = { run: '#2e7d32', long: '#f2c94c', paused: '#6b7280', none: '#c62828' };

const isKarbon = (url) => typeof url === 'string' && url.startsWith(KARBON);
const settings = () => chrome.storage.sync.get(DEFAULTS);

// Chrome has no dark-theme toolbar icon in the manifest, and some light themes have a dark toolbar,
// so the person picks the theme the icon should suit.
async function applyIcon() {
  const { toolbarTheme } = await settings();
  const suffix = toolbarTheme === 'dark' ? '-light' : '';
  const path = {};
  for (const size of [16, 32, 48]) path[size] = `icons/icon${size}${suffix}.png`;
  await chrome.action.setIcon({ path });
}
const cachedState = async () => (await chrome.storage.session.get('state')).state || null;
const isSignedOut = async () => (await chrome.storage.local.get('signedIn')).signedIn === false;

// ---- Elapsed time, badge, and tooltip ----
function elapsedSeconds(s) {
  let secs = s.recordedSeconds || 0;
  if (s.state === 'Started' && s.startDateTime) secs += Math.max(0, (Date.now() - Date.parse(s.startDateTime)) / 1000);
  return Math.floor(secs);
}
// A blank timer (no work item yet) still counts as running.
const active = (s) => !!(s && s.state && s.state !== 'Stopped');
const pendingFinish = async () => (await chrome.storage.session.get('pendingFinish')).pendingFinish || null;

// Badges fit about four characters: 25m, 1h05, 12h.
function elapsedText(s) {
  const m = Math.floor(elapsedSeconds(s) / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 10 ? `${h}h${String(m % 60).padStart(2, '0')}` : `${h}h`;
}

// badgeWhere: 'everywhere', 'away' (every site except Karbon, which shows its own timer), or 'never'.
function badgeFor(s, cfg, waiting, out) {
  // Signed out of Karbon: no timer is shown anywhere, so the badge says something is wrong instead.
  if (out) return { text: '!', color: COLORS.none };
  if (cfg.badgeWhere === 'never') return { text: '' };
  // A timer you stopped that still needs its details: "!" until it is finished.
  if (waiting && active(s)) return { text: '!', color: COLORS.long, dark: true };
  if (!active(s)) return cfg.showIdleBadge ? { text: 'off', color: COLORS.none } : { text: '' };
  if (s.state === 'Paused') return { text: 'II', color: COLORS.paused };
  const long = longOn(cfg) && elapsedSeconds(s) >= cfg.longTimerHours * 3600;
  return { text: elapsedText(s), color: long ? COLORS.long : COLORS.run, dark: long };
}

function tooltip(s, waiting, out) {
  if (out) return 'Karbon timer: you are signed out of Karbon. Sign in to see your timer.';
  if (!active(s)) return 'Karbon timer: no timer running';
  if (waiting) return 'Karbon timer paused: choose a work item to finish saving it';
  const m = Math.floor(elapsedSeconds(s) / 60);
  const time = m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
  const what = [s.title, s.client].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');
  const on = what ? ` on ${what}` : s.work ? '' : ', no work item yet';
  return `Karbon timer ${s.state === 'Paused' ? 'paused' : 'running'}: ${time}${on}`;
}

async function refreshBadge() {
  const [s, cfg, waiting, out] = await Promise.all([cachedState(), settings(), pendingFinish(), isSignedOut()]);
  const b = badgeFor(s, cfg, !!waiting, out);
  await chrome.action.setBadgeText({ text: b.text });
  if (b.text) {
    await chrome.action.setBadgeBackgroundColor({ color: b.color });
    if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: b.dark ? '#1f2933' : '#ffffff' });
  }
  await chrome.action.setTitle({ title: tooltip(s, !!waiting, out) });
  // Karbon tabs get their own badge: blank in "away" mode (Karbon shows its own timer), the same badge otherwise.
  const onKarbon = cfg.badgeWhere === 'everywhere' || out ? b.text : '';
  const tabs = await chrome.tabs.query({ url: `${KARBON}*` });
  await Promise.all(tabs.map(async (t) => {
    await chrome.action.setBadgeText({ tabId: t.id, text: onKarbon });
    if (onKarbon) await chrome.action.setBadgeBackgroundColor({ tabId: t.id, color: b.color });
  }).map((p) => p.catch(() => {})));
  if (!out) await checkLongTimer(s, cfg);
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if ((info.status === 'complete' || info.url) && isKarbon(info.url || tab.url)) refreshBadge().catch(() => {});
});

// ---- Long-running timer alert (once per timer) ----
const longOn = (cfg) => !!cfg.longTimerAlert && cfg.longTimerHours > 0;

async function checkLongTimer(s, cfg) {
  if (!active(s) || s.state !== 'Started' || !longOn(cfg)) return;
  if (elapsedSeconds(s) < cfg.longTimerHours * 3600) return;
  const id = `long:${s.work}:${s.initialStart}`;
  const { alerted } = await chrome.storage.session.get('alerted');
  if (alerted === id) return;
  await chrome.storage.session.set({ alerted: id });
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: `Timer running for ${cfg.longTimerHours}+ hours`,
    message: `${s.title || s.client || 'A Karbon timer'} has been running for ${elapsedText(s).replace('h', 'h ')}. Still working on it?`,
    priority: 1,
  });
}

chrome.notifications.onClicked.addListener(async (id) => {
  chrome.notifications.clear(id);
  if (await isSignedOut()) return;
  if (id.startsWith('finish:')) return openFinishWindow();
  const s = await cachedState();
  if (s && s.work) openWork({ tenant: s.tenant, work: s.work, linkType: s.linkType });
  else if (s) openFinishWindow();
});

// ---- Talking to Karbon ----
// Commands call Karbon's API from here with the signed-in session, so no Karbon tab is needed.
// When Karbon can't be reached that way, they run in a Karbon tab instead.
const direct = KTKarbon({
  fetch: (url, init) => fetch(url, init),
  keys: () => chrome.storage.local.get(['tenant', 'user', 'base']),
  onState: (state) => { handleState(state).catch(() => {}); },
  onTimeSettings: (timeCfg) => { chrome.storage.local.set({ timeCfg }).catch(() => {}); },
  onSaved: (pick) => { rememberWorkPick(pick).catch(() => {}); },
});

// ---- Role and task type per work item ----
// Like Karbon's own timer: each work item's last saved role and task type, kept 100 days.
// Only keys are stored, never names. Karbon keeps its copy in the browser, which the extension can't read.
const PICK_MS = 100 * 864e5;
const PICK_MAX = 300;
let picking = Promise.resolve();
function rememberWorkPick({ workKey, roleKey, taskTypeKey }) {
  picking = picking.then(async () => {
    const { workPicks = {} } = await chrome.storage.local.get('workPicks');
    const now = Date.now();
    const kept = Object.entries(workPicks)
      .filter(([k, v]) => k !== workKey && v && v.at > now - PICK_MS)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, PICK_MAX - 1);
    const pick = { roleKey: roleKey || null, taskTypeKey: taskTypeKey || null, at: now };
    await chrome.storage.local.set({ workPicks: Object.fromEntries([[workKey, pick], ...kept]) });
  }).catch(() => {});
  return picking;
}

// What start and prefill need to choose a role and task type the way Karbon does.
async function withPrefill(args = {}) {
  const d = await chrome.storage.local.get(['roleKey', 'taskTypeKey', 'workPicks', 'lookups']);
  const p = args.workKey && d.workPicks && d.workPicks[args.workKey];
  const lk = d.lookups || {};
  return {
    ...args,
    remembered: p && p.at > Date.now() - PICK_MS ? p : null,
    last: { roleKey: d.roleKey, taskTypeKey: d.taskTypeKey },
    known: { roles: (lk.roles || []).map((x) => x.key), taskTypes: (lk.taskTypes || []).map((x) => x.key) },
  };
}

// Karbon tabs, the one in front first, then the most recently used.
async function karbonTabs() {
  const tabs = await chrome.tabs.query({ url: `${KARBON}*` });
  return tabs.sort((a, b) => (b.active - a.active) || ((b.lastAccessed || 0) - (a.lastAccessed || 0)));
}
const karbonTab = async () => (await karbonTabs())[0] || null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A tab's answer, or null when nothing in it is listening (still loading, or opened before the
// extension last updated, since Chrome doesn't add content scripts to tabs that are already open).
async function askTab(tabId, cmd, args) {
  try { return (await chrome.tabs.sendMessage(tabId, { to: 'karbon', cmd, args })) || null; } catch { return null; }
}

// Opens Karbon in a background tab, or reloads a tab that stopped answering, and waits until it answers.
// Concurrent callers share one fix, so Karbon never opens or reloads twice.
let fixing = null;
function readyTab(stale) {
  if (!fixing) fixing = readyTabOnce(stale).finally(() => { fixing = null; });
  return fixing;
}

async function readyTabOnce(stale) {
  let tab = stale;
  if (tab) {
    await chrome.tabs.reload(tab.id);
  } else {
    const { tenant } = await chrome.storage.local.get('tenant');
    tab = await chrome.tabs.create({ url: tenant ? `${KARBON}${tenant}/` : KARBON, active: false });
  }
  for (let i = 0; i < 40; i++) {
    await sleep(750);
    const r = await askTab(tab.id, 'getState');
    if (r && r.ok) return tab;
  }
  return tab;
}

// Actions may open or reload Karbon; reads never do.
const NEEDS_TAB = new Set(['start', 'pause', 'resume', 'stopAndSave', 'discard', 'appendNote', 'edit', 'autoPause', 'autoResume', 'search', 'recents', 'clientWork', 'workTemplates', 'createWork']);
const WRITES = new Set(['start', 'pause', 'resume', 'stopAndSave', 'discard', 'appendNote', 'edit', 'autoPause', 'autoResume', 'createWork']);

// UNREACHABLE means neither Karbon's API nor a Karbon tab answered a read.
// SIGNED_OUT means Karbon says this browser is signed out. No tab is opened for it.
// Failures are kept for the feedback form. Signed out is a state, not an error.
async function toKarbon(cmd, args) {
  if (cmd === 'start' || cmd === 'prefill') args = await withPrefill(args);
  const r = await toKarbonOnce(cmd, args);
  if (!r.ok && r.code !== 'SIGNED_OUT') ktRecordError(cmd, r.error);
  return r;
}

async function toKarbonOnce(cmd, args) {
  const before = direct.writes();
  try {
    const result = await direct.run(cmd, args);
    if (direct.writes() !== before) noteDirectWrites({ ok: true });
    await setSignedIn(true);
    return { ok: true, result };
  } catch (e) {
    if (e.signedOut) return signedOutReply();
    if (!e.reach) return { ok: false, error: e.message };
    if (await isSignedOut()) return signedOutReply();
    if (WRITES.has(cmd) && !e.noKeys) noteDirectWrites({ ok: false, error: e.message });
    return viaTab(cmd, args, e.message);
  }
}

async function viaTab(cmd, args, why) {
  const tabs = await karbonTabs();
  for (const t of tabs) {
    const r = await askTab(t.id, cmd, args);
    if (r && r.code === 'SIGNED_OUT') return (await confirmSignedOut()) ? signedOutReply() : { ok: false, error: why };
    if (r) return r;
  }
  if (!NEEDS_TAB.has(cmd)) return { ok: false, code: 'UNREACHABLE', error: why };
  const tab = await readyTab(tabs[0] || null);
  return (await askTab(tab.id, cmd, args)) || { ok: false, error: 'Karbon did not respond. Try again in a few seconds.' };
}

// Whether timer changes work without a Karbon tab, for the Connection line. Stored only when it changes.
async function noteDirectWrites({ ok, error = null }) {
  const { directWrites: was } = await chrome.storage.local.get('directWrites');
  if (was && was.ok === ok) return;
  await chrome.storage.local.set({ directWrites: { ok, error, at: Date.now() } });
}

// ---- Signed out of Karbon ----
// The stored signedIn flag hides the timer in the panel and badge.
async function setSignedIn(on) {
  const { signedIn } = await chrome.storage.local.get('signedIn');
  if (signedIn === on) return;
  await chrome.storage.local.set({ signedIn: on });
  await refreshBadge();
}

async function signedOutReply() {
  await setSignedIn(false);
  return { ok: false, code: 'SIGNED_OUT', error: KT_SIGNED_OUT };
}

// Asks Karbon whether this browser is signed in. signedOut is set only when Karbon says so plainly:
// a 401, or its sign-in page where data should be. A refused or failed call leaves it unknown.
async function sessionCheck(k) {
  const out = { ok: false, status: 0, signedOut: false };
  if (!k || !k.base || !k.tenant || !k.user) return out;
  try {
    const r = await fetch(`${k.base}/api/${k.tenant}/userEnvironmentSettings/${k.user}`, { credentials: 'include' });
    out.status = r.status;
    const j = r.ok ? await r.json().catch(() => null) : null;
    const env = j && j.userEnvironmentSettings;
    out.ok = !!(env && env.userProfilePermaKey === k.user);
    out.signedOut = r.status === 401 || (r.ok && !j);
    if (env && env.tenantName) out.firmName = env.tenantName;
  } catch (e) { out.error = String((e && e.message) || e); }
  return out;
}

// A Karbon tab reports it is signed out. Karbon's API gets the last word when it can answer.
async function confirmSignedOut() {
  const c = await sessionCheck(await chrome.storage.local.get(['tenant', 'user', 'base']));
  if (c.ok) { await setSignedIn(true); return false; }
  await setSignedIn(false);
  return true;
}

// The panel's Sign in button: opens Karbon, which shows its sign-in page, in front.
async function openSignIn() {
  const { tenant } = await chrome.storage.local.get('tenant');
  const url = tenant ? `${KARBON}${tenant}/` : KARBON;
  const tab = await karbonTab();
  if (tab) {
    await chrome.tabs.update(tab.id, { url, active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
}

// The setup page's first look: right after install the cookie is often unreadable and no Karbon
// tab has the content script yet. A short-lived background tab lets Karbon boot and report its keys.
let probing = null;
let probe = { tabId: null, out: false };
let installTab = null;   // the Karbon tab opened on install; the probe watches it instead of opening another
function probeKarbon() {
  if (!probing) probing = probeKarbonOnce().finally(() => { probing = null; probe = { tabId: null, out: false }; });
  return probing;
}

async function probeKarbonOnce() {
  const { tenant } = await chrome.storage.local.get('tenant');
  const own = installTab && (await chrome.tabs.get(installTab).catch(() => null));
  const tab = own || (await chrome.tabs.create({ url: tenant ? `${KARBON}${tenant}/` : KARBON, active: false }));
  probe = { tabId: tab.id, out: false };
  try {
    // Karbon rewrites its bootstrap cookie (7-day life, not renewed on load) while it boots, after
    // the page already knows the keys. Stop once the cookie is back, a few seconds after the page
    // reports keys, or when the tab says signed out. Karbon's sign-in page may be on another host
    // with no content script, so give up after about 15 seconds.
    let keysAt = null;
    for (let i = 0; i < 20 && !probe.out; i++) {
      await sleep(750);
      if (await readBootstrapCookie()) break;
      const k = await chrome.storage.local.get(['user', 'signedIn']);
      if (k.user && k.signedIn && keysAt === null) keysAt = i;
      if (keysAt !== null && i - keysAt >= 6) break;
    }
  } finally {
    // The install tab is the person's Karbon tab now; only a tab the probe opened is closed.
    if (!own) await chrome.tabs.remove(tab.id).catch(() => {});
  }
  return learnAccount();
}

// Karbon's page for each kind of timer target.
const PATHS = { WorkItem: 'work', Contact: 'contacts', Organization: 'organizations', ClientGroup: 'client-groups' };

async function openWork({ tenant, work, linkType }) {
  const section = PATHS[linkType || 'WorkItem'];
  const url = tenant && work && section ? `${KARBON}${tenant}/${section}/${work}` : KARBON;
  const tab = await karbonTab();
  if (tab) {
    await chrome.tabs.update(tab.id, { url, active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
}

// ---- Finishing a timer that is missing details ----
// A stop or switch that can't save yet pauses the timer and asks for the missing details.
// pendingFinish: { note, then, thenTitle, missing, reason }. "then" is the start to run once the entry is saved.
// ui: 'window' opens a small finish window; 'popup' means the toolbar panel shows the form itself.
// suggest: the item you had open, offered as a one-click pick on the finish form.
async function promptFinish({ note = null, then = null, thenTitle = null, missing = ['work'], reason = 'stop', ui = 'window', suggest = null }) {
  await toKarbon('autoPause', { note: null });
  await chrome.storage.session.set({ pendingFinish: { note, then, thenTitle, missing, reason, suggest, at: Date.now() } });
  await refreshBadge();
  if (ui === 'window') await openFinishWindow();
  return { ok: true };
}

// The toolbar panel shows the finish form whenever one is pending, so open the panel itself.
// A separate window is the fallback: openPopup needs Chrome 127+ and a focused browser window.
async function openFinishWindow() {
  try {
    await chrome.action.openPopup();
    return;
  } catch (e) {
    console.info('[KT] panel could not open, using a window:', e && e.message);
  }
  const { finishWindowId } = await chrome.storage.session.get('finishWindowId');
  if (finishWindowId) {
    try {
      await chrome.windows.update(finishWindowId, { focused: true, drawAttention: true });
      return;
    } catch {}
  }
  const w = await chrome.windows.create({ url: 'complete.html?mode=window', type: 'popup', width: 400, height: 640, focused: true });
  await chrome.storage.session.set({ finishWindowId: w.id });
}

chrome.windows.onRemoved.addListener(async (id) => {
  const { finishWindowId } = await chrome.storage.session.get('finishWindowId');
  if (finishWindowId === id) await chrome.storage.session.remove('finishWindowId');
});

// Saves the paused timer with the details from the finish form, then runs any pending switch.
async function finishTimer({ fill }) {
  const p = (await pendingFinish()) || {};
  const r = await toKarbon('stopAndSave', { note: p.note || null, fill, interactive: true });
  if (!r || !r.ok) return r;
  if (r.result && r.result.needsCompletion) return r;
  await chrome.storage.session.remove('pendingFinish');
  let started = null;
  if (p.then) started = await toKarbon('start', { ...p.then, interactive: true });
  await refreshBadge();
  return { ok: true, result: { ...r.result, started } };
}

// Throws the paused timer away, then runs any pending switch, same as a save would.
async function discardTimer() {
  const p = (await pendingFinish()) || {};
  const r = await toKarbon('discard', {});
  if (!r || !r.ok) { await refreshBadge(); return r; }
  await chrome.storage.session.remove('pendingFinish');
  let started = null;
  if (p.then) started = await toKarbon('start', { ...p.then, interactive: true });
  await refreshBadge();
  return { ...r, result: { ...(r.result || {}), started } };
}

// ---- Messages ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'state') {
    handleState(msg.state);
    return false;
  }
  if (msg.type === 'prefillArgs') {
    withPrefill(msg.args).then(sendResponse);
    return true;
  }
  if (msg.type === 'workPick') {
    if (msg.pick && msg.pick.workKey) rememberWorkPick(msg.pick);
    return false;
  }
  if (msg.type === 'cmd') {
    toKarbon(msg.cmd, msg.args).then(sendResponse);
    return true;
  }
  if (msg.type === 'signIn') {
    openSignIn().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'pageSignedOut') {
    if (sender.tab && sender.tab.id === probe.tabId) probe.out = true;
    confirmSignedOut().then(sendResponse, () => sendResponse(false));
    return true;
  }
  if (msg.type === 'getCached') {
    cachedState().then(sendResponse);
    return true;
  }
  if (msg.type === 'openWork') {
    openWork(msg).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'promptFinish') {
    promptFinish(msg).then(sendResponse);
    return true;
  }
  if (msg.type === 'getPending') {
    pendingFinish().then(sendResponse);
    return true;
  }
  if (msg.type === 'finishTimer') {
    finishTimer(msg).then(sendResponse);
    return true;
  }
  if (msg.type === 'cancelFinish') {
    chrome.storage.session.remove('pendingFinish').then(refreshBadge).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'discardTimer') {
    discardTimer().then(sendResponse);
    return true;
  }
  if (msg.type === 'pageKeys') {
    learnAccount(msg.keys).then(sendResponse, () => sendResponse({ signedIn: false }));
    return true;
  }
  if (msg.type === 'probeKarbon') {
    probeKarbon().then(sendResponse, () => sendResponse({ signedIn: false }));
    return true;
  }
  if (msg.type === 'learnAccount') {
    learnAccount().then(sendResponse, () => sendResponse({ signedIn: false }));
    return true;
  }
  if (msg.type === 'canReach') {
    canReach().then(sendResponse);
    return true;
  }
  return false;
});

// Karbon answers without opening anything: the direct check passed, or a Karbon tab is open.
async function canReach() {
  if (await isSignedOut()) return false;
  const { directApi } = await chrome.storage.local.get('directApi');
  return !!(directApi && directApi.ok) || !!(await karbonTab());
}

async function handleState(state) {
  await chrome.storage.session.set({ state, stateAt: Date.now() });
  const keep = {};
  if (state && state.tenant) keep.tenant = state.tenant;
  if (state && state.user) keep.user = state.user;
  if (state && state.base) keep.base = state.base;
  // Learn the default role and task type from any timer Karbon starts.
  if (state && state.work && state.roleKey && state.taskTypeKey) Object.assign(keep, { roleKey: state.roleKey, taskTypeKey: state.taskTypeKey });
  if (Object.keys(keep).length) await chrome.storage.local.set(keep);
  // Karbon only sends a timer to a signed-in session.
  if (state) await setSignedIn(true);
  // Saved or discarded somewhere else (Karbon itself, another device): nothing is left to finish.
  if (state && state.state === 'Stopped') await chrome.storage.session.remove('pendingFinish');
  await refreshBadge();
}

// ---- Keyboard shortcut: start, pause, or resume from anywhere ----
// With no timer running, it starts a blank timer, with the role and task type Karbon would prefill.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-timer') return;
  // Signed out: nothing to toggle. The badge already says so.
  if (await isSignedOut()) return;
  const cfg = await settings();
  const s = await cachedState();
  if (!active(s)) {
    await toKarbon('start', { note: KTNotes.note('manualStart', cfg.noteLevel) });
    return;
  }
  const cmd = s.state === 'Started' ? 'pause' : 'resume';
  await toKarbon(cmd, { note: KTNotes.note(cmd === 'pause' ? 'manualPause' : 'manualResume', cfg.noteLevel) });
});

// ---- Lock and idle ----
async function applyIdleInterval() {
  const cfg = await settings();
  chrome.idle.setDetectionInterval(Math.max(1, cfg.idleMinutes) * 60);
}

chrome.idle.onStateChanged.addListener(async (newState) => {
  const cfg = await settings();
  const reason = newState === 'locked' && cfg.pauseOnLock ? 'lock' : newState === 'idle' && cfg.idlePause ? 'idle' : null;
  if (reason) {
    if (!active(await cachedState())) return;
    const note = reason === 'lock'
      ? KTNotes.note('lockPause', cfg.noteLevel)
      : KTNotes.note('idlePause', cfg.noteLevel, { minutes: cfg.idleMinutes });
    const r = await toKarbon('autoPause', { note });
    if (r && r.ok && r.result && r.result.paused) await chrome.storage.session.set({ autoPausedBy: reason });
  } else if (newState === 'active') {
    const { autoPausedBy } = await chrome.storage.session.get('autoPausedBy');
    if (autoPausedBy && cfg.autoResume) {
      const note = KTNotes.note(autoPausedBy === 'lock' ? 'unlockResume' : 'idleResume', cfg.noteLevel);
      await toKarbon('autoResume', { note });
    }
    await chrome.storage.session.set({ autoPausedBy: null });
  }
});

// ---- Day-end split: save at 11:59 PM, restart just after midnight ----
function nextAt(hour, minute, second = 0) {
  const d = new Date();
  d.setHours(hour, minute, second, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d.getTime();
}

function scheduleDayEnd() {
  chrome.alarms.create('dayEnd', { when: nextAt(23, 59) });
}

async function onDayEnd() {
  scheduleDayEnd();
  const cfg = await settings();
  if (!cfg.splitAtMidnight) return;
  const s = await cachedState();
  if (!active(s)) return;
  if (s.state === 'Paused') {
    const r = await toKarbon('stopAndSave', { note: KTNotes.note('dayEndStopPaused', cfg.noteLevel) });
    if (r && r.ok && r.result && r.result.needsCompletion) await dayEndNeedsFinish(r.result, cfg);
    return;
  }
  const r = await toKarbon('stopAndSave', { note: KTNotes.note('dayEndStop', cfg.noteLevel) });
  if (r && r.ok && r.result && r.result.needsCompletion) return dayEndNeedsFinish(r.result, cfg);
  if (!r || !r.ok || !r.result || !r.result.saved) return;
  const w = r.result.was;
  await chrome.storage.local.set({ restartAfterMidnight: { workKey: w.work, linkType: w.linkType, roleKey: w.roleKey, taskTypeKey: w.taskTypeKey } });
  chrome.alarms.create('dayStart', { when: nextAt(0, 0, 30) });
}

// A timer without a work item can't be saved unattended: pause it, keep its date, and ask in the morning.
async function dayEndNeedsFinish(result, cfg) {
  await promptFinish({ note: KTNotes.note('dayEndStopPaused', cfg.noteLevel), missing: result.missing, reason: 'dayEnd', ui: 'none' });
  chrome.notifications.create(`finish:${Date.now()}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Timer paused at the end of the day',
    message: 'It has no work item yet, so it could not be saved. Click to finish it. The time stays on the day it was recorded.',
    priority: 1,
    requireInteraction: true,
  });
}

async function onDayStart() {
  const { restartAfterMidnight: p } = await chrome.storage.local.get('restartAfterMidnight');
  await chrome.storage.local.remove('restartAfterMidnight');
  if (!p) return;
  const cfg = await settings();
  await toKarbon('start', { ...p, note: KTNotes.note('dayStartRestart', cfg.noteLevel) });
}

// ---- Heartbeat: badge refresh and sleep-gap detection ----
// While a timer shows as running, or Karbon is signed out, ask Karbon each minute,
// so a sign-out hides the timer and a sign-in elsewhere brings it back.
async function checkSignIn() {
  if (!active(await cachedState()) && !(await isSignedOut())) return;
  try {
    await direct.run('getState');
    await setSignedIn(true);
  } catch (e) {
    if (e.signedOut) await setSignedIn(false);
  }
}

async function onHeartbeat() {
  await checkSignIn().catch(() => {});
  await refreshBadge();
  const now = Date.now();
  const { lastBeat } = await chrome.storage.local.get('lastBeat');
  await chrome.storage.local.set({ lastBeat: now });
  if (!lastBeat || now - lastBeat < SLEEP_GAP_MS) return;
  const s = await cachedState();
  if (!s || s.state !== 'Started') return;
  const cfg = await settings();
  const note = KTNotes.note('sleepGap', cfg.noteLevel, { from: KTNotes.fmt(new Date(lastBeat)), to: KTNotes.fmt(new Date(now)) });
  if (cfg.pauseOnLock) {
    const r = await toKarbon('autoPause', { note });
    if (r && r.ok && r.result && r.result.paused) await chrome.storage.session.set({ autoPausedBy: 'lock' });
  } else if (note) {
    await toKarbon('appendNote', { text: note });
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'heartbeat') onHeartbeat();
  else if (alarm.name === 'dayEnd') onDayEnd();
  else if (alarm.name === 'dayStart') onDayStart();
});

// ---- Account keys from Karbon's bootstrap cookie (no Karbon tab needed) ----
// Karbon sets a readable cookie, bootstrap-cookie-<env>, holding the default tenant, the user's
// profile key (the stopwatch ID), and the regional API host. It carries no secrets.
let cookieNote = '';
async function readBootstrapCookie() {
  const tries = [{ url: KARBON }, { domain: 'karbonhq.com' }];
  let c = null;
  const notes = [];
  for (const q of tries) {
    try {
      const list = await chrome.cookies.getAll(q);
      c = list.find((x) => x.name.startsWith('bootstrap-cookie-'));
      notes.push(`${q.url ? 'url' : 'domain'}: ${list.length} cookies`);
      if (c) break;
    } catch (e) { notes.push(`${q.url ? 'url' : 'domain'}: ${String((e && e.message) || e)}`); }
  }
  cookieNote = c ? '' : notes.join('; ');
  if (!c) return null;
  const o = {};
  let text = c.value;
  try { text = decodeURIComponent(c.value); } catch {}
  text.split('&').forEach((pair) => {
    const i = pair.indexOf('=');
    if (i > 0) {
      let v = pair.slice(i + 1);
      try { v = decodeURIComponent(v); } catch {}
      o[pair.slice(0, i).trim()] = v;
    }
  });
  if (!o.tenantPermaKey || !o.userProfilePermaKey) { cookieNote = 'cookie found without keys'; return null; }
  let base = null;
  try { base = new URL(o.dataCenterUrl || o.bootstrapEndpoint).origin; } catch {}
  return { tenant: o.tenantPermaKey, user: o.userProfilePermaKey, base };
}

// Stores the keys, and checks once whether the background can reach Karbon's API without a tab.
// The result is shown on the setup guide. firmName is for display only.
// fromPage: keys reported by an open Karbon tab, used when the cookie can't be read here.
async function learnAccount(fromPage = null) {
  const k = (await readBootstrapCookie()) || (fromPage && fromPage.tenant && fromPage.user ? fromPage : null);
  if (!k) {
    // Keep keys an open Karbon tab already reported; only say "not signed in" when there are none,
    // or when Karbon says this browser signed out (the cookie can go away at sign-out).
    const known = await chrome.storage.local.get(['tenant', 'user', 'base', 'signedIn']);
    const out = !known.user || known.signedIn === false || (await sessionCheck(known)).signedOut;
    await chrome.storage.local.set({ cookieNote });
    await setSignedIn(!out);
    return { signedIn: !out };
  }
  const prev = await chrome.storage.local.get(['user']);
  const keep = { tenant: k.tenant, user: k.user };
  if (k.base) keep.base = k.base;
  // Someone else signed in on this browser: last-used role and task type belonged to the old user.
  if (prev.user && prev.user !== k.user) await chrome.storage.local.remove(['roleKey', 'taskTypeKey', 'workPicks', 'lookups']);
  await chrome.storage.local.set(keep);
  const { firmName, signedOut, ...direct } = await sessionCheck(k);
  if (firmName) keep.firmName = firmName;
  await chrome.storage.local.set({ ...keep, cookieNote, keySource: fromPage && k === fromPage ? 'tab' : 'cookie', directApi: { ...direct, at: Date.now() } });
  await setSignedIn(!signedOut);
  if (!signedOut) warmLists().catch(() => {});
  return { signedIn: !signedOut, direct };
}

// Fetches the role and task type lists once the account is known, so the panel, finish form,
// and presets have them right after install instead of after a Karbon refresh.
async function warmLists() {
  const { lookups } = await chrome.storage.local.get('lookups');
  if (lookups && lookups.roles && lookups.roles.length) return;
  const r = await toKarbon('lookups', {});
  if (r.ok && (r.result.roles.length || r.result.taskTypes.length)) await chrome.storage.local.set({ lookups: r.result });
}

chrome.cookies.onChanged.addListener(({ cookie }) => {
  if (cookie && cookie.name.startsWith('bootstrap-cookie-') && KARBON.includes(cookie.domain.replace(/^\./, ''))) learnAccount().catch(() => {});
});

// ---- Startup, install, and settings changes ----
async function boot() {
  chrome.alarms.create('heartbeat', { periodInMinutes: HEARTBEAT_MIN });
  const existing = await chrome.alarms.get('dayEnd');
  if (!existing) scheduleDayEnd();
  applyIdleInterval();
  applyIcon().catch(() => {});
  refreshBadge();
  learnAccount().catch(() => {});
}

// True when an update comes from a version older than v ("0.7.7").
const before = (prev, v) => {
  const a = String(prev || '').split('.').map(Number), b = v.split('.').map(Number);
  for (let i = 0; i < b.length; i++) if ((a[i] || 0) !== b[i]) return (a[i] || 0) < b[i];
  return false;
};

chrome.runtime.onInstalled.addListener(async ({ reason, previousVersion }) => {
  // Older drafts had a separate auto-start checkbox; carry that choice over.
  // Carry older choices into the auto-start settings. A stored noTimerAction means the person chose it,
  // so "none" or "nudge" keeps work-item auto-start off; "start" (or the oldest autoStart checkbox) turns it on.
  const old = await chrome.storage.sync.get(['autoStart', 'noTimerAction', 'dwellSeconds', 'toastSeconds']);
  const carry = {};
  if (old.noTimerAction !== undefined) {
    carry.autoStartWork = old.noTimerAction === 'start';
    carry.remindNoTimer = old.noTimerAction === 'nudge';
  } else if (old.autoStart !== undefined) {
    carry.autoStartWork = !!old.autoStart;
  }
  // 0.7.1: the long-timer alert became a switch. An old "0 hours" meant off.
  const lt = await chrome.storage.sync.get(['longTimerAlert', 'longTimerHours']);
  if (lt.longTimerAlert === undefined && lt.longTimerHours === 0) Object.assign(carry, { longTimerAlert: false, longTimerHours: 3 });
  // 0.7.7: contacts got their own choice. Contact auto-start used to apply only while
  // work-item auto-start was on, so keep it off for anyone who had work-item auto-start off.
  if (reason === 'update' && before(previousVersion, '0.7.7')) {
    const c = await chrome.storage.sync.get({ autoStartWork: true, autoStartContacts: false });
    const work = carry.autoStartWork ?? c.autoStartWork;
    if (c.autoStartContacts && !work) carry.autoStartContacts = false;
  }
  // 0.7.11: contacts used to switch only when auto-switch and contact auto-start were both turned on.
  if (reason === 'update' && before(previousVersion, '0.7.11')) {
    const was = await chrome.storage.sync.get(['autoSwitch', 'autoStartContacts']);
    if (was.autoSwitch === true && (carry.autoStartContacts ?? was.autoStartContacts) === true) carry.autoSwitchContacts = true;
  }
  if (Object.keys(carry).length) await chrome.storage.sync.set(carry);
  // 0.7.1: the default work item was removed.
  await chrome.storage.local.remove('defaultWork');
  await chrome.storage.sync.remove(['autoStart', 'noTimerAction', 'dwellSeconds', 'toastSeconds'].filter((k) => old[k] !== undefined));
  if (reason === 'install') {
    // Karbon tabs open before the install have no content script, and a fresh Karbon page lets the
    // extension learn the account and lists. Open one behind the setup page.
    await chrome.tabs.create({ url: 'welcome.html' });
    installTab = (await chrome.tabs.create({ url: KARBON, active: false })).id;
  }
  boot();
});
chrome.runtime.onStartup.addListener(boot);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (changes.idleMinutes) applyIdleInterval();
  if (changes.toolbarTheme) applyIcon().catch(() => {});
  if (changes.showIdleBadge || changes.badgeWhere || changes.longTimerHours || changes.longTimerAlert) refreshBadge();
});
