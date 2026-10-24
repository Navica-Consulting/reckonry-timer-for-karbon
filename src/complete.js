// Finish form: collects what a timer needs before Karbon will save it (a work item or contact, plus a role,
// task type, or note when the firm requires them). Opens in the toolbar panel (mode=popup), which the
// background also opens after an automatic switch; a small window (mode=window) is the fallback.
const MODE = new URLSearchParams(location.search).get('mode') === 'window' ? 'window' : 'popup';
const send = (cmd, args) => chrome.runtime.sendMessage({ type: 'cmd', cmd, args });

let state = null;    // the paused timer
let pending = null;  // { note, then, thenTitle, missing, reason }
let cfg = null;      // the firm's time settings
const F = {};        // the Client and Work fields. The entry goes to Work's item, or else Client's.
let discardArmed = false;

const NOUN = { work: 'a work item or client', role: 'a role', taskType: 'a task type', notes: 'a note' };
const workOnly = () => !!(cfg && cfg.workOnly);
// The timer's own item, when it's a work item rather than a client.
const isWork = (linkType) => !linkType || linkType === 'WorkItem';
const onWorkItem = () => !!(state && state.work) && isWork(state.linkType);
const onClient = () => !!(state && state.work) && !onWorkItem();
// A client only counts where the firm allows time on clients.
const hasWork = () => !!F.work.item || (!!F.client.item && !workOnly());

function say(text) { $('msg').textContent = text; }

function done(delay = 1400) {
  setTimeout(() => {
    if (MODE === 'window') window.close();
    else location.href = 'popup.html';
  }, delay);
}

// ---- Errors, announced and linked to their fields ----
const FIELDS = { work: 'workQ', role: 'role', taskType: 'taskType', notes: 'desc' };
function clearErrors() {
  for (const [k, id] of Object.entries(FIELDS)) {
    $(`${k}Err`).hidden = true;
    $(id).removeAttribute('aria-invalid');
  }
}
function showErrors(missing) {
  clearErrors();
  for (const k of missing) {
    $(`${k}Err`).textContent = `Choose ${NOUN[k]}.`;
    if (k === 'notes') $(`${k}Err`).textContent = 'Your firm requires a note on every time entry.';
    $(`${k}Err`).hidden = false;
    $(FIELDS[k]).setAttribute('aria-invalid', 'true');
  }
  const first = missing[0];
  if (first) {
    if (first === 'work' && F.work.item) F.work.edit();
    $(FIELDS[first]).focus();
  }
  say(`Missing: ${missing.map((k) => NOUN[k]).join(', ')}.`);
}

// ---- Client and Work ----
// Client scopes Work to its own work, so switching or clearing it clears Work.
// Work picked with no client fills in the work item's client.
function pickWork(item) {
  if (!workOnly() && !F.client.item) fillClient(F.client, item.client);
  picked(item);
}
function pickClient(item) {
  F.work.show(null, true);
  picked(item);
}
function picked(item) {
  $('workErr').hidden = true;
  markMissing();
  say(`${item.title || 'Item'} chosen.`);
  $('role').focus();
}
function cleared() {
  markMissing();
  say('');
}

function buildFields() {
  const both = !workOnly() || onClient();
  F.client = pickField($('clientField'), { id: 'client', label: 'Client', kind: 'contact', describedBy: 'workErr',
    onPick: pickClient, onClear: () => { F.work.show(null, true); cleared(); } });
  F.work = pickField($('workField'), { id: 'work', label: 'Work', kind: 'work', describedBy: 'workErr',
    scope: () => (!workOnly() && F.client.item ? F.client.item.title : null), onPick: pickWork, onClear: cleared });
  $('clientField').hidden = !both;
}

// ---- Role and task type ----
async function loadLookups() {
  const d = await chrome.storage.local.get(['roleKey', 'taskTypeKey', 'lookups']);
  const role = (state && state.roleKey) || d.roleKey;
  const task = (state && state.taskTypeKey) || d.taskTypeKey;
  const paint = (lk) => {
    fillSelect($('role'), (lk && lk.roles) || [], $('role').value || role, 'role');
    fillSelect($('taskType'), (lk && lk.taskTypes) || [], $('taskType').value || task, 'task type');
  };
  paint(d.lookups);
  const r = await send('lookups');
  if (!r || !r.ok || !r.result) return;
  const lk = {
    roles: r.result.roles.length ? r.result.roles : (d.lookups && d.lookups.roles) || [],
    taskTypes: r.result.taskTypes.length ? r.result.taskTypes : (d.lookups && d.lookups.taskTypes) || [],
  };
  await chrome.storage.local.set({ lookups: lk });
  paint(lk);
}

// ---- Save, keep paused, discard ----
function missingHere() {
  const m = [];
  if (!hasWork()) m.push('work');
  if (cfg && cfg.roleRequired && emptySel($('role'))) m.push('role');
  if (cfg && cfg.taskTypeRequired && emptySel($('taskType'))) m.push('taskType');
  if (cfg && cfg.notesRequired && !$('desc').value.trim()) m.push('notes');
  return m;
}

// Like the panel's timer card: required fields still empty keep a red outline until filled.
// Error text only appears after a save attempt.
function markMissing() {
  const m = missingHere();
  for (const [k, id] of Object.entries(FIELDS)) {
    if (m.includes(k)) $(id).setAttribute('aria-invalid', 'true');
    else { $(id).removeAttribute('aria-invalid'); $(`${k}Err`).hidden = true; }
  }
  // Either field satisfies Karbon where clients can take time, so both go red together.
  F.client.invalid(m.includes('work') && !workOnly());
}
$('role').addEventListener('change', markMissing);
$('taskType').addEventListener('change', markMissing);
$('desc').addEventListener('input', markMissing);

$('finish').addEventListener('submit', async (e) => {
  e.preventDefault();
  const missing = missingHere();
  if (missing.length) return showErrors(missing);
  clearErrors();
  const fill = { roleKey: $('role').value || null, taskTypeKey: $('taskType').value || null, description: $('desc').value };
  // The work item, or else the client, which may need its key looked up by name.
  const c = F.client.item;
  const target = F.work.item || await keyedClient(c);
  if (!target) return say(`Couldn't find ${c.title} in Karbon. Search for the client in Client.`);
  Object.assign(fill, { workKey: target.key, linkType: target.linkType || (F.work.item ? 'WorkItem' : 'Contact') });
  $('save').disabled = true;
  say('Saving.');
  const r = await chrome.runtime.sendMessage({ type: 'finishTimer', fill });
  $('save').disabled = false;
  if (!r || !r.ok) return say((r && r.error) || 'Something went wrong. The timer is still paused.');
  if (r.result && r.result.needsCompletion) return showErrors(r.result.missing);
  // Remember the picks as last used.
  const keep = {};
  if ($('role').value) keep.roleKey = $('role').value;
  if ($('taskType').value) keep.taskTypeKey = $('taskType').value;
  await chrome.storage.local.set(keep);
  const saved = `Saved a ${r.result.minutes} minute entry.`;
  const st = r.result.started;
  if (st && !st.ok) {
    say(`${saved} The new timer did not start: ${st.error || 'unknown error'}`);
    return done(4000);
  }
  say(st ? `${saved} Timer switched${pending && pending.thenTitle ? ` to ${pending.thenTitle}` : ''}.` : saved);
  done();
});

$('keep').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'cancelFinish' });
  say('The timer stays paused. Nothing was saved.');
  done(900);
});

// Two presses, so a stray click can't throw time away.
$('discard').addEventListener('click', async () => {
  if (!discardArmed) {
    discardArmed = true;
    const mins = state ? Math.max(1, Math.ceil(elapsedSeconds(state) / 60)) : 0;
    $('discard').setAttribute('aria-label', `Press again to discard ${mins} minutes`);
    $('discard').title = `Press again to discard ${mins} minutes`;
    $('discard').classList.add('armed');
    say(`Press the trash button again to throw away ${mins} minutes. This cannot be undone.`);
    setTimeout(() => {
      discardArmed = false;
      $('discard').setAttribute('aria-label', 'Discard timer');
      $('discard').title = 'Discard timer';
      $('discard').classList.remove('armed');
    }, 6000);
    return;
  }
  const r = await chrome.runtime.sendMessage({ type: 'discardTimer' });
  if (!r || !r.ok) return say((r && r.error) || 'Could not discard the timer.');
  const st = r.result && r.result.started;
  if (st && !st.ok) {
    say(`Timer discarded. The new timer did not start: ${st.error || 'unknown error'}`);
    return done(4000);
  }
  say(st ? `Timer discarded. Switched${pending && pending.thenTitle ? ` to ${pending.thenTitle}` : ''}.` : 'Timer discarded.');
  done(st ? 1400 : 900);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && MODE === 'window') $('keep').click();
});

// ---- Load ----
function explain() {
  const reason = (pending && pending.reason) || 'stop';
  const parts = [];
  if (reason === 'dayEnd') parts.push('This timer was paused at the end of the day. It saves to the day it was recorded.');
  else if (reason === 'switch') parts.push(`Save this time first. Then the timer switches to ${(pending && pending.thenTitle) || 'the new item'}.`);
  else parts.push('Karbon needs a few details before it can save this time.');
  if (onClient() && workOnly()) parts.push('Your firm books time to work items, so choose one.');
  else if (onClient()) parts.push('It is on a client now. Choose a work item if it belongs to one.');
  else if (!onWorkItem()) parts.push(workOnly() ? 'Choose the work item it belongs to.' : 'Choose the work item or client it belongs to.');
  $('why').textContent = parts.join(' ');
  if (reason === 'switch') $('save').textContent = 'Save and switch';
}

(async () => {
  if (MODE === 'window') document.body.classList.add('window');
  pending = await chrome.runtime.sendMessage({ type: 'getPending' });
  ({ timeCfg: cfg = null } = await chrome.storage.local.get('timeCfg'));
  const r = await send('getState');
  state = r && r.ok ? r.result : await chrome.runtime.sendMessage({ type: 'getCached' });

  if (!state || !state.state || state.state === 'Stopped') {
    await chrome.runtime.sendMessage({ type: 'cancelFinish' });
    $('finish').hidden = true;
    $('why').textContent = 'There is no timer to finish. It may have been saved in Karbon already.';
    $('pill').textContent = 'No timer';
    return done(2500);
  }

  const secs = elapsedSeconds(state);
  $('elapsedBig').textContent = hms(secs);
  $('heading').setAttribute('aria-description', `Paused at ${spoken(secs)}.`);
  $('pill').textContent = state.state === 'Started' ? 'Running' : 'Paused';

  // What the timer is on now. Saving keeps it unless you pick something else.
  buildFields();
  if (onWorkItem()) {
    F.work.show({ key: state.work, linkType: 'WorkItem', title: state.title || 'Untitled work item' });
    F.client.show(state.client ? { title: state.client } : null);
  } else if (onClient()) {
    F.client.show({ key: state.work, title: state.client || 'Client', linkType: state.linkType });
  }
  // Required shows as a red outline while empty, with no label text; screen readers get aria-required.
  F.work.q.setAttribute('aria-required', String(!hasWork()));
  $('role').setAttribute('aria-required', String(!!(cfg && cfg.roleRequired)));
  $('taskType').setAttribute('aria-required', String(!!(cfg && cfg.taskTypeRequired)));
  $('desc').setAttribute('aria-required', String(!!(cfg && cfg.notesRequired)));
  $('desc').value = state.description || '';
  explain();

  await loadLookups();
  markMissing();
  if (!onWorkItem()) {
    // The item you had open in Karbon, as a one-click pick above the recents.
    if (pending && pending.suggest && pending.suggest.key) {
      const sg = pending.suggest;
      const it = { key: sg.key, linkType: sg.linkType, title: sg.title };
      const pick = () => (isWork(sg.linkType) ? F.work : F.client).pick(it);
      if (isWork(sg.linkType) || !workOnly()) $('suggest').replaceChildren(el('li', {}, pickRow(it, pick, 'The item you opened:')));
    }
    // Focus on the heading keeps the panel from autofocusing Work and opening its recents.
    $('heading').focus();
  } else {
    $((pending && pending.missing && FIELDS[pending.missing[0]]) || 'role').focus();
  }
})();
