ktWatchErrors('panel');
const KARBON = KT_ORIGIN;
const ICON = {
  pause: 'M9 6v12M15 6v12',
  play: 'M8 5.5v13l10-6.5z',
  start: 'M9 6.5v11l9-5.5z',
};

let current = null;      // timer state
let here = null;         // the active tab, when it is a Karbon work item: { key, title }
let notesTimer = null;   // pending save of the notes field
let timeCfg = null;      // the firm's time settings: { workOnly, notesRequired }
let tick = null;
let lists = null;        // role and task type lists: { roles, taskTypes }
let picks = null;        // the start form's role and task type, once prefilled or chosen: { roleKey, taskTypeKey }
let signedOut = false;   // Karbon says this browser is signed out

const send = (cmd, args) => chrome.runtime.sendMessage({ type: 'cmd', cmd, args });
const level = async () => (await chrome.storage.sync.get({ noteLevel: 'auto' })).noteLevel;
const noteFor = async (event, ctx) => KTNotes.note(event, await level(), ctx);
// A blank timer (no work item yet) still counts as running.
const isActive = (s) => !!(s && s.state && s.state !== 'Stopped');

// ---- Status line: problems only ----
// Actions open or reload Karbon on their own when they need a tab, so there is no fix-it link.
function say(text) {
  $('msg').textContent = text;
}

const workOnly = () => !!(timeCfg && timeCfg.workOnly);
const isWorkItem = (linkType) => !linkType || linkType === 'WorkItem';

// ---- Rendering the current timer ----
function render(s) {
  current = s;
  $('signedOut').hidden = !signedOut;
  if (signedOut) return renderSignedOut();
  const act = isActive(s);
  const st = act ? s.state : 'Stopped';
  $('pill').textContent = !s ? 'Unknown' : st === 'Started' ? 'Running' : st === 'Paused' ? 'Paused' : 'No timer';
  $('pill').className = `pill ${st === 'Started' ? 'running' : st === 'Paused' ? 'paused' : ''}`;

  $('timer').hidden = !act;
  if (act) {
    renderDetails(s);
    const resumeMode = st === 'Paused';
    $('toggleIcon').setAttribute('d', resumeMode ? ICON.play : ICON.pause);
    $('toggle').setAttribute('aria-label', resumeMode ? 'Resume timer' : 'Pause timer');
    $('toggle').title = resumeMode ? 'Resume timer' : 'Pause timer';
  }

  // One form at a time: the running timer's card, or the start form when nothing runs.
  $('startBox').hidden = act;

  clearInterval(tick);
  const draw = () => {
    if (!act) return;
    const secs = elapsedSeconds(s);
    $('elapsed').textContent = hms(secs);
    $('timer').setAttribute('aria-label', `Timer ${st === 'Paused' ? 'paused' : 'running'}, ${spoken(secs)}, ${s.work ? `on ${s.title || s.client || 'a work item'}` : 'no work item yet'}`);
  };
  draw();
  if (st === 'Started') tick = setInterval(draw, 1000);
  renderQuick();
}

// Signed out: hide the timer and the start form, and offer only the way back in.
function renderSignedOut() {
  clearInterval(tick);
  $('pill').textContent = 'Signed out';
  $('pill').className = 'pill';
  $('timer').hidden = true;
  $('startBox').hidden = true;
  say('');
}

function setSignedOut(on) {
  if (signedOut === on) return;
  signedOut = on;
  render(current);
  if (!on) loadLookups();
}

// The running timer's work, role, and task type stay visible and editable.
// Anything Karbon needs before it will save the entry is outlined in red while it's missing.
function renderDetails(s) {
  if (!cur.work) return; // fields not built yet
  // A work item shows under Work, with its client under Client. A client timer shows only under Client.
  const blank = !s.work;
  const onWork = !blank && isWorkItem(s.linkType);
  cur.work.show(onWork ? { key: s.work, title: s.title || 'Untitled work item' } : null);
  cur.client.show(blank ? null : onWork ? { title: s.client } : { key: s.work, title: s.client || 'Client', linkType: s.linkType });
  // Karbon needs one of the two. A client only counts where the firm allows time on clients.
  const none = blank || (workOnly() && !onWork);
  cur.work.invalid(none);
  cur.client.invalid(blank && !workOnly());

  const lk = lists || {};
  fillCurrent($('curRole'), lk.roles || [], s.roleKey, 'role');
  fillCurrent($('curTask'), lk.taskTypes || [], s.taskTypeKey, 'task type');
  const cfg = timeCfg || {};
  // Required shows only as a red outline while empty; screen readers get aria-required.
  $('curRole').setAttribute('aria-required', String(!!cfg.roleRequired));
  $('curTask').setAttribute('aria-required', String(!!cfg.taskTypeRequired));
  setInvalid($('curRole'), !!cfg.roleRequired && emptySel($('curRole')));
  setInvalid($('curTask'), !!cfg.taskTypeRequired && emptySel($('curTask')));
  $('curNotes').setAttribute('aria-required', String(!!cfg.notesRequired));
  // Don't overwrite what you're typing when the state refreshes.
  if (document.activeElement !== $('curNotes') && !notesTimer) $('curNotes').value = s.description || '';
}

function setInvalid(field, on) {
  if (on) field.setAttribute('aria-invalid', 'true');
  else field.removeAttribute('aria-invalid');
}

// "This work item" as a one-click pick.
function renderQuick() {
  const list = $('quickList');
  list.replaceChildren();
  const running = isActive(current) ? current.work : null;
  if (here && here.key !== running) {
    const it = { key: here.key, linkType: 'WorkItem', title: here.title };
    list.append(el('li', {}, pickRow(it, () => start.work.pick(it), 'This work item:')));
  }
}

async function refresh() {
  const r = await send('getState');
  if (r && r.ok) { setSignedOut(false); return render(r.result); }
  if (r && r.code === 'SIGNED_OUT') return setSignedOut(true);
  render(await chrome.runtime.sendMessage({ type: 'getCached' }));
  if (r && r.code !== 'UNREACHABLE') sayError(r);
}

// Any reply that says Karbon is signed out swaps the panel to the sign-in view.
// The panel's Sign in button is then the only way to Karbon's sign-in page.
function sayError(r) {
  if (r && r.code === 'SIGNED_OUT') return setSignedOut(true);
  say((r && r.error) || 'Something went wrong.');
}

async function run(cmd, args) {
  say('');
  const r = await send(cmd, args);
  if (!r || !r.ok) { sayError(r); return false; }
  refresh();
  return true;
}

// ---- Timer actions ----
$('toggle').addEventListener('click', async () => {
  if (current && current.state === 'Paused') run('resume', { note: await noteFor('manualResume') });
  else run('pause', { note: await noteFor('manualPause') });
});

// Hands off to the finish form, in this panel, when the timer needs details before it can be saved.
async function toFinishForm({ note, then = null, thenTitle = null, missing }) {
  await chrome.runtime.sendMessage({ type: 'promptFinish', ui: 'popup', reason: then ? 'switch' : 'stop', note, then, thenTitle, missing });
  location.href = 'complete.html?mode=popup';
}

// ---- Stop, swap, and discard ----
// Stop and Swap save the entry from the card. Required fields still empty bounce instead of opening a second form.
// Focus stays on the button: focusing the Work field would open its recents over the red outline.
const FIELD = { work: 'curWorkQ', role: 'curRole', taskType: 'curTask', notes: 'curNotes' };

function missingHere() {
  const m = [];
  const cfg = timeCfg || {};
  if (!current.work) m.push('work');
  if (cfg.roleRequired && emptySel($('curRole'))) m.push('role');
  if (cfg.taskTypeRequired && emptySel($('curTask'))) m.push('taskType');
  return m;
}

// The red outline and shake say what's missing, so there is no message.
function bounce(missing) {
  say('');
  for (const k of missing) {
    const f = $(FIELD[k]);
    setInvalid(f, true);
    f.classList.remove('bounce');
    void f.offsetWidth; // restarts the animation on a second press
    f.classList.add('bounce');
    f.addEventListener('animationend', () => f.classList.remove('bounce'), { once: true });
  }
}

// Saves the running timer, or bounces what's missing. Returns the save result, or null.
async function saveCurrent() {
  const missing = missingHere();
  if (missing.length) { bounce(missing); return null; }
  say('');
  // Notes edited but not yet saved go on this entry.
  if (!(await saveNotes())) return null;
  const r = await send('stopAndSave', { note: await noteFor('manualStop'), interactive: true });
  if (!r || !r.ok) { sayError(r); return null; }
  if (r.result && r.result.needsCompletion) { bounce(r.result.missing); return null; }
  return r.result || {};
}

$('stop').addEventListener('click', async () => {
  const res = await saveCurrent();
  if (!res) return;
  refresh();
});

// Swap: save this timer, then start a blank one with the role and task type Karbon would prefill.
$('swap').addEventListener('click', async () => {
  const res = await saveCurrent();
  if (!res) return;
  const r = await send('start', { workKey: null, linkType: null, note: await noteFor('manualStart'), interactive: true });
  if (!r || !r.ok) { refresh(); return sayError(r); }
  await refresh();
});

// Two presses, so a stray click can't throw time away. The first fills the button red
// and relabels it; it disarms after a few seconds or on blur. Play then starts a new timer.
let discardArmed = null;
function setDiscardArmed(on) {
  const b = $('discard');
  clearTimeout(discardArmed);
  discardArmed = on ? setTimeout(() => setDiscardArmed(false), 4000) : null;
  b.classList.toggle('armed', on);
  const mins = on && current ? Math.max(1, Math.ceil(elapsedSeconds(current) / 60)) : 0;
  const label = on ? `Press again to discard ${mins} minute${mins === 1 ? '' : 's'}` : 'Discard timer';
  b.setAttribute('aria-label', label);
  b.title = label;
}
$('discard').addEventListener('blur', () => setDiscardArmed(false));
$('discard').addEventListener('click', async () => {
  if (!discardArmed) return setDiscardArmed(true);
  setDiscardArmed(false);
  say('');
  const r = await send('discard', {});
  if (!r || !r.ok) return sayError(r);
  await refresh();
  $('go').focus();
});

// ---- Editing the running timer ----
async function editCurrent(args) {
  say('');
  const r = await send('edit', args);
  if (!r || !r.ok) sayError(r);
  refresh();
  return !!(r && r.ok);
}

$('curRole').addEventListener('change', () => editCurrent({ roleKey: $('curRole').value || null }));
$('curTask').addEventListener('change', () => editCurrent({ taskTypeKey: $('curTask').value || null }));

// The timer is on its work item, or else its client. Clearing both leaves it blank.
// A work item brings its own role and task type when Karbon has them, as in Karbon's timer.
async function setEntity(item) {
  if (!item) return editCurrent({ workKey: null });
  const args = { workKey: item.key, linkType: item.linkType || 'WorkItem' };
  const p = await workPrefill(item);
  if (p) Object.assign(args, { roleKey: p.roleKey, taskTypeKey: p.taskTypeKey });
  return editCurrent(args);
}

// Notes save a moment after you stop typing, and when you leave the field.
async function saveNotes() {
  clearTimeout(notesTimer);
  notesTimer = null;
  const text = $('curNotes').value;
  if (!current || text === (current.description || '')) return true;
  const r = await send('edit', { description: text });
  if (!r || !r.ok) { sayError(r); return false; }
  current.description = text;
  return true;
}
$('curNotes').addEventListener('input', () => {
  clearTimeout(notesTimer);
  notesTimer = setTimeout(saveNotes, 800);
});
$('curNotes').addEventListener('change', () => saveNotes());

// ---- Client and Work fields ----
// The start form's and the running timer's, built once the firm's settings are known.
const start = {};
const cur = {};

// Client scopes Work to its own work, so switching or clearing it clears Work.
// Work picked with no client fills in the work item's client.
function pickedWork(fields, item) {
  if (!workOnly() && !fields.client.item) fillClient(fields.client, item.client);
}
const scopeOf = (fields) => () => (!workOnly() && fields.client.item ? fields.client.item.title : null);

function buildFields() {
  const both = !workOnly();
  const opt = el('span', { class: 'req' }, '(optional)');
  start.client = pickField($('clientField'), { id: 'client', label: ['Client ', opt.cloneNode(true)], kind: 'contact', onError: sayError,
    onPick: () => { start.work.show(null, true); $('role').focus(); },
    onClear: () => start.work.show(null, true) });
  start.work = pickField($('workField'), { id: 'work', label: ['Work ', opt], kind: 'work', onError: sayError, describedBy: 'qHint',
    scope: scopeOf(start), onPick: (it) => { pickedWork(start, it); prefillWork(it); $('role').focus(); } });
  cur.client = pickField($('curClientField'), { id: 'curClient', label: 'Client', kind: 'contact', onError: sayError,
    onPick: (it) => { cur.work.show(null, true); setEntity(it); },
    onClear: () => { cur.work.show(null, true); setEntity(null); } });
  cur.work = pickField($('curWorkField'), { id: 'curWork', label: 'Work', kind: 'work', onError: sayError, scope: scopeOf(cur),
    onPick: (it) => setEntity(it),
    onClear: async () => {
      const c = workOnly() ? null : cur.client.item;
      const k = await keyedClient(c);
      if (c && !k) { refresh(); return say(`Couldn't find ${c.title} in Karbon. Search for the client instead.`); }
      setEntity(k);
    } });
  $('clientField').hidden = !both;
  $('curClientField').hidden = !both;
  cur.work.q.setAttribute('aria-required', String(!both));
}

// Work is optional: with nothing chosen, the timer starts blank and the details are asked for at stop.
async function startChosen() {
  if (isActive(current)) return;
  const c = start.client.item;
  const item = start.work.item || (workOnly() ? null : await keyedClient(c));
  if (!item && c && !workOnly()) return say(`Couldn't find ${c.title} in Karbon. Search for the client instead.`);
  startNew(item);
}

// The form's role and task type go as shown, so a None you chose stays None.
// Before the lists load, the background prefills them instead.
async function startArgs(item) {
  const shown = $('role').value && $('taskType').value;
  return {
    workKey: item ? item.key : null, linkType: item ? item.linkType || 'WorkItem' : null,
    ...(shown ? { roleKey: $('role').value, taskTypeKey: $('taskType').value, prefill: false } : {}),
    description: $('desc').value,
    note: await noteFor('manualStart'),
  };
}

async function startNew(item) {
  const args = await startArgs(item);
  say('');
  const stopNote = await noteFor('manualStop');
  const r = await send('start', { ...args, stopNote, interactive: true });
  if (!r || !r.ok) return sayError(r);
  await rememberPicks();
  if (r.result && r.result.needsCompletion) {
    return toFinishForm({ note: stopNote, then: args, thenTitle: item ? item.title : null, missing: r.result.missing });
  }
  $('desc').value = '';
  start.client.show(null, true);
  start.work.show(null, true);
  refresh();
}

// Remember the picks as last used. Karbon reports a "None" role as no key, so the timer alone can't tell us.
async function rememberPicks() {
  const keep = {};
  if ($('role').value) keep.roleKey = $('role').value;
  if ($('taskType').value) keep.taskTypeKey = $('taskType').value;
  if (Object.keys(keep).length) await chrome.storage.local.set(keep);
}
$('go').addEventListener('click', startChosen);

// ---- Role and task type ----
// Filled from Karbon's lists (cached, so they show without a Karbon tab) and preset the way Karbon's timer
// prefills them: by the firm's prefill mode, then by the work item you pick.
function setPicks(p) {
  picks = { roleKey: p.roleKey || null, taskTypeKey: p.taskTypeKey || null };
  selectKey($('role'), picks.roleKey);
  selectKey($('taskType'), picks.taskTypeKey);
}
const keepPicks = () => { picks = { roleKey: $('role').value || null, taskTypeKey: $('taskType').value || null }; };
$('role').addEventListener('change', keepPicks);
$('taskType').addEventListener('change', keepPicks);

// With no work item chosen yet.
async function prefillBlank() {
  const r = await send('prefill', { workKey: null });
  if (r && r.ok && r.result && !start.work.item && !picks) setPicks(r.result);
}

async function prefillWork(item) {
  const p = await workPrefill(item);
  if (p && start.work.item === item) setPicks(p);
}

async function loadLookups() {
  const d = await chrome.storage.local.get(['roleKey', 'taskTypeKey', 'lookups']);
  const paint = (lk) => {
    lists = lk || null;
    if (isActive(current)) renderDetails(current);
    fillSelect($('role'), (lk && lk.roles) || [], picks ? picks.roleKey : $('role').value || d.roleKey, 'role');
    fillSelect($('taskType'), (lk && lk.taskTypes) || [], picks ? picks.taskTypeKey : $('taskType').value || d.taskTypeKey, 'task type');
  };
  paint(d.lookups);
  if (!(await chrome.runtime.sendMessage({ type: 'canReach' }))) return;
  prefillBlank();
  const r = await send('lookups');
  if (!r || !r.ok || !r.result) return;
  const lk = {
    roles: r.result.roles.length ? r.result.roles : (d.lookups && d.lookups.roles) || [],
    taskTypes: r.result.taskTypes.length ? r.result.taskTypes : (d.lookups && d.lookups.taskTypes) || [],
  };
  await chrome.storage.local.set({ lookups: lk });
  paint(lk);
}

// ---- Preferences ----
// The panel keeps Work, Clients, and Auto-switch; everything else is on the settings page.
bindPrefs($('prefs'));

// Opening Preferences scrolls it to the top of the panel, so it's clear something happened.
$('prefsBox').addEventListener('toggle', () => {
  if (!$('prefsBox').open) return;
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('prefsBox').scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
});

$('signIn').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'signIn' });
  window.close();
});

// Signing in or out anywhere updates the open panel.
chrome.storage.onChanged.addListener((c, area) => {
  if (area === 'local' && c.signedIn) setSignedOut(c.signedIn.newValue === false);
});

$('guide').addEventListener('click', () => { chrome.tabs.create({ url: 'welcome.html#settings' }); window.close(); });
$('feedback').addEventListener('click', async () => { await openFeedback(); window.close(); });

// ---- Start ----
(async () => {
  signedOut = (await chrome.storage.local.get('signedIn')).signedIn === false;
  // A stopped timer still waiting for its details: show the finish form first, unless Karbon is signed out.
  if (!signedOut && await chrome.runtime.sendMessage({ type: 'getPending' })) {
    location.replace('complete.html?mode=popup');
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const m = tab && tab.url && tab.url.match(new RegExp(`^${KARBON.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}[^/]+/work/([A-Za-z0-9]+)`));
  if (m) here = { key: m[1], title: (tab.title || '').split(' | ')[0].replace(/ - [^-]+$/, '').trim() || 'This work item' };
  ({ timeCfg = null } = await chrome.storage.local.get('timeCfg'));
  buildFields();
  if (workOnly()) $('contactsSub').textContent = 'Your firm books time to work items only, so these timers start with no work item. You choose one when you stop.';
  render(await chrome.runtime.sendMessage({ type: 'getCached' }));
  refresh();
  if (signedOut) return;
  loadLookups();
})();
