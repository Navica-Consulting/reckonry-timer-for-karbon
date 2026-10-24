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
let chosen = null;       // the work item or contact picked in the Work field
let lists = null;        // role and task type lists: { roles, taskTypes }
let changingWork = false; // the running timer's work is being changed in the card

const send = (cmd, args) => chrome.runtime.sendMessage({ type: 'cmd', cmd, args });
const level = async () => (await chrome.storage.sync.get({ noteLevel: 'auto' })).noteLevel;
const noteFor = async (event, ctx) => KTNotes.note(event, await level(), ctx);
// A blank timer (no work item yet) still counts as running.
const isActive = (s) => !!(s && s.state && s.state !== 'Stopped');

// ---- Status line ----
// Actions open or reload Karbon on their own when they need a tab, so there is no fix-it link.
function say(text) {
  $('msg').textContent = text;
}

function sayError(r) {
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
  $('curNotesReq').hidden = !cfg.notesRequired;
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
    list.append(itemRow({ key: here.key, linkType: 'WorkItem', title: here.title }, { lead: 'This work item:', onStart: choose }));
  }
}

async function refresh() {
  const r = await send('getState');
  if (r && r.ok) return render(r.result);
  render(await chrome.runtime.sendMessage({ type: 'getCached' }));
  if (r && r.code !== 'UNREACHABLE') sayError(r);
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

// ---- Stop, swap, and discard ----
// Stop and Swap save the entry from the card. Required fields still empty bounce instead of opening a second form.
// Focus stays on the button: focusing the Work field would open its recents over the red outline.
const FIELD = { work: 'curQ', role: 'curRole', taskType: 'curTask', notes: 'curNotes' };
const NOUN = { role: 'a role', taskType: 'a task type', notes: 'a note' };

function missingHere() {
  const m = [];
  const cfg = timeCfg || {};
  if (!current.work) m.push('work');
  if (cfg.roleRequired && emptySel($('curRole'))) m.push('role');
  if (cfg.taskTypeRequired && emptySel($('curTask'))) m.push('taskType');
  return m;
}

function bounce(missing) {
  if (missing.includes('work') && current.work) { changingWork = true; renderDetails(current); }
  for (const k of missing) {
    const f = $(FIELD[k]);
    setInvalid(f, true);
    f.classList.remove('bounce');
    void f.offsetWidth; // restarts the animation on a second press
    f.classList.add('bounce');
    f.addEventListener('animationend', () => f.classList.remove('bounce'), { once: true });
  }
  const nouns = missing.map((k) => (k === 'work' ? (workOnly() ? 'a work item' : 'a work item or contact') : NOUN[k]));
  say(missing.includes('notes') ? 'Your firm requires a note on every time entry. Add one first.' : `Choose ${nouns.length > 1 ? `${nouns.slice(0, -1).join(', ')}${nouns.length > 2 ? ',' : ''} and ${nouns.at(-1)}` : nouns[0]} first.`);
}

// Saves the running timer, or bounces what's missing. Returns the save result, or null.
async function saveCurrent() {
  const missing = missingHere();
  if (missing.length) { bounce(missing); return null; }
  say('Working.');
  // Notes edited but not yet saved go on this entry.
  if (!(await saveNotes(true))) return null;
  const r = await send('stopAndSave', { note: await noteFor('manualStop'), interactive: true });
  if (!r || !r.ok) { sayError(r); return null; }
  if (r.result && r.result.needsCompletion) { bounce(r.result.missing); return null; }
  return r.result || {};
}

const savedText = (res) => (res.saved ? `Saved a ${res.minutes} minute entry.` : 'No timer to save.');

$('stop').addEventListener('click', async () => {
  const res = await saveCurrent();
  if (!res) return;
  say(savedText(res));
  refresh();
});

// Swap: save this timer, then start a blank one with your last-used role and task type.
$('swap').addEventListener('click', async () => {
  const res = await saveCurrent();
  if (!res) return;
  const d = await chrome.storage.local.get(['roleKey', 'taskTypeKey']);
  const r = await send('start', { workKey: null, linkType: null, roleKey: d.roleKey, taskTypeKey: d.taskTypeKey, note: await noteFor('manualStart'), interactive: true });
  if (!r || !r.ok) { refresh(); return sayError(r); }
  await refresh();
  say(`${savedText(res)} New timer started. Choose its work item.`);
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
  say('Working.');
  const r = await send('discard', {});
  if (!r || !r.ok) return sayError(r);
  await refresh();
  say('Timer discarded. Press play to start a new one.');
  $('go').focus();
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

// Notes save a moment after you stop typing, and when you leave the field.
async function saveNotes(quiet = false) {
  clearTimeout(notesTimer);
  notesTimer = null;
  const text = $('curNotes').value;
  if (!current || text === (current.description || '')) return true;
  const r = await send('edit', { description: text });
  if (!r || !r.ok) { sayError(r); return false; }
  current.description = text;
  if (!quiet) say('Notes saved.');
  return true;
}
$('curNotes').addEventListener('input', () => {
  clearTimeout(notesTimer);
  notesTimer = setTimeout(saveNotes, 800);
});
$('curNotes').addEventListener('change', () => saveNotes());

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
async function startChosen() {
  if (!isActive(current)) startNew(chosen);
}

async function startArgs(item) {
  const d = await chrome.storage.local.get(['roleKey', 'taskTypeKey']);
  return {
    workKey: item ? item.key : null, linkType: item ? item.linkType || 'WorkItem' : null,
    roleKey: $('role').value || d.roleKey, taskTypeKey: $('taskType').value || d.taskTypeKey,
    description: $('desc').value,
    note: await noteFor('manualStart'),
  };
}

async function startNew(item) {
  const args = await startArgs(item);
  say('Starting. If Karbon is closed, it opens in a background tab first.');
  const stopNote = await noteFor('manualStop');
  const r = await send('start', { ...args, stopNote, interactive: true });
  if (!r || !r.ok) return sayError(r);
  await rememberPicks();
  if (r.result && r.result.needsCompletion) {
    return toFinishForm({ note: stopNote, then: args, thenTitle: item ? item.title : null, missing: r.result.missing });
  }
  say(item ? `Timer started on ${item.title || 'the item'}.` : 'Timer started. Choose a work item when you stop.');
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
  if (!(await chrome.runtime.sendMessage({ type: 'canReach' }))) return;
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
  const reach = await chrome.runtime.sendMessage({ type: 'canReach' });
  if (!reach && !force) {
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
