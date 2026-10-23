// Live setup checklist for the welcome page.
// Step 2 reads Karbon's sign-in through the background worker; no Karbon tab is needed.
let lastCheck = 0;
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
  prefs: async () => ({ done: Object.keys(await chrome.storage.sync.get(null)).length > 0 }),
};
const DONE_TEXT = {
  pin: () => 'Pinned.',
  karbon: (r) => (r.firm ? `Connected to ${r.firm}.` : 'Connected to Karbon.'),
  prefs: () => 'Preferences saved.',
};
const TODO_TEXT = {
  pin: 'Not pinned yet.',
  karbon: 'Not signed in to Karbon in this browser yet.',
  prefs: 'Optional. Defaults are in place.',
};

async function check() {
  const ids = Object.keys(STEPS);
  for (const id of ids) {
    const li = document.getElementById(`s-${id}`);
    const r = await STEPS[id]().catch(() => ({ done: null }));
    const done = r.done === true;
    li.classList.toggle('done', done);
    li.querySelector('.mark').textContent = done ? '\u2713' : String(ids.indexOf(id) + 1);
    const text = done ? DONE_TEXT[id](r) : r.done === null ? '' : TODO_TEXT[id];
    const status = li.querySelector('.status');
    if (status.textContent !== text) status.textContent = text;
    if (id === 'karbon') document.getElementById('openKarbon').hidden = done;
  }
}

document.getElementById('openKarbon').addEventListener('click', () => chrome.tabs.create({ url: KT_ORIGIN }));
check();
setInterval(check, 2000);
