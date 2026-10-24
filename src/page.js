// Runs in Karbon's page context (MAIN world). Learns the tenant, user, API host, and timer state
// by observing Karbon's own calls, listens for StopwatchChanged on the SignalR hub, and runs
// timer actions through karbon.js with the signed-in session. Talks to content.js only via window.postMessage.
(() => {
  if (window.__ktPage) return;
  window.__ktPage = true;

  // base: the regional API origin (for example https://us3.karbonhq.com).
  const K = { tenant: null, user: null, base: null, debug: false };
  const SW_RE = /\/time\/api\/([A-Za-z0-9]+)\/stopwatches\/([A-Za-z0-9]+)/;
  const API_RE = /^(https:\/\/[a-z0-9-]+\.karbonhq\.com)\/(time|work|tenant|todo|contentitems|search)\/api\//i;
  const learnBase = (url) => {
    const m = String(url).match(API_RE);
    if (m && m[1] !== location.origin) K.base = m[1];
  };
  try { performance.getEntriesByType('resource').forEach((e) => learnBase(e.name)); } catch {}

  // Learn the tenant, user, and API host without waiting for Karbon to fetch the stopwatch.
  // 1) Karbon's readable bootstrap cookie (default tenant only, so it must match this page's tenant).
  // 2) Karbon's own session service, which follows the tenant in the URL.
  const pageTenant = () => location.pathname.split('/')[1] || null;
  function learnFromPage() {
    try {
      const raw = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith('bootstrap-cookie-'));
      if (raw) {
        const o = {};
        decodeURIComponent(raw.slice(raw.indexOf('=') + 1)).split('&').forEach((pair) => {
          const i = pair.indexOf('=');
          if (i > 0) o[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1));
        });
        const t = pageTenant();
        if (o.tenantPermaKey && o.userProfilePermaKey && (!t || t === o.tenantPermaKey)) {
          if (!K.tenant) K.tenant = o.tenantPermaKey;
          if (!K.user && K.tenant === o.tenantPermaKey) K.user = o.userProfilePermaKey;
        }
        if (!K.base && o.dataCenterUrl) K.base = new URL(o.dataCenterUrl).origin;
      }
    } catch {}
    try {
      const app = window.StagingApp;
      const inst = app && (app.__deprecatedInstance__ || (app._applicationInstances && [...app._applicationInstances][0]));
      const ses = inst && inst.lookup && inst.lookup('service:session');
      if (ses && ses.isLoggedIn) {
        const t = ses.tenantPermaKey;
        if (t && (!K.tenant || K.tenant === t)) {
          K.tenant = t;
          if (!K.user) K.user = ses.userProfilePermaKey || null;
        }
        if (!K.base && ses.siteBaseUrl) K.base = new URL(ses.siteBaseUrl).origin;
      }
    } catch {}
    return !!(K.tenant && K.user && K.base);
  }
  learnFromPage();
  const origFetch = window.fetch.bind(window);

  const post = (msg) => window.postMessage({ src: 'kt-page', ...msg }, location.origin);
  const log = (...a) => { if (K.debug) console.info('[KT]', ...a); };

  // Karbon's own word on whether this tab is signed in: true, false, or null before the app has booted.
  function loggedIn() {
    try {
      const app = window.StagingApp;
      const inst = app && (app.__deprecatedInstance__ || (app._applicationInstances && [...app._applicationInstances][0]));
      const ses = inst && inst.lookup && inst.lookup('service:session');
      return ses ? !!ses.isLoggedIn : null;
    } catch { return null; }
  }

  // Keys for the shared API code. The tenant in this tab's URL wins over the cookie's default tenant.
  function keys() {
    if (loggedIn() === false) throw Object.assign(new Error(KT_SIGNED_OUT), { signedOut: true });
    if (!(K.tenant && K.user && K.base)) learnFromPage();
    if (!K.base) {
      try { performance.getEntriesByType('resource').forEach((e) => learnBase(e.name)); } catch {}
    }
    if (!K.tenant) K.tenant = pageTenant();
    return { tenant: K.tenant, user: K.user, base: K.base };
  }

  const api = KTKarbon({
    fetch: origFetch,
    keys,
    route: () => location.pathname.replace(/^\/[^/]+/, '') || '/',
    onState: (state) => post({ event: 'state', state }),
    onTimeSettings: (settings) => post({ event: 'timeSettings', settings }),
    onSaved: (pick) => post({ event: 'saved', pick }),
    log,
  });

  // Observe Karbon's own fetch calls (read-only): learn keys, API host, and state.
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    learnBase(url);
    const res = await origFetch(input, init);
    const m = url.match(SW_RE);
    if (m) {
      K.tenant = m[1];
      K.user = m[2];
      res.clone().json().then((j) => j && api.noteStopwatch(j.stopwatch, { tenant: K.tenant, user: K.user, base: K.base })).catch(() => {});
    }
    return res;
  };

  // Listen to the SignalR hub for timer changes made in other tabs or devices.
  let refetchTimer = null;
  const onHubMessage = (ev) => {
    if (typeof ev.data !== 'string' || !ev.data.includes('StopwatchChanged')) return;
    clearTimeout(refetchTimer);
    refetchTimer = setTimeout(() => api.run('getState').catch(() => {}), 300);
  };
  const seen = new WeakSet();
  const wsSend = WebSocket.prototype.send;
  WebSocket.prototype.send = function (d) {
    if (!seen.has(this) && /karbonAppHub/.test(this.url)) {
      seen.add(this);
      this.addEventListener('message', onHubMessage);
    }
    return wsSend.apply(this, arguments);
  };

  // ---- Settings pushed from content.js ----
  const setDebug = ({ on }) => { K.debug = !!on; return { debug: K.debug }; };
  const setKeys = ({ tenant, user, base }) => {
    if (!K.tenant && tenant && location.pathname.split('/')[1] === tenant) K.tenant = tenant;
    if (!K.user && user && K.tenant === tenant) K.user = user;
    if (!K.base && base) K.base = base;
    learnFromPage();
    return { ready: !!(K.tenant && K.user && K.base), loggedIn: loggedIn(), tenant: K.tenant, user: K.user, base: K.base };
  };
  const LOCAL = { setDebug, setKeys };

  window.addEventListener('message', async (ev) => {
    if (ev.source !== window || ev.origin !== location.origin) return;
    const m = ev.data;
    if (!m || m.src !== 'kt-cs' || !m.id) return;
    try {
      log('command', m.cmd);
      const result = LOCAL[m.cmd] ? LOCAL[m.cmd](m.args || {}) : await api.run(m.cmd, m.args);
      post({ id: m.id, ok: true, result });
    } catch (e) {
      console.warn('[KT] command failed', m.cmd, String((e && e.message) || e));
      post({ id: m.id, ok: false, error: String((e && e.message) || e), signedOut: !!(e && e.signedOut) });
    }
  });
})();
