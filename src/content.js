// Isolated-world bridge between the extension and page.js. Also watches SPA route changes for
// work item and contact pages: auto-start, auto-switch, or a start reminder, each through an accessible toast.
(() => {
  const DEFAULTS = {
    autoStartWork: true, workStartSeconds: 2, autoStartContacts: false, contactStartSeconds: 8,
    autoSwitch: false, switchSeconds: 2, remindNoTimer: false, nudgeSeconds: 60,
    noteLevel: 'auto', debugLog: false,
  };
  const pending = new Map();
  let seq = 0;

  function pageCall(cmd, args) {
    return new Promise((resolve, reject) => {
      const id = `kt${Date.now()}_${++seq}`;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('Karbon page did not respond. Reload the Karbon tab and try again.'));
      }, 15000);
      pending.set(id, { resolve, reject, timer });
      window.postMessage({ src: 'kt-cs', id, cmd, args }, location.origin);
    });
  }

  window.addEventListener('message', (ev) => {
    if (ev.source !== window || ev.origin !== location.origin) return;
    const m = ev.data;
    if (!m || m.src !== 'kt-page') return;
    if (m.event === 'state') {
      chrome.runtime.sendMessage({ type: 'state', state: m.state }).catch(() => {});
      return;
    }
    if (m.event === 'timeSettings') {
      chrome.storage.local.set({ timeCfg: m.settings }).catch(() => {});
      return;
    }
    const p = pending.get(m.id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(m.id);
    m.ok ? p.resolve(m.result) : p.reject(new Error(m.error));
  });

  // Commands from background.js or the popup, routed to this tab.
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.to === 'karbon') {
      pageCall(msg.cmd, msg.args)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((e) => sendResponse({ ok: false, error: e.message }));
      return true;
    }
    return false;
  });

  // ---- Settings pushed into page.js ----
  let debug = false;
  const log = (...a) => { if (debug) console.info('[KT]', ...a); };
  const applyDebug = (on) => {
    debug = !!on;
    pageCall('setDebug', { on: debug }).catch(() => {});
  };
  chrome.storage.sync.get({ debugLog: false }).then((s) => applyDebug(s.debugLog));
  chrome.storage.onChanged.addListener((c, area) => {
    if (area === 'sync' && c.debugLog) applyDebug(c.debugLog.newValue);
  });
  // Known keys let a freshly opened background tab act before Karbon finishes loading.
  chrome.storage.local.get(['tenant', 'user', 'base']).then((k) => {
    if (k.tenant) pageCall('setKeys', k).catch(() => {});
  });
  // Refresh the firm's time settings once Karbon has loaded, in case an admin changed them.
  setTimeout(() => pageCall('timeSettings', { fresh: true }).catch(() => {}), 6000);

  // ---- Work item and contact detection ----
  // Karbon page URLs: /{tenant}/work/{key}, /contacts/{key}, /organizations/{key}, /client-groups/{key}.
  const PAGE_RE = /^\/[^/]+\/(work|contacts|organizations|client-groups)\/([A-Za-z0-9]+)/;
  const LINK = { work: 'WorkItem', contacts: 'Contact', organizations: 'Organization', 'client-groups': 'ClientGroup' };
  const KIND = { WorkItem: 'work item', Contact: 'contact', Organization: 'organization', ClientGroup: 'client group' };
  const itemFromPath = () => {
    const m = location.pathname.match(PAGE_RE);
    return m ? { key: m[2], linkType: LINK[m[1]] } : null;
  };
  const here = (key) => { const i = itemFromPath(); return !!i && i.key === key; };
  const focused = () => document.visibilityState === 'visible' && document.hasFocus();
  const dismissed = new Set(); // work items whose reminder you dismissed in this tab
  const SETTLE_MS = 600;       // let the page finish routing before checking the timer

  let lastKey = null;
  let timers = [];
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

  setInterval(() => {
    const item = itemFromPath();
    const key = item ? item.key : null;
    if (key === lastKey) return;
    lastKey = key;
    clearTimers();
    removeToast();
    if (!item) return;
    chrome.storage.sync.get(DEFAULTS).then((s) => {
      timers.push(setTimeout(() => onOpen(item, s), SETTLE_MS));
    });
  }, 500);

  async function readState() {
    try { return await pageCall('getState'); } catch (e) { log('could not read timer:', e.message); return null; }
  }

  async function onOpen(item, s) {
    const { key, linkType } = item;
    if (!here(key)) return;
    if (!focused()) return log('skipped: Karbon tab not focused');
    const isWork = linkType === 'WorkItem';
    if (!isWork) {
      const { timeCfg } = await chrome.storage.local.get('timeCfg');
      if (timeCfg && timeCfg.workOnly) return log('skipped: this firm books time to work items only');
    }
    const state = await readState();
    if (!state) return;
    const running = state.state !== 'Stopped';
    log(`timer ${state.state}, same item: ${state.work === key}`);
    if (state.work === key) return;
    // A running timer with no work item: always ask, whatever the settings, and keep asking until answered.
    if (running && !state.work) return showFinishPrompt(item, s);

    // Contact auto-start sits under work-item auto-start, so it only applies while that is on.
    const wanted = isWork ? (s.autoStartWork || s.autoSwitch || s.remindNoTimer) : s.autoStartWork && s.autoStartContacts;
    if (!wanted) return log(`${KIND[item.linkType]} opened; automation is off for it`);
    const seconds = isWork ? s.workStartSeconds : s.contactStartSeconds;
    const canStart = isWork ? s.autoStartWork : s.autoStartWork && s.autoStartContacts;
    // Contacts only take over a running timer when contact auto-start is on.
    if (running && s.autoSwitch && (isWork || canStart)) return autoAct(item, s, true, s.switchSeconds);
    if (!running && canStart) return autoAct(item, s, false, seconds);
    if (!running && isWork && s.remindNoTimer && !dismissed.has(key)) {
      timers.push(setTimeout(() => nudge(item, s), Math.max(0, s.nudgeSeconds * 1000 - SETTLE_MS)));
    }
  }

  async function startArgs(item, extra) {
    const d = await chrome.storage.local.get(['roleKey', 'taskTypeKey']);
    return { workKey: item.key, linkType: item.linkType, roleKey: d.roleKey, taskTypeKey: d.taskTypeKey, ...extra };
  }

  // Karbon's tab title starts with the item's name.
  const pageTitle = () => (document.title || '').split(' | ')[0].replace(/ - [^-]+$/, '').trim() || null;

  // ---- Persistent finish prompt ----
  // Shown when you open a work item or contact while a timer with no work item is running.
  // It has no countdown and stays through page changes until you answer it; opening another item
  // just updates it. Finishing pauses the timer and opens the finish window, with the item you
  // opened offered as a one-click pick. With auto-switch on, the timer then moves to that item.
  let promptHost = null;
  let promptItem = null;

  function removePrompt() {
    if (promptHost) promptHost.remove();
    promptHost = null;
    promptItem = null;
  }

  function showFinishPrompt(item, s) {
    const title = pageTitle() || `this ${KIND[item.linkType]}`;
    promptItem = { ...item, title };
    if (!promptHost) {
      promptHost = document.createElement('div');
      const root = promptHost.attachShadow({ mode: 'closed' });
      root.innerHTML = `
        <style>
          .p{position:fixed;right:20px;bottom:20px;z-index:2147483647;background:#1f2933;color:#fff;width:340px;
             font:14px/1.45 system-ui,sans-serif;padding:14px 16px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.3);
             border-left:5px solid #f2c94c}
          h2{font-size:15px;margin:0 0 4px}
          p{margin:0 0 10px}
          .row{display:flex;gap:8px;flex-wrap:wrap}
          button{font:inherit;border:0;border-radius:6px;padding:6px 12px;cursor:pointer}
          .go{background:#7cb0ff;color:#0b1c33;font-weight:600}
          .no{background:#fff;color:#1f2933}
          button:focus-visible{outline:3px solid #7cc4fa;outline-offset:2px}
        </style>
        <div class="p" role="alertdialog" aria-labelledby="h" aria-describedby="d">
          <h2 id="h">Your timer has no work item</h2>
          <p id="d"></p>
          <div class="row"><button type="button" class="go"></button><button type="button" class="no">Keep it running</button></div>
        </div>`;
      promptHost._root = root;
      root.querySelector('.no').addEventListener('click', () => { log('finish prompt: keep running'); removePrompt(); });
      root.querySelector('.go').addEventListener('click', async () => {
        const it = promptItem;
        const cfg = await chrome.storage.sync.get(DEFAULTS);
        removePrompt();
        const state = await readState();
        if (!state || state.state === 'Stopped' || state.work) return; // already finished elsewhere
        const then = cfg.autoSwitch ? await startArgs(it, { note: KTNotes.note('switchedIn', cfg.noteLevel) }) : null;
        await chrome.runtime.sendMessage({
          type: 'promptFinish', ui: 'window', reason: then ? 'switch' : 'stop',
          note: KTNotes.note(then ? 'switchedAway' : 'manualStop', cfg.noteLevel),
          then, thenTitle: then ? it.title : null,
          suggest: { key: it.key, linkType: it.linkType, title: it.title },
        });
      });
      document.documentElement.appendChild(promptHost);
    }
    const root = promptHost._root;
    root.getElementById('d').textContent = s.autoSwitch
      ? `You opened ${title}. Choose where the time so far belongs, then the timer moves here.`
      : `You opened ${title}. Choose where the time so far belongs and save it.`;
    root.querySelector('.go').textContent = s.autoSwitch ? 'Finish and switch here' : 'Finish timer';
  }

  // Clear the prompt if the timer gets a work item or stops elsewhere.
  setInterval(async () => {
    if (!promptHost) return;
    const st = await readState();
    if (st && (st.state === 'Stopped' || st.work)) removePrompt();
  }, 5000);

  async function autoAct(item, s, switching, seconds) {
    const kind = KIND[item.linkType];
    const go = await showToast({
      text: switching ? `Switching timer to this ${kind}` : `Starting timer on this ${kind}`,
      seconds: Math.max(1, Number(seconds) || 1), mode: 'countdown',
    });
    if (!go || !here(item.key)) return log('cancelled');
    const extra = switching
      ? { stopNote: KTNotes.note('switchedAway', s.noteLevel), note: KTNotes.note('switchedIn', s.noteLevel) }
      : { note: KTNotes.note('autoStart', s.noteLevel, { kind }) };
    try {
      const args = await startArgs(item, { ...extra, interactive: true });
      const r = await pageCall('start', args);
      if (r && r.needsCompletion) {
        const { stopNote, ...then } = args;
        await chrome.runtime.sendMessage({ type: 'promptFinish', ui: 'window', reason: 'switch', note: stopNote, then, thenTitle: pageTitle(), missing: r.missing });
      }
    } catch (e) {
      showToast({ text: e.message, seconds: 8, mode: 'info' });
    }
  }

  async function nudge(item, s) {
    if (!here(item.key) || !focused()) return;
    const state = await readState();
    if (!state || state.state !== 'Stopped') return;
    const go = await showToast({ text: 'No timer is running on this work item.', seconds: 20, mode: 'confirm', confirmLabel: 'Start timer' });
    if (!go) { dismissed.add(item.key); return; }
    try {
      await pageCall('start', await startArgs(item, { note: KTNotes.note('nudgeStart', s.noteLevel) }));
    } catch (e) {
      showToast({ text: e.message, seconds: 8, mode: 'info' });
    }
  }

  // ---- Accessible toast ----
  // countdown: acts unless cancelled. confirm: acts only if the button is pressed. info: message only.
  let toastHost = null;
  let toastDone = null;
  function removeToast() {
    if (toastDone) toastDone(false);
    if (toastHost) toastHost.remove();
    toastHost = null;
    toastDone = null;
  }

  function showToast({ text, seconds, mode, confirmLabel }) {
    removeToast();
    return new Promise((resolve) => {
      toastHost = document.createElement('div');
      const root = toastHost.attachShadow({ mode: 'closed' });
      const buttons = mode === 'confirm'
        ? `<button type="button" class="go">${confirmLabel}</button><button type="button" class="no">Not now</button>`
        : `<button type="button" class="no">${mode === 'info' ? 'Dismiss' : 'Cancel'}</button>`;
      root.innerHTML = `
        <style>
          .t{position:fixed;right:20px;bottom:20px;z-index:2147483647;background:#1f2933;color:#fff;
             font:14px/1.4 system-ui,sans-serif;padding:12px 14px;border-radius:8px;display:flex;gap:10px;
             align-items:center;box-shadow:0 4px 16px rgba(0,0,0,.25);max-width:400px}
          button{font:inherit;border:0;border-radius:6px;padding:6px 12px;cursor:pointer;white-space:nowrap}
          .go{background:#7cb0ff;color:#0b1c33;font-weight:600}
          .no{background:#fff;color:#1f2933}
          button:focus-visible{outline:3px solid #7cc4fa;outline-offset:2px}
        </style>
        <div class="t" role="status" aria-live="polite"><span class="msg"></span>${buttons}</div>`;
      const msg = root.querySelector('.msg');
      let left = seconds;
      const render = () => { msg.textContent = mode === 'countdown' ? `${text} in ${left}s.` : text; };
      render();
      document.documentElement.appendChild(toastHost);

      let settled = false;
      const finish = (val) => {
        if (settled) return;
        settled = true;
        clearInterval(tick);
        if (toastHost) toastHost.remove();
        toastHost = null;
        toastDone = null;
        resolve(val);
      };
      toastDone = finish;
      const tick = setInterval(() => {
        left -= 1;
        if (left <= 0) finish(mode === 'countdown');
        else if (mode === 'countdown') render();
      }, 1000);
      root.querySelector('.no').addEventListener('click', () => finish(false));
      const go = root.querySelector('.go');
      if (go) go.addEventListener('click', () => finish(true));
    });
  }
})();
