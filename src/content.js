// Isolated-world bridge between the extension and page.js. Also watches SPA route changes for
// work item and contact pages: auto-start, auto-switch, or a start reminder, each through an accessible toast.
(() => {
  const pending = new Map();
  let seq = 0;

  // A reload or update of the extension leaves this script running in open tabs, cut off from Chrome's APIs,
  // which then throw "Extension context invalidated". Once that happens it stops and clears its cards.
  const loops = [];
  const alive = () => !!(chrome.runtime && chrome.runtime.id);
  function retire() {
    window.removeEventListener('message', onPageMessage);
    loops.forEach(clearInterval);
    removeToast();
    removePrompt();
  }

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

  function onPageMessage(ev) {
    if (ev.source !== window || ev.origin !== location.origin) return;
    const m = ev.data;
    if (!m || m.src !== 'kt-page') return;
    if (!alive()) return retire();
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
    m.ok ? p.resolve(m.result) : p.reject(Object.assign(new Error(m.error), { signedOut: !!m.signedOut }));
  }
  window.addEventListener('message', onPageMessage);

  // Commands from background.js or the popup, routed to this tab.
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.to === 'karbon') {
      pageCall(msg.cmd, msg.args)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((e) => sendResponse({ ok: false, error: e.message, code: e.signedOut ? 'SIGNED_OUT' : undefined }));
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
  // The page also reads the keys itself; whatever it ends up knowing is passed to the background.
  const shareKeys = (k) => pageCall('setKeys', k || {}).then((r) => {
    // Karbon says this tab is signed out; the background checks with Karbon before believing it.
    if (r && r.loggedIn === false) {
      chrome.runtime.sendMessage({ type: 'pageSignedOut' }).catch(() => {});
      return false;
    }
    if (r && r.ready) chrome.runtime.sendMessage({ type: 'pageKeys', keys: { tenant: r.tenant, user: r.user, base: r.base } }).catch(() => {});
    return r && r.ready;
  }).catch(() => false);
  chrome.storage.local.get(['tenant', 'user', 'base']).then(async (k) => {
    if (await shareKeys(k.tenant ? k : null)) return;
    // Karbon's own session data appears once the app has booted; check again a few times.
    for (const wait of [1500, 3000, 6000]) {
      await new Promise((r) => setTimeout(r, wait));
      if (await shareKeys(null)) return;
    }
  });
  // ---- Page cards ----
  // Toasts and the finish prompt share one card that looks like the toolbar panel:
  // the same colors (light or dark with the system), type, buttons, and status pill as ui.css.
  // A shadow root keeps Karbon's styles out, so the panel's tokens are repeated here.
  const CARD_CSS = `
    :host{all:initial}
    .c{--bg:#fff;--fg:#1f2933;--muted:#5f6b7a;--line:#e3e7ec;--soft:#f3f5f8;--accent:#2e5aac;--on-accent:#fff;--warn:#9a6700;--bad:#b42318;
       position:fixed;right:20px;z-index:2147483647;width:340px;box-sizing:border-box;overflow:hidden;
       background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:10px;padding:12px 14px 14px;
       font:14px/1.45 system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.18);animation:in .18s ease-out}
    @media (prefers-color-scheme:dark){
      .c{--bg:#1b1f24;--fg:#e8ecf1;--muted:#9aa5b1;--line:#323a43;--soft:#242a31;--accent:#7cb0ff;--on-accent:#0d1b33;--warn:#f2c94c;--bad:#ff8a80;
         box-shadow:0 8px 28px rgba(0,0,0,.5)}}
    .c.bottom{bottom:20px} .c.top{top:20px}
    @keyframes in{from{opacity:0;transform:translateY(6px)}}
    @media (prefers-reduced-motion:reduce){.c{animation:none}}
    .brand{display:flex;align-items:center;gap:6px;margin-bottom:6px;color:var(--muted);font-size:12px;font-weight:600}
    .brand svg{width:16px;height:16px;fill:none;stroke:var(--accent);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
    .pill{margin-left:auto;font-size:12px;font-weight:600;padding:2px 8px;border-radius:999px;background:var(--soft);color:var(--muted)}
    .pill.warn{color:var(--warn)} .pill.bad{color:var(--bad)}
    h2{font-size:15px;margin:0 0 2px} p{margin:0}
    .row{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
    button{font:inherit;font-weight:600;border-radius:8px;padding:6px 12px;cursor:pointer;white-space:nowrap;
           border:1px solid var(--line);background:var(--bg);color:var(--fg)}
    button:hover{background:var(--soft)}
    button.primary{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
    button:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
    .bar{position:absolute;left:0;bottom:0;height:3px;width:100%;background:var(--accent);transform-origin:left;animation:drain var(--d) linear forwards}
    .c:hover .bar,.c:focus-within .bar{animation-play-state:paused}
    @keyframes drain{to{transform:scaleX(0)}}`;
  const STOPWATCH = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13.5" r="7"/><path d="M12 13.5V10M10 3h4M18.5 6.5l1.5-1.5"/></svg>';

  // Builds a card host. pill: { text, tone } shown at the top right, like the panel's status pill.
  function makeCard({ where = 'bottom', role, pill, body }) {
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'closed' });
    const tag = pill ? `<span class="pill ${pill.tone || ''}">${pill.text}</span>` : '';
    root.innerHTML = `<style>${CARD_CSS}</style>
      <div class="c ${where}" ${role}><div class="brand">${STOPWATCH}Reckonry Timer${tag}</div>${body}</div>`;
    host._root = root;
    document.documentElement.appendChild(host);
    return host;
  }

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
  const dismissed = new Set(); // items whose reminder you dismissed in this tab
  const SETTLE_MS = 600;       // let the page finish routing before checking the timer
  const TOAST_SECONDS = 5;     // a cancel toast stays this long once the wait is over

  let lastKey = null;
  let timers = [];
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

  loops.push(setInterval(() => {
    if (!alive()) return retire();
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
  }, 500));

  async function readState() {
    try { return await pageCall('getState'); } catch (e) { log('could not read timer:', e.message); return null; }
  }

  async function onOpen(item, s) {
    const { key, linkType } = item;
    if (!here(key)) return;
    if (!focused()) return log('skipped: Karbon tab not focused');
    const isWork = linkType === 'WorkItem';
    // Work-only firms still start timers from contacts, just with no work item attached.
    const { timeCfg } = await chrome.storage.local.get('timeCfg');
    const blankOnly = !isWork && !!(timeCfg && timeCfg.workOnly);
    const state = await readState();
    if (!state) return;
    const running = state.state !== 'Stopped';
    log(`timer ${state.state}, same item: ${state.work === key}`);
    if (state.work === key) return;
    // A running timer with no work item: always ask, whatever the settings, and keep asking until answered.
    // A contact can't take the time in a work-only firm, so there is nothing to offer.
    if (running && !state.work) return blankOnly ? log('blank timer running; contact cannot take it') : showFinishPrompt(item, s);

    // Work items and contacts each have their own choice: auto-start, remind, or nothing.
    const canStart = isWork ? s.autoStartWork : s.autoStartContacts;
    const remind = isWork ? s.remindNoTimer : s.remindContacts;
    const canSwitch = switchesTo(item, s);
    const wanted = canStart || remind || canSwitch;
    if (!wanted) return log(`${KIND[item.linkType]} opened; automation is off for it`);
    const seconds = isWork ? s.workStartSeconds : s.contactStartSeconds;
    const remindSeconds = isWork ? s.nudgeSeconds : s.contactNudgeSeconds;
    if (running && canSwitch) return later(s.switchSeconds, () => autoAct(item, s, true, blankOnly));
    if (!running && canStart) return later(seconds, () => autoAct(item, s, false, blankOnly));
    if (!running && remind && !dismissed.has(key)) later(remindSeconds, () => nudge(item, s));
  }

  // Auto-switch is set separately for work items and contacts.
  const switchesTo = (item, s) => (item.linkType === 'WorkItem' ? s.autoSwitch : s.autoSwitchContacts);

  // The settings count from when the page opened, which includes the settle delay.
  const later = (seconds, fn) => timers.push(setTimeout(fn, Math.max(0, (Number(seconds) || 0) * 1000 - SETTLE_MS)));

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
      promptHost = makeCard({
        role: 'role="alertdialog" aria-labelledby="h" aria-describedby="d"', pill: { text: 'No work item', tone: 'warn' },
        body: `<h2 id="h">Your timer has no work item</h2>
          <p id="d"></p>
          <div class="row"><button type="button" class="go primary"></button><button type="button" class="no">Keep it running</button></div>`,
      });
      const root = promptHost._root;
      root.querySelector('.no').addEventListener('click', () => { log('finish prompt: keep running'); removePrompt(); });
      root.querySelector('.go').addEventListener('click', async () => {
        if (!alive()) return retire();
        const it = promptItem;
        const cfg = await chrome.storage.sync.get(DEFAULTS);
        removePrompt();
        const state = await readState();
        if (!state || state.state === 'Stopped' || state.work) return; // already finished elsewhere
        const then = switchesTo(it, cfg) ? await startArgs(it, { note: KTNotes.note('switchedIn', cfg.noteLevel) }) : null;
        await chrome.runtime.sendMessage({
          type: 'promptFinish', ui: 'window', reason: then ? 'switch' : 'stop',
          note: KTNotes.note(then ? 'switchedAway' : 'manualStop', cfg.noteLevel),
          then, thenTitle: then ? it.title : null,
          suggest: { key: it.key, linkType: it.linkType, title: it.title },
        });
      });
    }
    const root = promptHost._root;
    root.getElementById('d').textContent = switchesTo(item, s)
      ? `You opened ${title}. Choose where the time so far belongs, then the timer moves here.`
      : `You opened ${title}. Choose where the time so far belongs and save it.`;
    root.querySelector('.go').textContent = switchesTo(item, s) ? 'Finish and switch here' : 'Finish timer';
  }

  // Clear the prompt if the timer gets a work item or stops elsewhere.
  loops.push(setInterval(async () => {
    if (!promptHost) return;
    const st = await readState();
    if (st && (st.state === 'Stopped' || st.work)) removePrompt();
  }, 5000));

  async function autoAct(item, s, switching, blankOnly = false) {
    if (!here(item.key) || !focused()) return log('skipped after wait');
    // The timer may have changed during the wait.
    const state = await readState();
    const running = state && state.state !== 'Stopped';
    if (!state || state.work === item.key || running !== switching || (running && !state.work)) return log('timer changed during wait');
    const kind = KIND[item.linkType];
    const go = await showToast({
      text: blankOnly ? (switching ? 'Saving this timer and starting one with no work item' : 'Starting a timer with no work item')
        : switching ? `Switching timer to this ${kind}` : `Starting timer on this ${kind}`,
      seconds: TOAST_SECONDS, mode: 'countdown', pill: { text: switching ? 'Switching' : 'Starting' },
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
      ktRecordError('page start', e.message);
      showToast({ text: e.message, seconds: 8, mode: 'info', pill: { text: 'Not started', tone: 'bad' } });
    }
  }

  async function nudge(item, s) {
    if (!here(item.key) || !focused()) return;
    const state = await readState();
    if (!state || state.state !== 'Stopped') return;
    const go = await showToast({ text: `No timer is running on this ${KIND[item.linkType]}.`, seconds: 20, mode: 'confirm', confirmLabel: 'Start timer', pill: { text: 'No timer', tone: 'warn' } });
    if (!go) { dismissed.add(item.key); return; }
    try {
      await pageCall('start', await startArgs(item, { note: KTNotes.note('nudgeStart', s.noteLevel) }));
    } catch (e) {
      ktRecordError('page start', e.message);
      showToast({ text: e.message, seconds: 8, mode: 'info', pill: { text: 'Not started', tone: 'bad' } });
    }
  }

  // ---- Accessible toast ----
  // countdown: acts unless cancelled. confirm: acts only if the button is pressed. info: message only.
  // The bar drains over the toast's time and pauses while the pointer or focus is on it.
  let toastHost = null;
  let toastDone = null;
  function removeToast() {
    if (toastDone) toastDone(false);
    if (toastHost) toastHost.remove();
    toastHost = null;
    toastDone = null;
  }

  function showToast({ text, seconds, mode, confirmLabel, pill }) {
    removeToast();
    return new Promise((resolve) => {
      const buttons = mode === 'confirm'
        ? `<button type="button" class="go primary">${confirmLabel}</button><button type="button" class="no">Not now</button>`
        : `<button type="button" class="no">${mode === 'info' ? 'Dismiss' : 'Cancel'}</button>`;
      toastHost = makeCard({
        role: 'role="status" aria-live="polite"', pill,
        body: `<p class="msg"></p><div class="row">${buttons}</div><span class="bar"></span>`,
      });
      const root = toastHost._root;
      const msg = root.querySelector('.msg');
      const bar = root.querySelector('.bar');
      bar.style.setProperty('--d', `${seconds}s`);
      let left = seconds;
      const render = () => { msg.textContent = mode === 'countdown' ? `${text} in ${left}s.` : text; };
      render();

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
      // The bar's animation is the clock, so pausing it pauses the countdown too.
      bar.addEventListener('animationend', () => finish(mode === 'countdown'));
      const tick = setInterval(() => {
        const a = bar.getAnimations()[0];
        const now = Math.max(1, Math.ceil(seconds - (a ? a.currentTime : 0) / 1000));
        if (now !== left && mode === 'countdown') { left = now; render(); }
      }, 200);
      root.querySelector('.no').addEventListener('click', () => finish(false));
      const go = root.querySelector('.go');
      if (go) go.addEventListener('click', () => finish(true));
    });
  }
})();
