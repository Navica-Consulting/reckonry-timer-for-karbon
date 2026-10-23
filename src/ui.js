// Shared helpers for the toolbar panel (popup.js) and the finish form (complete.js).
/* eslint-disable no-unused-vars */
const $ = (id) => document.getElementById(id);
const TAGS = { Contact: 'contact', Organization: 'organization', ClientGroup: 'client group' };

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  n.append(...kids.filter((k) => k != null));
  return n;
}

function elapsedSeconds(s) {
  let secs = s.recordedSeconds || 0;
  if (s.state === 'Started' && s.startDateTime) secs += Math.max(0, (Date.now() - Date.parse(s.startDateTime)) / 1000);
  return Math.floor(secs);
}
const hms = (t) => [Math.floor(t / 3600), Math.floor((t % 3600) / 60), t % 60].map((n) => String(n).padStart(2, '0')).join(':');
const spoken = (t) => {
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60);
  return h ? `${h} hours ${m} minutes` : `${m} minutes`;
};

// Fills a role or task type list, preset to selectedKey when it is in the list, otherwise Karbon's default.
function fillSelect(sel, list, selectedKey, noun) {
  const opts = list.slice();
  if (selectedKey && !opts.some((o) => o.key === selectedKey)) opts.unshift({ key: selectedKey, name: `Last used ${noun}` });
  if (!opts.length) opts.push({ key: '', name: `Open Karbon once to load your ${noun} list` });
  sel.replaceChildren(...opts.map((o) => el('option', { value: o.key }, o.name)));
  const fallback = opts.find((o) => o.isDefault) || opts[0];
  sel.value = selectedKey && opts.some((o) => o.key === selectedKey) ? selectedKey : fallback.key;
}
