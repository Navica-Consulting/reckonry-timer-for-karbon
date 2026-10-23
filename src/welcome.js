// Live setup checklist for the welcome page.
const STEPS = {
  pin: async () => {
    if (!chrome.action.getUserSettings) return null;
    return (await chrome.action.getUserSettings()).isOnToolbar;
  },
  karbon: async () => !!(await chrome.storage.local.get('user')).user,
  defaults: async () => !!(await chrome.storage.local.get('roleKey')).roleKey,
  prefs: async () => Object.keys(await chrome.storage.sync.get(null)).length > 0,
};
const DONE_TEXT = { pin: 'Pinned.', karbon: 'Karbon found.', defaults: 'Role and task type learned.', prefs: 'Preferences saved.' };
const TODO_TEXT = { pin: 'Not pinned yet.', karbon: 'Waiting for Karbon to load.', defaults: 'Waiting for your first timer.', prefs: 'Optional. Defaults are in place.' };

async function check() {
  for (const [id, test] of Object.entries(STEPS)) {
    const li = document.getElementById(`s-${id}`);
    const done = await test().catch(() => null);
    li.classList.toggle('done', done === true);
    li.querySelector('.mark').textContent = done === true ? '✓' : String(Object.keys(STEPS).indexOf(id) + 1);
    li.querySelector('.status').textContent = done === true ? DONE_TEXT[id] : done === null ? '' : TODO_TEXT[id];
  }
}

document.getElementById('openKarbon').addEventListener('click', () => chrome.tabs.create({ url: KT_ORIGIN }));
check();
setInterval(check, 2000);
