// Recent extension errors, kept in storage.local for the feedback form's Logs field.
// Only the extension's own messages are kept, scrubbed of links and record keys, so no client or work details.
const KT_ERROR_KEY = 'errorLog';
const KT_ERROR_MAX = 15;

const ktScrub = (msg) => String(msg || 'Unknown error')
  .replace(/https?:\/\/\S+/g, '{link}')
  .replace(/\b(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{10,14}\b/g, '{key}')
  .replace(/\s+/g, ' ')
  .slice(0, 160);

// where: which part failed, like "panel" or "start". Never throws, so callers needn't guard it.
async function ktRecordError(where, msg) {
  try {
    if (!chrome.runtime || !chrome.runtime.id) return;
    const { [KT_ERROR_KEY]: list = [] } = await chrome.storage.local.get(KT_ERROR_KEY);
    const last = list[list.length - 1];
    const x = { at: Date.now(), where, msg: ktScrub(msg) };
    // A repeat, like a read failing every minute, counts on the last line instead of filling the log.
    if (last && last.where === x.where && last.msg === x.msg) Object.assign(last, { at: x.at, n: (last.n || 1) + 1 });
    else list.push(x);
    await chrome.storage.local.set({ [KT_ERROR_KEY]: list.slice(-KT_ERROR_MAX) });
  } catch {}
}

// Uncaught errors in an extension page or the service worker. Not for content scripts,
// where the page's own errors would come through too.
function ktWatchErrors(where) {
  self.addEventListener('error', (e) => ktRecordError(where, e.message));
  self.addEventListener('unhandledrejection', (e) => ktRecordError(where, (e.reason && e.reason.message) || e.reason));
}

async function ktErrorLines() {
  const { [KT_ERROR_KEY]: list = [] } = await chrome.storage.local.get(KT_ERROR_KEY);
  if (!list.length) return ['Recent errors: none'];
  return ['Recent errors (UTC):', ...list.map((x) => `${new Date(x.at).toISOString().slice(0, 16).replace('T', ' ')} ${x.where}: ${x.msg}${x.n ? ` (${x.n} times)` : ''}`)];
}
