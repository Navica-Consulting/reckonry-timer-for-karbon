// Finish form: collects what a timer needs before Karbon will save it (a work item or contact, plus a role,
// task type, or note when the firm requires them). Opens in the toolbar panel (mode=popup), which the
// background also opens after an automatic switch; a small window (mode=window) is the fallback.
const MODE = new URLSearchParams(location.search).get('mode') === 'window' ? 'window' : 'popup';
const send = (cmd, args) => chrome.runtime.sendMessage({ type: 'cmd', cmd, args });

let state = null;    // the paused timer
let pending = null;  // { note, then, thenTitle, missing, reason }
let cfg = null;      // the firm's time settings
let chosen = null;   // the work item or contact picked here
let discardArmed = false;

const NOUN = { work: 'a work item or contact', role: 'a role', taskType: 'a task type', notes: 'a note' };
const workOnly = () => !!(cfg && cfg.workOnly);

function say(text) { $('msg').textContent = text; }

function done(delay = 1400) {
  setTimeout(() => {
    if (MODE === 'window') window.close();
    else location.href = 'popup.html';
  }, delay);
}

// ---- Errors, announced and linked to their fields ----
const FIELDS = { work: 'q', role: 'role', taskType: 'taskType', notes: 'desc' };
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
    if (first === 'work' && chosen) clearChoice();
    $(FIELDS[first]).focus();
  }
  say(`Missing: ${missing.map((k) => NOUN[k]).join(', ')}.`);
}

// ---- Work picker ----
function itemRow(item) {
  const b = el('button', { type: 'button', class: 'item', onclick: () => choose(item) },
    el('span', { class: 't' }, item.title || 'Untitled', TAGS[item.linkType] ? el('span', { class: 'tag' }, TAGS[item.linkType]) : null),
    item.subtitle ? el('span', { class: 's' }, item.subtitle) : null);
  b.setAttribute('aria-label', `Choose ${item.title || 'item'}${item.subtitle ? `, ${item.subtitle}` : ''}`);
  return el('li', {}, b);
}

function choose(item) {
  chosen = item;
  $('chosenTitle').textContent = item.title || 'Untitled';
  if (TAGS[item.linkType]) $('chosenTitle').append(' ', el('span', { class: 'tag' }, TAGS[item.linkType]));
  $('chosenSub').textContent = item.subtitle || '';
  $('chosen').hidden = false;
  $('picker').hidden = true;
  $('workErr').hidden = true;
  $('q').removeAttribute('aria-invalid');
  say(`${item.title || 'Item'} chosen.`);
  $('role').focus();
}

function clearChoice() {
  chosen = null;
  $('chosen').hidden = true;
  $('picker').hidden = false;
  $('q').focus();
}
$('change').addEventListener('click', clearChoice);

function showResults(head, items) {
  $('resultsHead').textContent = head;
  $('results').replaceChildren(...items.map(itemRow));
}

async function loadRecents() {
  $('resultsHead').textContent = 'Loading recent work items.';
  const r = await send('recents', { take: 6 });
  if (!r || !r.ok) { $('resultsHead').textContent = ''; return; }
  showResults(r.result.length ? 'Recent work items' : '', r.result);
}

let searchSeq = 0;
async function runSearch(term) {
  const mine = ++searchSeq;
  $('resultsHead').textContent = 'Searching.';
  const w = await send('search', { term, kind: 'work', take: 6 });
  if (mine !== searchSeq) return;
  if (!w || !w.ok) { $('resultsHead').textContent = (w && w.error) || 'Search failed.'; return; }
  const c = workOnly() ? null : await send('search', { term, kind: 'contact', take: 4 });
  if (mine !== searchSeq) return;
  const items = [...w.result, ...((c && c.ok && c.result) || [])];
  showResults(items.length ? `${items.length} result${items.length === 1 ? '' : 's'}` : 'No matches.', items);
}

let debounce = null;
$('q').addEventListener('input', () => {
  clearTimeout(debounce);
  const term = $('q').value.trim();
  if (term.length < 2) { searchSeq++; debounce = setTimeout(loadRecents, 200); return; }
  debounce = setTimeout(() => runSearch(term), 350);
});

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
  if (!(state && state.work) && !chosen) m.push('work');
  if (cfg && cfg.roleRequired && emptySel($('role'))) m.push('role');
  if (cfg && cfg.taskTypeRequired && emptySel($('taskType'))) m.push('taskType');
  if (cfg && cfg.notesRequired && !$('desc').value.trim()) m.push('notes');
  return m;
}

$('finish').addEventListener('submit', async (e) => {
  e.preventDefault();
  const missing = missingHere();
  if (missing.length) return showErrors(missing);
  clearErrors();
  const fill = { roleKey: $('role').value || null, taskTypeKey: $('taskType').value || null, description: $('desc').value };
  if (chosen) Object.assign(fill, { workKey: chosen.key, linkType: chosen.linkType || 'WorkItem' });
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
  if (!(state && state.work)) parts.push('Choose the work item or contact it belongs to.');
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

  if (state.work) {
    $('workFixed').hidden = false;
    $('workFixedTitle').textContent = state.title || state.client || 'Already set';
    $('picker').hidden = true;
    $('workReq').textContent = '';
  } else {
    $('workReq').textContent = '(required)';
    if (workOnly()) $('q').placeholder = 'Search work items';
  }
  if (cfg && cfg.roleRequired) $('roleReq').textContent = '(required)';
  if (cfg && cfg.taskTypeRequired) $('taskTypeReq').textContent = '(required)';
  if (cfg && cfg.notesRequired) $('notesReq').textContent = '(required)';
  $('desc').value = state.description || '';
  explain();

  await loadLookups();
  if (!state.work) {
    // The item you had open in Karbon, as a one-click pick above the recents.
    if (pending && pending.suggest && pending.suggest.key) {
      const sg = pending.suggest;
      const li = itemRow({ key: sg.key, linkType: sg.linkType, title: sg.title });
      li.querySelector('.item').prepend(el('span', { class: 'lead' }, 'The item you opened: '));
      $('suggest').replaceChildren(li);
    }
    loadRecents();
    $('q').focus();
  } else {
    $((pending && pending.missing && FIELDS[pending.missing[0]]) || 'role').focus();
  }
})();
