// The settings and help page: live setup checklist, every setting with its default, and support details.
// Opened on install, from the stopwatch, and from Chrome's Options menu. Needs defaults.js, prefs.js, and ui.js.
ktWatchErrors('settings page');
let lastCheck = 0;
let setupOpened = false;   // the person chose "Show steps"
let firstCheck = true;
let workOnly = false;

// ---- Setup checklist ----
// Step 2 reads Karbon's sign-in through the background worker; no Karbon tab is needed.
async function karbonStatus() {
  // Ask the background to re-read the sign-in at most every 10 seconds, so signing in elsewhere is picked up.
  if (Date.now() - lastCheck > 10000) {
    lastCheck = Date.now();
    await chrome.runtime.sendMessage({ type: 'learnAccount' }).catch(() => null);
  }
  const k = await chrome.storage.local.get(['signedIn', 'user', 'firmName']);
  return { done: !!(k.signedIn && k.user), firm: k.firmName || null };
}

const STEPS = {
  pin: async () => {
    if (!chrome.action.getUserSettings) return { done: null };
    return { done: (await chrome.action.getUserSettings()).isOnToolbar };
  },
  karbon: karbonStatus,
  // The icon color is chosen in step 1, so it doesn't count as reviewing settings.
  prefs: async () => ({ done: Object.keys(await chrome.storage.sync.get(null)).some((k) => k !== 'toolbarTheme') }),
};
const DONE_TEXT = {
  pin: () => 'Pinned.',
  karbon: (r) => (r.firm ? `Connected to ${r.firm}.` : 'Connected to Karbon.'),
  prefs: () => 'Settings reviewed.',
};
const TODO_TEXT = {
  pin: 'Not pinned yet.',
  karbon: 'Not signed in to Karbon in this browser yet.',
  prefs: 'Optional. Defaults are in place.',
};

async function check() {
  const ids = Object.keys(STEPS);
  const res = {};
  for (const id of ids) {
    const li = $(`s-${id}`);
    const r = await STEPS[id]().catch(() => ({ done: null }));
    res[id] = r;
    const done = r.done === true;
    li.classList.toggle('done', done);
    li.querySelector('.mark').textContent = done ? '✓' : String(ids.indexOf(id) + 1);
    const text = done ? DONE_TEXT[id](r) : r.done === null ? '' : TODO_TEXT[id];
    const status = li.querySelector('.status');
    if (status.textContent !== text) status.textContent = text;
    if (id === 'karbon') $('openKarbon').hidden = done;
  }
  // Once pinned and connected, the steps fold into one line so returning visitors land on settings.
  const ready = res.pin.done !== false && res.karbon.done === true;
  $('ready').hidden = !ready;
  $('steps').hidden = ready && !setupOpened;
  $('readyText').textContent = res.karbon.firm ? `Connected to ${res.karbon.firm}. Your settings are below.` : 'Your settings are below.';
  await showConnection();
  if (firstCheck) {
    firstCheck = false;
    // The layout settles after the first check, so land on the linked part again.
    if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
  }
}

$('showSteps').addEventListener('click', () => {
  setupOpened = !setupOpened;
  $('steps').hidden = !setupOpened;
  $('showSteps').textContent = setupOpened ? 'Hide steps' : 'Show steps';
  $('showSteps').setAttribute('aria-expanded', String(setupOpened));
});
$('openKarbon').addEventListener('click', () => chrome.tabs.create({ url: KT_ORIGIN }));

// ---- Connection, in the header and under Support ----
// w: whether the last timer change worked without a Karbon tab.
function tabFree(w) {
  if (!w) return 'Works without a Karbon tab. Timer changes haven\'t been tried yet.';
  return w.ok ? 'Works without a Karbon tab.' : `Reads work without a Karbon tab. Timer changes use a Karbon tab (${w.error}).`;
}

async function showConnection() {
  const k = await chrome.storage.local.get(['signedIn', 'user', 'directApi', 'directWrites', 'firmName', 'cookieNote', 'keySource']);
  const d = k.directApi;
  let state = '', head, detail;
  if (k.signedIn === false) {
    state = 'bad';
    head = 'Not signed in to Karbon';
    detail = `Not signed in to Karbon in this browser${k.cookieNote ? ` (${k.cookieNote})` : ''}.`;
  } else if (!(k.signedIn && k.user)) {
    head = 'Checking your Karbon connection';
    detail = 'Not checked yet.';
  } else {
    state = 'ok';
    head = k.firmName ? `Connected to ${k.firmName}` : 'Connected to Karbon';
    if (!d) detail = 'Signed in. The tab-free check hasn\'t run yet.';
    else if (d.ok) detail = `${tabFree(k.directWrites)}${k.keySource === 'tab' ? ` Account read from a Karbon tab${k.cookieNote ? `; cookie: ${k.cookieNote}` : ''}.` : ''}`;
    else detail = `Signed in. Some actions open a Karbon tab (status ${d.status || 'none'}${d.error ? `, ${d.error}` : ''}).`;
  }
  $('conn').className = `conn ${state}`;
  if ($('connText').textContent !== head) $('connText').textContent = head;
  $('factConn').textContent = detail;
  $('factFirm').textContent = k.firmName || 'Not known yet';
}

// ---- Settings: defaults, changed tags, and reset ----
const UNITS = { sec: 'second', min: 'minute', hr: 'hour' };
const field = (name) => document.querySelector(`#prefs [name="${name}"], #supportPrefs [name="${name}"]`);
// A row's own label text, without its sub-label.
const labelText = (node) => (node && node.querySelector('.txt') ? node.querySelector('.txt').firstChild.textContent.trim() : '');

function defaultText(key) {
  const f = field(key);
  if (!f) return '';
  if (key in MODES || f.type === 'radio') {
    const v = key in MODES ? modeOf(DEFAULTS, key) : DEFAULTS[key];
    return labelText(document.querySelector(`#prefs [name="${key}"][value="${v}"]`).closest('label'));
  }
  if (f.type === 'checkbox') return DEFAULTS[key] ? 'On' : 'Off';
  if (f.tagName === 'SELECT') return f.querySelector(`option[value="${DEFAULTS[key]}"]`).textContent;
  const n = DEFAULTS[key], unit = UNITS[f.dataset.unit];
  return unit ? `${n} ${unit}${n === 1 ? '' : 's'}` : String(n);
}

const isChanged = (key, s) => keysOf(key).some((k) => s[k] !== DEFAULTS[k]);
const settingName = (row) => labelText(row.querySelector('.opt')) || row.closest('.card').querySelector('h3').textContent;

function renderMeta(s) {
  let changed = 0;
  for (const row of document.querySelectorAll('#prefs .setting[data-key], #supportPrefs .setting[data-key]')) {
    const key = row.dataset.key;
    const meta = row.querySelector(':scope > .help .meta');
    const on = isChanged(key, s);
    if (on) changed++;
    const reset = on ? [el('span', { class: 'changed' }, 'Changed'),
      el('button', { type: 'button', class: 'linklike', 'aria-label': `Reset ${settingName(row)} to default`, onclick: () => resetKeys(keysOf(key)) }, 'Reset to default')] : [];
    meta.replaceChildren(el('span', {}, `Default: ${defaultText(key)}.`), ...reset);
  }
  $('changedCount').textContent = changed ? `${changed} changed` : '';
  $('changedText').textContent = changed
    ? `You've changed ${changed} setting${changed === 1 ? '' : 's'} from the defaults.`
    : 'All settings are at their defaults.';
  $('restoreAll').disabled = !changed;
}

// Removing a key returns it to its default; the forms follow through storage.onChanged.
const resetKeys = (keys) => chrome.storage.sync.remove(keys).then(() => saved('Reset to default.'));

// Restoring everything takes two presses, like Discard on the finish form.
let restoreArmed = null;
$('restoreAll').addEventListener('click', async () => {
  if (!restoreArmed) {
    $('restoreAll').textContent = 'Press again to restore';
    restoreArmed = setTimeout(() => { restoreArmed = null; $('restoreAll').textContent = 'Restore all defaults'; }, 4000);
    return;
  }
  clearTimeout(restoreArmed);
  restoreArmed = null;
  $('restoreAll').textContent = 'Restore all defaults';
  await chrome.storage.sync.remove(Object.keys(DEFAULTS));
  saved('All settings restored to defaults.');
});

let savedTimer = null;
function saved(text) {
  const n = $('saved');
  n.textContent = text;
  n.classList.add('show');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => n.classList.remove('show'), 1800);
}

const onPrefs = (keys, s, local) => { renderMeta(s); if (local) saved('Saved.'); };
bindPrefs($('prefs'), onPrefs).then(renderMeta);
bindPrefs($('setupPrefs'), onPrefs);
bindPrefs($('supportPrefs'), onPrefs);

// ---- Menu: mark the part in view ----
const navLinks = [...document.querySelectorAll('nav.toc > ul > li:not(.sub) > a')];
const seen = new Map();
function markNav() {
  // The last part is short and never reaches the band, so the page bottom counts as it.
  const atEnd = innerHeight + scrollY >= document.documentElement.scrollHeight - 4;
  const current = atEnd ? navLinks[navLinks.length - 1] : navLinks.find((a) => seen.get(a.hash.slice(1)));
  if (current) for (const a of navLinks) a.setAttribute('aria-current', String(a === current));
}
const io = new IntersectionObserver((entries) => {
  for (const e of entries) seen.set(e.target.id, e.isIntersecting);
  markNav();
}, { rootMargin: '-15% 0px -70% 0px' });
for (const part of document.querySelectorAll('.part')) io.observe(part);
addEventListener('scroll', markNav, { passive: true });

// ---- Shortcuts and support ----
// chrome:// pages can't be opened from a plain link in an extension, only through the tabs API.
$('shortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));
$('feedback').addEventListener('click', openFeedback);
$('emailFeedback').addEventListener('click', emailFeedback);
$('copyDetails').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(await currentDetails());
    saved('Copied. Paste it into your message.');
  } catch {
    saved('Could not copy. Use Send feedback instead.');
  }
});

(async () => {
  const m = chrome.runtime.getManifest();
  $('ver').textContent = `Version ${m.version}`;
  $('factVer').textContent = `${m.version}${m.name.includes('(stage)') ? ' (stage build)' : ''}`;
  const { timeCfg } = await chrome.storage.local.get('timeCfg');
  workOnly = !!(timeCfg && timeCfg.workOnly);
  if (workOnly) $('contactsSub').textContent = 'People, organizations, and client groups. Your firm books time to work items only, so these timers start with no work item, and you choose one when you stop.';
  check();
  setInterval(check, 2000);
})();
