const DEFAULTS = {
  autoStartWork: true, workStartSeconds: 1, autoStartContacts: false, contactStartSeconds: 5,
  remindContacts: true, contactNudgeSeconds: 60,
  autoSwitch: true, autoSwitchContacts: false, switchSeconds: 1, remindNoTimer: false, nudgeSeconds: 60,
  pauseOnLock: true, idlePause: false, idleMinutes: 10, autoResume: true,
  longTimerAlert: true, longTimerHours: 3, showIdleBadge: true, badgeWhere: 'everywhere', splitAtMidnight: true,
  noteLevel: 'auto', debugLog: false, toolbarTheme: 'dark',
};
const KARBON = KT_ORIGIN;
// Interim feedback address until a permanent one is chosen.
const FEEDBACK_EMAIL = 'max@navicaconsulting.com';
const ICON = {
  pause: 'M9 6v12M15 6v12',
  play: 'M8 5.5v13l10-6.5z',
};

let current = null;      // timer state
let here = null;         // the active tab, when it is a Karbon work item: { key, title }
let timeCfg = null;      // the firm's time settings: { workOnly, notesRequired }
let tick = null;
let chosen = null;       // the work item or contact picked in the Work field

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
  if (act) {
    // A contact timer has no work item, so the contact's name is the main line.
    const isWork = !s.linkType || s.linkType === 'WorkItem';
    const blank = !s.work;
    $('work').hidden = blank;
    $('blankWork').hidden = !blank;
    if (!blank) {
      $('work').textContent = isWork ? s.title || 'Open work item' : s.client || 'Open contact';
      if (!isWork && TAGS[s.linkType]) $('work').append(' ', el('span', { class: 'tag' }, TAGS[s.linkType]));
      $('work').title = isWork ? 'Open this work item in Karbon' : `Open this ${TAGS[s.linkType] || 'contact'} in Karbon`;
    }
    $('client').textContent = blank ? 'You will choose a work item when you stop.' : isWork ? s.client || '' : '';
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
    $('timer').setAttribute('aria-label', `Timer ${st === 'Paused' ? 'paused' : 'running'}, ${spoken(secs)}, ${s.work ? `on ${s.title || s.client || 'a work item'}` : 'no work item yet'}`);
  };
  draw();
  if (st === 'Started') tick = setInterval(draw, 1000);
  renderQuick();
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
  const item = chosen;
  if (isActive(current) && (current.work || null) === (item ? item.key : null)) {
    return say(item ? 'That item already has the timer.' : 'A timer with no work item is already running.');
  }
  const d = await chrome.storage.local.get(['roleKey', 'taskTypeKey']);
  say('Starting. If Karbon is closed, it opens in a background tab first.');
  const args = {
    workKey: item ? item.key : null, linkType: item ? item.linkType || 'WorkItem' : null,
    roleKey: $('role').value || d.roleKey, taskTypeKey: $('taskType').value || d.taskTypeKey,
    description: $('desc').value,
    note: await noteFor('manualStart'),
  };
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
// Each "no timer running" choice is one radio group stored as two switches: auto-start and remind.
const MODES = {
  startMode: ['autoStartWork', 'remindNoTimer'],
  contactMode: ['autoStartContacts', 'remindContacts'],
};
const modeOf = (s, name) => { const [a, r] = MODES[name]; return s[a] ? 'auto' : s[r] ? 'nudge' : 'none'; };

(async () => {
  const s = await chrome.storage.sync.get(DEFAULTS);
  const form = $('prefs');
  for (const f of form.elements) {
    if (f.name in MODES) { f.checked = f.value === modeOf(s, f.name); continue; }
    if (!(f.name in s)) continue;
    if (f.type === 'radio') f.checked = f.value === s[f.name];
    else if (f.type === 'checkbox') f.checked = !!s[f.name];
    else f.value = s[f.name];
  }
  form.addEventListener('change', (e) => {
    const f = e.target;
    let v;
    if (f.name in MODES) {
      const [a, r] = MODES[f.name];
      chrome.storage.sync.set({ [a]: f.value === 'auto', [r]: f.value === 'nudge' });
    } else {
      if (f.type === 'checkbox') v = f.checked;
      else if (f.type === 'number') v = Math.max(Number(f.min) || 0, Number.isFinite(Number(f.value)) && f.value !== '' ? Number(f.value) : DEFAULTS[f.name]);
      else v = f.value;
      chrome.storage.sync.set({ [f.name]: v });
    }
    say('Preference saved.');
    updateDeps();
  });
  updateDeps();
})();

// Dim and disable settings that only matter when another one is on.
function updateDeps() {
  const f = $('prefs').elements;
  const on = {
    modeAuto: f.startMode.value === 'auto',
    modeNudge: f.startMode.value === 'nudge',
    contactAuto: f.contactMode.value === 'auto',
    contactNudge: f.contactMode.value === 'nudge',
    autoSwitch: f.autoSwitch.checked || f.autoSwitchContacts.checked,
    idlePause: f.idlePause.checked,
    anyPause: f.pauseOnLock.checked || f.idlePause.checked,
    longTimer: f.longTimerAlert.checked,
    badge: f.badgeWhere.value !== 'never',
  };
  // A nested row is live only when its own condition and every enclosing area's condition are on.
  for (const row of document.querySelectorAll('#prefs [data-when]')) {
    let live = true;
    for (let n = row; n && n.id !== 'prefs'; n = n.parentElement) {
      if (n.dataset && n.dataset.when && !on[n.dataset.when]) live = false;
    }
    row.classList.toggle('off', !live);
    for (const input of row.querySelectorAll('input, select')) {
      // Leave inputs to their own row when that row has a condition of its own.
      const owner = input.closest('[data-when]');
      if (owner === row) input.disabled = !live;
    }
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
    `No timer, work items: ${modeOf(s, 'startMode')} (start ${s.workStartSeconds}s, remind ${s.nudgeSeconds}s)`,
    `No timer, contacts: ${modeOf(s, 'contactMode')} (start ${s.contactStartSeconds}s, remind ${s.contactNudgeSeconds}s)`,
    `Auto-switch: work ${s.autoSwitch ? 'on' : 'off'}, contacts ${s.autoSwitchContacts ? 'on' : 'off'} (${s.switchSeconds}s)`, `Long-timer alert: ${s.longTimerAlert ? `${s.longTimerHours}h` : 'off'}`,
    `Badge: ${s.badgeWhere}`, `Notes level: ${s.noteLevel}`,
    `Settings on: ${on}`, `Work items only: ${workOnly() ? 'yes' : 'no'}`,
  ].join('\n');
  const url = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(`Reckonry Timer for Karbon feedback (v${v})`)}&body=${encodeURIComponent(body)}`;
  chrome.tabs.create({ url });
  window.close();
});

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
  }
  if (workOnly()) $('contactsSub').textContent = 'Your firm books time to work items only, so these timers start with no work item. You choose one when you stop.';
  updateDeps();
  render(await chrome.runtime.sendMessage({ type: 'getCached' }));
  refresh();
  loadRecents(false);
  loadLookups();
})();

// ---- Troubleshooting: can the background reach Karbon without a tab? ----
async function showConnCheck() {
  const el = $('connCheck');
  if (!el) return;
  const k = await chrome.storage.local.get(['signedIn', 'directApi', 'firmName', 'cookieNote', 'keySource']);
  const d = k.directApi;
  if (k.signedIn === false) el.textContent = `Connection: not signed in to Karbon in this browser${k.cookieNote ? ` (${k.cookieNote})` : ''}.`;
  else if (!d) el.textContent = 'Connection: not checked yet.';
  else if (d.ok) el.textContent = `Connection: works without a Karbon tab${k.firmName ? ` (${k.firmName})` : ''}.${k.keySource === 'tab' ? ` Account read from a Karbon tab${k.cookieNote ? `; cookie: ${k.cookieNote}` : ''}.` : ''}`;
  else el.textContent = `Connection: needs a Karbon tab (status ${d.status || 'none'}${d.error ? `, ${d.error}` : ''}).`;
}
showConnCheck();
