const DEFAULTS = {
  autoStartWork: true, workStartSeconds: 2, autoStartContacts: false, contactStartSeconds: 8,
  autoSwitch: false, remindNoTimer: false, nudgeSeconds: 60,
  pauseOnLock: true, idlePause: false, idleMinutes: 10, autoResume: false,
  longTimerHours: 3, showIdleBadge: true, badgeWhere: 'away', splitAtMidnight: true,
  noteLevel: 'auto', debugLog: false,
};
const KARBON = KT_ORIGIN;
// Interim feedback address until a permanent one is chosen.
const FEEDBACK_EMAIL = 'max@navicaconsulting.com';
const ICON = {
  pause: 'M9 6v12M15 6v12',
  play: 'M8 5.5v13l10-6.5z',
  star: 'M12 4.5l2.3 4.7 5.2.8-3.8 3.6.9 5.2L12 16.4l-4.6 2.4.9-5.2-3.8-3.6 5.2-.8z',
};

const $ = (id) => document.getElementById(id);
let current = null;      // timer state
let here = null;         // the active tab, when it is a Karbon work item: { key, title }
let defaultWork = null;  // { key, linkType, title, subtitle }
let timeCfg = null;      // the firm's time settings: { workOnly, notesRequired }
let tick = null;
let chosen = null;       // the work item or contact picked in the Work field

const send = (cmd, args) => chrome.runtime.sendMessage({ type: 'cmd', cmd, args });
const level = async () => (await chrome.storage.sync.get({ noteLevel: 'auto' })).noteLevel;
const noteFor = async (event, ctx) => KTNotes.note(event, await level(), ctx);
const isActive = (s) => !!(s && s.work && s.state !== 'Stopped');

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

// ---- Small DOM helpers ----
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  n.append(...kids.filter((k) => k != null));
  return n;
}

function iconButton(label, path, onclick) {
  const b = el('button', { type: 'button', class: 'icon small', 'aria-label': label, title: label, onclick });
  b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
  return b;
}

const TAGS = { Contact: 'contact', Organization: 'organization', ClientGroup: 'client group' };
const workOnly = () => !!(timeCfg && timeCfg.workOnly);

function itemRow(item, { lead, onStart, allowDefault = true }) {
  const label = el('button', { type: 'button', class: 'item', onclick: () => onStart(item) },
    el('span', { class: 't' }, lead ? el('span', { class: 'lead' }, `${lead} `) : null, item.title || 'Untitled',
      TAGS[item.linkType] ? el('span', { class: 'tag' }, TAGS[item.linkType]) : null),
    item.subtitle ? el('span', { class: 's' }, item.subtitle) : null);
  label.setAttribute('aria-label', `${lead ? `${lead} ` : 'Choose '}${item.title || 'item'}${item.subtitle ? `, ${item.subtitle}` : ''}`);
  const star = allowDefault && (!defaultWork || defaultWork.key !== item.key) && !(workOnly() && item.linkType !== 'WorkItem')
    ? iconButton(`Make ${item.title || 'this'} my default work item`, ICON.star, () => setDefault(item))
    : null;
  return el('li', {}, label, star);
}

// ---- Rendering the current timer ----
function elapsedSeconds(s) {
  let secs = s.recordedSeconds || 0;
  if (s.state === 'Started' && s.startDateTime) secs += Math.max(0, (Date.now() - Date.parse(s.startDateTime)) / 1000);
  return Math.floor(secs);
}
const hms = (t) => [Math.floor(t / 3600), Math.floor((t % 3600) / 60), t % 60].map((n) => String(n).padStart(2, '0')).join(':');
const spoken = (t) => {
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60);
  return h ? `${h} hours ${m} minutes` : `${m} minutes`;
};

function render(s) {
  current = s;
  const act = isActive(s);
  const st = act ? s.state : 'Stopped';
  $('pill').textContent = !s ? 'Unknown' : st === 'Started' ? 'Running' : st === 'Paused' ? 'Paused' : 'No timer';
  $('pill').className = `pill ${st === 'Started' ? 'running' : st === 'Paused' ? 'paused' : ''}`;

  $('timer').hidden = !act;
  if (act) {
    // A contact timer has no work item, so the contact's name is the main line.
    const isWork = !s.linkType || s.linkType === 'WorkItem';
    $('work').textContent = isWork ? s.title || 'Open work item' : s.client || 'Open contact';
    if (!isWork && TAGS[s.linkType]) $('work').append(' ', el('span', { class: 'tag' }, TAGS[s.linkType]));
    $('work').title = isWork ? 'Open this work item in Karbon' : `Open this ${TAGS[s.linkType] || 'contact'} in Karbon`;
    $('client').textContent = isWork ? s.client || '' : '';
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

  clearInterval(tick);
  const draw = () => {
    if (!act) return;
    const secs = elapsedSeconds(s);
    $('elapsed').textContent = hms(secs);
    $('timer').setAttribute('aria-label', `Timer ${st === 'Paused' ? 'paused' : 'running'}, ${spoken(secs)}, on ${s.title || s.client || 'a work item'}`);
  };
  draw();
  if (st === 'Started') tick = setInterval(draw, 1000);
  renderQuick();
}

// "This work item" and your default, as one-click starts.
function renderQuick() {
  const list = $('quickList');
  list.replaceChildren();
  const running = isActive(current) ? current.work : null;
  if (here && here.key !== running) {
    list.append(itemRow({ key: here.key, linkType: 'WorkItem', title: here.title }, { lead: 'This work item:', onStart: choose }));
  }
  if (defaultWork && defaultWork.key !== running && (!here || here.key !== defaultWork.key)) {
    list.append(itemRow(defaultWork, { lead: 'Default:', onStart: choose, allowDefault: false }));
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

$('stop').addEventListener('click', async () =>
  run('stopAndSave', { note: await noteFor('manualStop') }, (r) => (r && r.saved ? `Saved a ${r.minutes} minute entry.` : 'No timer to save.')));

$('work').addEventListener('click', async () => {
  if (!current) return;
  await chrome.runtime.sendMessage({ type: 'openWork', tenant: current.tenant, work: current.work, linkType: current.linkType });
  window.close();
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
  say(`${item.title || 'Item'} chosen. Check role and task type, then start.`);
  $('role').focus();
}

function clearChoice() {
  chosen = null;
  $('chosen').hidden = true;
  $('picker').hidden = false;
  $('q').focus();
}
$('change').addEventListener('click', clearChoice);

async function startChosen() {
  const item = chosen;
  if (!item) { say('Choose a work item first.'); $('q').focus(); return; }
  if (isActive(current) && current.work === item.key) return say('That item already has the timer.');
  const d = await chrome.storage.local.get(['roleKey', 'taskTypeKey']);
  say('Starting. If Karbon is closed, it opens in a background tab first.');
  const ok = await run('start', {
    workKey: item.key, linkType: item.linkType || 'WorkItem',
    roleKey: $('role').value || d.roleKey, taskTypeKey: $('taskType').value || d.taskTypeKey,
    description: $('desc').value,
    note: await noteFor('manualStart'), stopNote: await noteFor('manualStop'),
  }, () => `Timer started on ${item.title || 'the item'}.`);
  if (ok) {
    // Remember the picks as last used. Karbon reports a "None" role as no key, so the timer alone can't tell us.
    const keep = {};
    if ($('role').value) keep.roleKey = $('role').value;
    if ($('taskType').value) keep.taskTypeKey = $('taskType').value;
    await chrome.storage.local.set(keep);
    $('desc').value = '';
    $('q').value = '';
    chosen = null;
    $('chosen').hidden = true;
    $('picker').hidden = false;
  }
}
$('go').addEventListener('click', startChosen);

// ---- Role and task type ----
// Filled from Karbon's lists (cached, so they show without a Karbon tab) and preset to your last-used values.
function fillSelect(sel, list, selectedKey, noun) {
  const opts = list.slice();
  if (selectedKey && !opts.some((o) => o.key === selectedKey)) opts.unshift({ key: selectedKey, name: `Last used ${noun}` });
  if (!opts.length) opts.push({ key: '', name: `Start one timer in Karbon first to set a ${noun}` });
  sel.replaceChildren(...opts.map((o) => el('option', { value: o.key }, o.name)));
  // Last-used value first; otherwise Karbon's own default for the firm.
  const fallback = opts.find((o) => o.isDefault) || opts[0];
  sel.value = selectedKey && opts.some((o) => o.key === selectedKey) ? selectedKey : fallback.key;
}

async function loadLookups() {
  const d = await chrome.storage.local.get(['roleKey', 'taskTypeKey', 'lookups']);
  const paint = (lk) => {
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

// ---- Default work item ----
async function setDefault(item) {
  defaultWork = { key: item.key, linkType: item.linkType || 'WorkItem', title: item.title, subtitle: item.subtitle || '' };
  await chrome.storage.local.set({ defaultWork });
  say(`${item.title || 'Item'} is now your default.`);
  renderQuick();
  renderDefaultInfo();
}

function renderDefaultInfo() {
  const p = $('defaultInfo');
  p.replaceChildren();
  if (!defaultWork) {
    p.append('None set. Use the star next to any item to make it your default for quick starts.');
    return;
  }
  p.append(`${defaultWork.title || 'Untitled'}. `, el('button', {
    type: 'button', class: 'linklike',
    onclick: async () => { defaultWork = null; await chrome.storage.local.remove('defaultWork'); renderQuick(); renderDefaultInfo(); },
  }, 'Clear default'));
}

// ---- Search and recents ----
let searchSeq = 0;
function showResults(head, items) {
  $('resultsHead').textContent = head;
  $('results').replaceChildren(...items.map((it) => itemRow(it, { onStart: choose })));
}

async function loadRecents(force) {
  const hasTab = await chrome.runtime.sendMessage({ type: 'hasKarbonTab' });
  if (!hasTab && !force) {
    $('resultsHead').replaceChildren(el('button', { type: 'button', class: 'linklike', onclick: () => loadRecents(true) }, 'Show recent work items'));
    $('results').replaceChildren();
    return;
  }
  $('resultsHead').textContent = 'Loading recent work items.';
  const r = await send('recents', { take: 6 });
  if (!r || !r.ok) { $('resultsHead').textContent = ''; return sayError(r); }
  showResults(r.result.length ? 'Recent work items' : 'No recent work items.', r.result);
}

async function runSearch(term) {
  const mine = ++searchSeq;
  $('resultsHead').textContent = 'Searching.';
  // One request at a time, so a closed Karbon is only opened once.
  const w = await send('search', { term, kind: 'work', take: 6 });
  if (mine !== searchSeq) return;
  if (!w || !w.ok) { $('resultsHead').textContent = ''; return sayError(w); }
  // Work-only firms cannot book time to contacts, so contacts are left out of results.
  const c = workOnly() ? null : await send('search', { term, kind: 'contact', take: 4 });
  if (mine !== searchSeq) return;
  const items = [...w.result, ...((c && c.ok && c.result) || [])];
  showResults(items.length ? `${items.length} result${items.length === 1 ? '' : 's'}` : 'No matches.', items);
}

let debounce = null;
$('q').addEventListener('input', () => {
  clearTimeout(debounce);
  const term = $('q').value.trim();
  if (term.length < 2) { searchSeq++; debounce = setTimeout(() => loadRecents(false), 200); return; }
  debounce = setTimeout(() => runSearch(term), 350);
});

// ---- Preferences ----
(async () => {
  const s = await chrome.storage.sync.get(DEFAULTS);
  const form = $('prefs');
  for (const f of form.elements) {
    if (!(f.name in s)) continue;
    if (f.type === 'checkbox') f.checked = !!s[f.name];
    else f.value = s[f.name];
  }
  form.addEventListener('change', (e) => {
    const f = e.target;
    let v;
    if (f.type === 'checkbox') v = f.checked;
    else if (f.type === 'number') v = Math.max(Number(f.min) || 0, Number.isFinite(Number(f.value)) && f.value !== '' ? Number(f.value) : DEFAULTS[f.name]);
    else v = f.value;
    chrome.storage.sync.set({ [f.name]: v });
    say('Preference saved.');
    updateDeps();
  });
  updateDeps();
})();

// Dim and disable settings that only matter when another one is on.
function updateDeps() {
  const f = $('prefs').elements;
  const on = {
    workWait: f.autoStartWork.checked || f.autoSwitch.checked,
    contacts: !workOnly(),
    contactWait: !workOnly() && f.autoStartContacts.checked,
    remind: !f.autoStartWork.checked,
    nudge: !f.autoStartWork.checked && f.remindNoTimer.checked,
    idlePause: f.idlePause.checked,
    anyPause: f.pauseOnLock.checked || f.idlePause.checked,
    badge: f.badgeWhere.value !== 'never',
  };
  for (const row of document.querySelectorAll('#prefs [data-when]')) {
    const live = !!on[row.dataset.when];
    row.classList.toggle('off', !live);
    for (const input of row.querySelectorAll('input, select')) input.disabled = !live;
  }
}

// Opening Preferences scrolls it to the top of the panel, so it's clear something happened.
$('prefsBox').addEventListener('toggle', () => {
  if (!$('prefsBox').open) return;
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('prefsBox').scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
});

// chrome:// pages can't be opened from a plain link in an extension, only through the tabs API.
$('shortcuts').addEventListener('click', () => { chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }); window.close(); });

$('guide').addEventListener('click', () => { chrome.tabs.create({ url: 'welcome.html' }); window.close(); });

// Feedback: a prefilled email with the version and on/off settings only, never client or work data.
$('feedback').addEventListener('click', async () => {
  const s = await chrome.storage.sync.get(DEFAULTS);
  const v = chrome.runtime.getManifest().version;
  const chromeVer = (navigator.userAgent.match(/Chrome\/([\d.]+)/) || [])[1] || 'unknown';
  const on = Object.entries(s).filter(([, x]) => x === true).map(([k]) => k).join(', ') || 'none';
  const body = [
    'What happened, or what would you like to see?', '', '', '',
    '---',
    `Version: ${v}`, `Chrome: ${chromeVer}`,
    `Auto-start: work ${s.autoStartWork ? `${s.workStartSeconds}s` : 'off'}, contacts ${s.autoStartContacts ? `${s.contactStartSeconds}s` : 'off'}`, `Badge: ${s.badgeWhere}`, `Notes level: ${s.noteLevel}`,
    `Settings on: ${on}`, `Work items only: ${workOnly() ? 'yes' : 'no'}`,
  ].join('\n');
  const url = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(`Reckonry Timer for Karbon feedback (v${v})`)}&body=${encodeURIComponent(body)}`;
  chrome.tabs.create({ url });
  window.close();
});

// ---- Start ----
(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const m = tab && tab.url && tab.url.match(new RegExp(`^${KARBON.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}[^/]+/work/([A-Za-z0-9]+)`));
  if (m) here = { key: m[1], title: (tab.title || '').split(' | ')[0].replace(/ - [^-]+$/, '').trim() || 'This work item' };
  ({ defaultWork = null, timeCfg = null } = await chrome.storage.local.get(['defaultWork', 'timeCfg']));
  if (workOnly()) {
    $('q').placeholder = 'Search work items';
    if (defaultWork && defaultWork.linkType !== 'WorkItem') defaultWork = null; // a contact default can't be used here
  }
  if (workOnly()) $('contactsSub').textContent = 'Your firm books time to work items only';
  updateDeps();
  renderDefaultInfo();
  render(await chrome.runtime.sendMessage({ type: 'getCached' }));
  refresh();
  loadRecents(false);
  loadLookups();
})();
