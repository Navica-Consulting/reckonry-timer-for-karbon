// Settings form binding, shared by the panel (popup.html) and the settings page (welcome.html),
// so both save, validate, and dim dependent rows the same way. Needs defaults.js.
/* eslint-disable no-unused-vars */

// Conditions for rows marked data-when. They read saved settings, not form fields,
// so a form that leaves a setting out still dims correctly.
const WHEN = {
  modeAuto: (s) => modeOf(s, 'startMode') === 'auto',
  modeNudge: (s) => modeOf(s, 'startMode') === 'nudge',
  contactAuto: (s) => modeOf(s, 'contactMode') === 'auto',
  contactNudge: (s) => modeOf(s, 'contactMode') === 'nudge',
  autoSwitch: (s) => s.autoSwitch || s.autoSwitchContacts,
  idlePause: (s) => s.idlePause,
  anyPause: (s) => s.pauseOnLock || s.idlePause,
  longTimer: (s) => s.longTimerAlert,
  badge: (s) => s.badgeWhere !== 'never',
};

// The storage keys behind a form field: two for a mode radio, otherwise its own name.
const keysOf = (name) => MODES[name] || (name in DEFAULTS ? [name] : []);

function fillField(f, s) {
  if (f.name in MODES) f.checked = f.value === modeOf(s, f.name);
  else if (f.type === 'radio') f.checked = f.value === s[f.name];
  else if (f.type === 'checkbox') f.checked = !!s[f.name];
  else f.value = s[f.name];
}

// Numbers outside the field's range are pulled back into it; an empty field gets the default.
function valueOf(f) {
  if (f.type === 'checkbox') return f.checked;
  if (f.type !== 'number') return f.value;
  const n = f.value === '' ? NaN : Number(f.value);
  if (!Number.isFinite(n)) return DEFAULTS[f.name];
  return Math.min(f.max === '' ? Infinity : Number(f.max), Math.max(Number(f.min) || 0, n));
}

// A nested row is live only when its own condition and every enclosing area's condition are on.
function updateDeps(form, s) {
  for (const row of form.querySelectorAll('[data-when]')) {
    let live = true;
    for (let n = row; n && n !== form; n = n.parentElement) {
      if (n.dataset && n.dataset.when && !WHEN[n.dataset.when](s)) live = false;
    }
    row.classList.toggle('off', !live);
    for (const input of row.querySelectorAll('input, select')) {
      // Leave inputs to their own row when that row has a condition of its own.
      if (input.closest('[data-when]') === row) input.disabled = !live;
    }
  }
}

// Fills the form, saves each change, and follows changes made elsewhere (the other page, or a reset).
// onChange(keys, s, local) runs after every change; local is true when it came from this form.
async function bindPrefs(form, onChange = () => {}) {
  const s = await chrome.storage.sync.get(DEFAULTS);
  for (const f of form.elements) if (keysOf(f.name).length) fillField(f, s);
  updateDeps(form, s);

  form.addEventListener('change', (e) => {
    const f = e.target;
    if (!keysOf(f.name).length) return;
    let patch;
    if (f.name in MODES) {
      const [a, r] = MODES[f.name];
      patch = { [a]: f.value === 'auto', [r]: f.value === 'nudge' };
    } else {
      patch = { [f.name]: valueOf(f) };
      fillField(f, patch);
    }
    Object.assign(s, patch);
    chrome.storage.sync.set(patch);
    updateDeps(form, s);
    onChange(Object.keys(patch), s, true);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    const keys = Object.keys(changes).filter((k) => k in DEFAULTS && s[k] !== (changes[k].newValue ?? DEFAULTS[k]));
    if (!keys.length) return;
    for (const k of keys) s[k] = changes[k].newValue ?? DEFAULTS[k];
    // Refill only the affected fields, so a field being typed in is left alone.
    for (const f of form.elements) if (keysOf(f.name).some((k) => keys.includes(k))) fillField(f, s);
    updateDeps(form, s);
    onChange(keys, s, false);
  });
  return s;
}

// Feedback: a Google Form with the version, settings, and recent errors prefilled, never client or work data.
// The email stays for people who'd rather write.
const FEEDBACK_FORM = 'https://docs.google.com/forms/d/e/1FAIpQLSdSTWLnWUb8Pyfk3cuXpKfL9JGxfZ6ciFbuBzF_108db4y7LA/viewform';
const FEEDBACK_DETAILS_ENTRY = 'entry.1196218190'; // The form's "Extension details" field.
const FEEDBACK_EMAIL = 'max@navicaconsulting.com'; // Interim address until a permanent one is chosen.

function supportDetails(s, workOnly) {
  const v = chrome.runtime.getManifest().version;
  const chromeVer = (navigator.userAgent.match(/Chrome\/([\d.]+)/) || [])[1] || 'unknown';
  const on = Object.entries(s).filter(([, x]) => x === true).map(([k]) => k).join(', ') || 'none';
  return [
    `Version: ${v}`, `Chrome: ${chromeVer}`,
    `No timer, work items: ${modeOf(s, 'startMode')} (start ${s.workStartSeconds}s, remind ${s.nudgeSeconds}s)`,
    `No timer, contacts: ${modeOf(s, 'contactMode')} (start ${s.contactStartSeconds}s, remind ${s.contactNudgeSeconds}s)`,
    `Auto-switch: work ${s.autoSwitch ? 'on' : 'off'}, contacts ${s.autoSwitchContacts ? 'on' : 'off'} (${s.switchSeconds}s)`,
    `Long-timer alert: ${s.longTimerAlert ? `${s.longTimerHours}h` : 'off'}`,
    `Badge: ${s.badgeWhere}`, `Notes level: ${s.noteLevel}`,
    `Settings on: ${on}`, `Work items only: ${workOnly ? 'yes' : 'no'}`,
  ].join('\n');
}

async function currentDetails() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  const { timeCfg } = await chrome.storage.local.get('timeCfg');
  return [supportDetails(s, !!(timeCfg && timeCfg.workOnly)), '', ...(await ktErrorLines())].join('\n');
}

async function openFeedback() {
  const url = `${FEEDBACK_FORM}?usp=pp_url&${FEEDBACK_DETAILS_ENTRY}=${encodeURIComponent(await currentDetails())}`;
  return chrome.tabs.create({ url });
}

async function emailFeedback() {
  const v = chrome.runtime.getManifest().version;
  const body = ['What happened, or what would you like to see?', '', '', '', '---', await currentDetails()].join('\n');
  const url = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(`Reckonry Timer for Karbon feedback (v${v})`)}&body=${encodeURIComponent(body)}`;
  return chrome.tabs.create({ url });
}
