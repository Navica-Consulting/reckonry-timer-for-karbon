const KARBON = KT_ORIGIN;
const ICON = {
  pause: 'M9 6v12M15 6v12',
  play: 'M8 5.5v13l10-6.5z',
  start: 'M9 6.5v11l9-5.5z',
  swap: 'M8 3L4 7l4 4M4 7h16M16 13l4 4-4 4M20 17H4',
};

let current = null;      // timer state
let here = null;         // the active tab, when it is a Karbon work item: { key, title }
let timeCfg = null;      // the firm's time settings: { workOnly, notesRequired }
let tick = null;
let chosen = null;       // the work item or contact picked in the Work field
let lists = null;        // role and task type lists: { roles, taskTypes }
let changingWork = false; // the running timer's work is being changed in the card

const send = (cmd, args) => chrome.runtime.sendMessage({ type: 'cmd', cmd, args });
const level = async () => (await chrome.storage.sync.get({ noteLevel: 'auto' })).noteLevel;
const noteFor = async (event, ctx) => KTNotes.note(event, await level(), ctx);
// A blank timer (no work item yet) still counts as running.
const isActive = (s) => !!(s && s.state && s.state !== 'Stopped');

// ---- Status line, with a fix-it link when Karbon is closed or not ready ----
function say(text, fix) {
  const msg = $('msg');
  msg.textContent = text;
  if (!fix) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'linklike';
  b.textContent = fix.label;
  b.addEventListener('click', fix.run);
  msg.append(' ', b);
}

function sayError(r) {
  if (r && r.code === 'NO_TAB') {
    return say('Karbon is not open.', { label: 'Open Karbon in a new tab', run: () => { chrome.tabs.create({ url: KARBON }); window.close(); } });
  }
  if (r && r.code === 'NOT_READY') {
    return say('The Karbon tab is not ready.', { label: 'Reload the Karbon tab', run: () => { chrome.tabs.reload(r.tabId); say('Reloading Karbon. Try again in a few seconds.'); } });
  }
  say((r && r.error) || 'Something went wrong.');
}

const workOnly = () => !!(timeCfg && timeCfg.workOnly);

function itemRow(item, { lead, onStart }) {
  const label = el('button', { type: 'button', class: 'item', onclick: () => onStart(item) },
    el('span', { class: 't' }, lead ? el('span', { class: 'lead' }, `${lead} `) : null, item.title || 'Untitled',
      TAGS[item.linkType] ? el('span', { class: 'tag' }, TAGS[item.linkType]) : null),
    item.subtitle ? el('span', { class: 's' }, item.subtitle) : null);
  label.setAttribute('aria-label', `${lead ? `${lead} ` : 'Choose '}${item.title || 'item'}${item.subtitle ? `, ${item.subtitle}` : ''}`);
  return el('li', {}, label);
}

// ---- Rendering the current timer ----
function render(s) {
  current = s;
  const act = isActive(s);
  const st = act ? s.state : 'Stopped';
  $('pill').textContent = !s ? 'Unknown' : st === 'Started' ? 'Running' : st === 'Paused' ? 'Paused' : 'No timer';
  $('pill').className = `pill ${st === 'Started' ? 'running' : st === 'Paused' ? 'paused' : ''}`;

  $('timer').hidden = !act;
  if (!act) $('swapAsk').hidden = true;
  if (act) {
    renderDetails(s);
    const resumeMode = st === 'Paused';
    $('toggleIcon').setAttribute('d', resumeMode ? ICON.play : ICON.pause);
    $('toggle').setAttribute('aria-label', resumeMode ? 'Resume timer' : 'Pause timer');
    $('toggle').title = resumeMode ? 'Resume timer' : 'Pause timer';
  }

  // The start panel is always shown; with a timer running it switches instead.
  const verb = act ? 'Switch timer' : 'Start timer';
  $('startHeading').textContent = verb;
  $('go').setAttribute('aria-label', verb);
  $('go').title = verb;
  // Two opposing arrows read as "swap", so a running timer does not look like a second start.
  $('go').classList.toggle('swap', !!act);
  $('goIcon').setAttribute('d', act ? ICON.swap : ICON.start);

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

// The running timer's work, role, and task type stay visible and editable.
// Anything Karbon needs before it will save the entry is outlined in red while it's missing.
function renderDetails(s) {
  // A contact timer has no work item, so the contact's name is the main line.
  const isWork = !s.linkType || s.linkType === 'WorkItem';
  const blank = !s.work;
  if (blank) changingWork = false;
  $('curChosen').hidden = blank || changingWork;
  $('curPicker').hidden = !blank && !changingWork;
  if (!blank) {
    $('work').textContent = isWork ? s.title || 'Open work item' : s.client || 'Open contact';
    if (!isWork && TAGS[s.linkType]) $('work').append(' ', el('span', { class: 'tag' }, TAGS[s.linkType]));
    $('work').title = isWork ? 'Open this work item in Karbon' : `Open this ${TAGS[s.linkType] || 'contact'} in Karbon`;
  }
  $('client').textContent = isWork ? s.client || '' : '';
  setInvalid($('curQ'), blank);

  const lk = lists || {};
  fillCurrent($('curRole'), lk.roles || [], s.roleKey, 'role');
  fillCurrent($('curTask'), lk.taskTypes || [], s.taskTypeKey, 'task type');
  const cfg = timeCfg || {};
  $('curRoleReq').hidden = !cfg.roleRequired;
  $('curTaskReq').hidden = !cfg.taskTypeRequired;
  setInvalid($('curRole'), !!cfg.roleRequired && emptySel($('curRole')));
  setInvalid($('curTask'), !!cfg.taskTypeRequired && emptySel($('curTask')));
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
    list.append(itemRow({ key: here.key, linkType: 'WorkItem', title: here.title }, { lead: 'This work item:', onStart: choose }));
  }
}

async function refresh() {
  const r = await send('getState');
  if (r && r.ok) return render(r.result);
  render(await chrome.runtime.sendMessage({ type: 'getCached' }));
  if (r && r.code !== 'NO_TAB') sayError(r);
}

async function run(cmd, args, done) {
  say('Working.');
  const r = await send(cmd, args);
  if (!r || !r.ok) { sayError(r); return false; }
  say(done(r.result));
  refresh();
  return true;
}

// ---- Timer actions ----
$('toggle').addEventListener('click', async () => {
  if (current && current.state === 'Paused') run('resume', { note: await noteFor('manualResume') }, () => 'Resumed.');
  else run('pause', { note: await noteFor('manualPause') }, () => 'Paused.');
});

// Hands off to the finish form, in this panel, when the timer needs details before it can be saved.
async function toFinishForm({ note, then = null, thenTitle = null, missing }) {
  await chrome.runtime.sendMessage({ type: 'promptFinish', ui: 'popup', reason: then ? 'switch' : 'stop', note, then, thenTitle, missing });
  location.href = 'complete.html?mode=popup';
}

$('stop').addEventListener('click', async () => {
  const note = await noteFor('manualStop');
  say('Working.');
  const r = await send('stopAndSave', { note, interactive: true });
  if (!r || !r.ok) return sayError(r);
  if (r.result && r.result.needsCompletion) return toFinishForm({ note, missing: r.result.missing });
  say(r.result && r.result.saved ? `Saved a ${r.result.minutes} minute entry.` : 'No timer to save.');
  refresh();
});

$('work').addEventListener('click', async () => {
  if (!current || !current.work) return;
  await chrome.runtime.sendMessage({ type: 'openWork', tenant: current.tenant, work: current.work, linkType: current.linkType });
  window.close();
});

// ---- Editing the running timer ----
async function editCurrent(args, done) {
  say('Working.');
  const r = await send('edit', args);
  if (!r || !r.ok) sayError(r);
  else say(done);
  refresh();
  return !!(r && r.ok);
}

$('curRole').addEventListener('change', () => editCurrent({ roleKey: $('curRole').value || null }, 'Role updated.'));
$('curTask').addEventListener('change', () => editCurrent({ taskTypeKey: $('curTask').value || null }, 'Task type updated.'));

async function setWork(item) {
  const ok = await editCurrent({ workKey: item.key, linkType: item.linkType || 'WorkItem' }, `Timer is now on ${item.title || 'the item'}.`);
  if (!ok) return;
  openDrop(BOX.cur, false);
  changingWork = false;
  $('curQ').value = '';
}

$('curChange').addEventListener('click', () => {
  changingWork = true;
  renderDetails(current);
  $('curQ').focus();
  loadRecents(false, BOX.cur);
});

// Escape backs out of changing a work item that is already set.
$('curQ').addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !current || !current.work) return;
  e.preventDefault();
  changingWork = false;
  renderDetails(current);
  $('curChange').focus();
});
$('curQ').addEventListener('focus', () => {
  if (!$('curQ').value.trim() && !$('curResults').children.length) loadRecents(false, BOX.cur);
});

$('noteRow').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('noteText').value.trim();
  if (!text) return;
  const ok = await run('appendNote', { text: await noteFor('quickNote', { text }) }, () => 'Note added.');
  if (ok) $('noteText').value = '';
});

// ---- Work field: pick an item, then press play (Karbon's order) ----
function choose(item) {
  chosen = item;
  $('chosenTitle').textContent = item.title || 'Untitled';
  if (TAGS[item.linkType]) $('chosenTitle').append(' ', el('span', { class: 'tag' }, TAGS[item.linkType]));
  $('chosenSub').textContent = item.subtitle || '';
  $('chosen').hidden = false;
  $('picker').hidden = true;
  openDrop(BOX.start, false);
  say(`${item.title || 'Item'} chosen. Check role and task type, then press play.`);
  $('role').focus();
}

function clearChoice() {
  chosen = null;
  $('chosen').hidden = true;
  $('picker').hidden = false;
  $('q').focus();
}
$('change').addEventListener('click', clearChoice);

// Work is optional: with nothing chosen, the timer starts blank and the details are asked for at stop.
// With a timer running, play first asks whether to save or discard it. Nothing needs to be chosen to switch.
async function startChosen() {
  const item = chosen;
  if (!isActive(current)) return startNew(item);
  if (item && current.work === item.key) return say('That item already has the timer.');
  askSwap(true);
}

function askSwap(on) {
  $('swapAsk').hidden = !on;
  if (on) $('swapSave').focus();
}

// The fields are read when you answer, so changes made while the question is open count.
async function startArgs(item) {
  const d = await chrome.storage.local.get(['roleKey', 'taskTypeKey']);
  return {
    workKey: item ? item.key : null, linkType: item ? item.linkType || 'WorkItem' : null,
    roleKey: $('role').value || d.roleKey, taskTypeKey: $('taskType').value || d.taskTypeKey,
    description: $('desc').value,
    note: await noteFor('manualStart'),
  };
}

async function swap(how) {
  askSwap(false);
  const item = chosen;
  if (!isActive(current)) return startNew(item);
  const args = await startArgs(item);
  say('Working.');
  if (how === 'save') {
    const note = await noteFor('manualStop');
    const r = await send('stopAndSave', { note, interactive: true });
    if (!r || !r.ok) return sayError(r);
    if (r.result && r.result.needsCompletion) {
      await rememberPicks();
      return toFinishForm({ note, then: args, thenTitle: item ? item.title : null, missing: r.result.missing });
    }
    return startNew(item, args, r.result && r.result.saved ? `Saved a ${r.result.minutes} minute entry. ` : '');
  }
  const r = await send('discard', {});
  if (!r || !r.ok) return sayError(r);
  return startNew(item, args, 'Timer discarded. ');
}

$('swapSave').addEventListener('click', () => swap('save'));
$('swapDiscard').addEventListener('click', () => swap('discard'));
$('swapCancel').addEventListener('click', () => { askSwap(false); say(''); $('go').focus(); });
$('swapAsk').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); $('swapCancel').click(); }
});

async function startNew(item, args, lead = '') {
  args = args || await startArgs(item);
  say('Starting. If Karbon is closed, it opens in a background tab first.');
  const stopNote = await noteFor('manualStop');
  const r = await send('start', { ...args, stopNote, interactive: true });
  if (!r || !r.ok) return sayError(r);
  await rememberPicks();
  if (r.result && r.result.needsCompletion) {
    return toFinishForm({ note: stopNote, then: args, thenTitle: item ? item.title : null, missing: r.result.missing });
  }
  say(lead + (item ? `Timer started on ${item.title || 'the item'}.` : 'Timer started. Choose a work item when you stop.'));
  $('desc').value = '';
  $('q').value = '';
  chosen = null;
  $('chosen').hidden = true;
  $('picker').hidden = false;
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
// Filled from Karbon's lists (cached, so they show without a Karbon tab) and preset to your last-used values.
async function loadLookups() {
  const d = await chrome.storage.local.get(['roleKey', 'taskTypeKey', 'lookups']);
  const paint = (lk) => {
    lists = lk || null;
    if (isActive(current)) renderDetails(current);
    fillSelect($('role'), (lk && lk.roles) || [], $('role').value || d.roleKey, 'role');
    fillSelect($('taskType'), (lk && lk.taskTypes) || [], $('taskType').value || d.taskTypeKey, 'task type');
  };
  paint(d.lookups);
  if (!(await chrome.runtime.sendMessage({ type: 'hasKarbonTab' }))) return;
  const r = await send('lookups');
  if (!r || !r.ok || !r.result) return;
  const lk = {
    roles: r.result.roles.length ? r.result.roles : (d.lookups && d.lookups.roles) || [],
    taskTypes: r.result.taskTypes.length ? r.result.taskTypes : (d.lookups && d.lookups.taskTypes) || [],
  };
  await chrome.storage.local.set({ lookups: lk });
  paint(lk);
}

// ---- Search and recents ----
// Two result lists: the start panel's Work field, and the running timer's.
const BOX = {
  start: { q: 'q', head: 'resultsHead', list: 'results', combo: 'combo', drop: 'drop', pick: (it) => choose(it), seq: 0, debounce: null },
  cur: { q: 'curQ', head: 'curResultsHead', list: 'curResults', combo: 'curCombo', drop: 'curDrop', pick: (it) => setWork(it), seq: 0, debounce: null },
};

// Each list floats under its field while focus is in the field or the list.
function openDrop(box, on) {
  $(box.drop).hidden = !on;
  $(box.q).setAttribute('aria-expanded', String(on));
}

function bindDrop(box) {
  const combo = $(box.combo);
  combo.addEventListener('focusin', () => openDrop(box, true));
  combo.addEventListener('focusout', (e) => { if (!combo.contains(e.relatedTarget)) openDrop(box, false); });
  // Keeps focus in the field on click, so the list doesn't close before the pick lands.
  $(box.drop).addEventListener('mousedown', (e) => e.preventDefault());
  combo.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;
    if (e.key === 'Escape' && !$(box.drop).hidden) { e.preventDefault(); $(box.q).focus(); openDrop(box, false); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const opts = [...$(box.drop).querySelectorAll('button')];
    if (!opts.length) return;
    e.preventDefault();
    openDrop(box, true);
    const i = opts.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') opts[Math.min(i + 1, opts.length - 1)].focus();
    else if (i <= 0) $(box.q).focus();
    else opts[i - 1].focus();
  });
}

function showResults(box, head, items) {
  $(box.head).textContent = head;
  $(box.list).replaceChildren(...items.map((it) => itemRow(it, { onStart: box.pick })));
}

async function loadRecents(force, box = BOX.start) {
  const hasTab = await chrome.runtime.sendMessage({ type: 'hasKarbonTab' });
  if (!hasTab && !force) {
    $(box.head).replaceChildren(el('button', { type: 'button', class: 'linklike', onclick: () => loadRecents(true, box) }, 'Show recent work items'));
    $(box.list).replaceChildren();
    return;
  }
  $(box.head).textContent = 'Loading recent work items.';
  const r = await send('recents', { take: 6 });
  if (!r || !r.ok) { $(box.head).textContent = ''; return sayError(r); }
  showResults(box, r.result.length ? 'Recent work items' : 'No recent work items.', r.result);
}

async function runSearch(term, box) {
  const mine = ++box.seq;
  $(box.head).textContent = 'Searching.';
  // One request at a time, so a closed Karbon is only opened once.
  const w = await send('search', { term, kind: 'work', take: 6 });
  if (mine !== box.seq) return;
  if (!w || !w.ok) { $(box.head).textContent = ''; return sayError(w); }
  // Work-only firms cannot book time to contacts, so contacts are left out of results.
  const c = workOnly() ? null : await send('search', { term, kind: 'contact', take: 4 });
  if (mine !== box.seq) return;
  const items = [...w.result, ...((c && c.ok && c.result) || [])];
  showResults(box, items.length ? `${items.length} result${items.length === 1 ? '' : 's'}` : 'No matches.', items);
}

for (const box of Object.values(BOX)) {
  bindDrop(box);
  $(box.q).addEventListener('input', () => {
    openDrop(box, true);
    clearTimeout(box.debounce);
    const term = $(box.q).value.trim();
    if (term.length < 2) { box.seq++; box.debounce = setTimeout(() => loadRecents(false, box), 200); return; }
    box.debounce = setTimeout(() => runSearch(term, box), 350);
  });
}

// ---- Preferences ----
// The panel keeps Work, Clients, and Auto-switch; everything else is on the settings page.
bindPrefs($('prefs'), (keys, s, local) => { if (local) say('Preference saved.'); });

// Opening Preferences scrolls it to the top of the panel, so it's clear something happened.
$('prefsBox').addEventListener('toggle', () => {
  if (!$('prefsBox').open) return;
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('prefsBox').scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
});

$('guide').addEventListener('click', () => { chrome.tabs.create({ url: 'welcome.html#settings' }); window.close(); });
$('feedback').addEventListener('click', async () => { await openFeedback(); window.close(); });

// ---- Start ----
(async () => {
  // A stopped timer still waiting for its details: show the finish form first.
  if (await chrome.runtime.sendMessage({ type: 'getPending' })) {
    location.replace('complete.html?mode=popup');
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const m = tab && tab.url && tab.url.match(new RegExp(`^${KARBON.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}[^/]+/work/([A-Za-z0-9]+)`));
  if (m) here = { key: m[1], title: (tab.title || '').split(' | ')[0].replace(/ - [^-]+$/, '').trim() || 'This work item' };
  ({ timeCfg = null } = await chrome.storage.local.get('timeCfg'));
  if (workOnly()) {
    $('q').placeholder = 'Search work items';
    $('curQ').placeholder = 'Search work items';
    $('curWorkLabel').textContent = 'Work';
  }
  if (workOnly()) $('contactsSub').textContent = 'Your firm books time to work items only, so these timers start with no work item. You choose one when you stop.';
  render(await chrome.runtime.sendMessage({ type: 'getCached' }));
  refresh();
  loadRecents(false);
  loadLookups();
})();
