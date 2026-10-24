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

// A "None" choice doesn't count when the firm requires a role or task type; its ID varies by list.
const emptySel = (sel) => !sel.value || sel.value === 'NONE' || ((sel.selectedOptions[0] || {}).textContent || '').trim() === 'None';

// Shows a running timer's own role or task type. With none set it shows None, never the list default.
function fillCurrent(sel, list, key, noun) {
  const opts = list.slice();
  const none = opts.find((o) => o.key === 'NONE' || o.name === 'None');
  if (!none) opts.unshift({ key: '', name: 'None' });
  if (key && !opts.some((o) => o.key === key)) opts.unshift({ key, name: `Current ${noun}` });
  sel.replaceChildren(...opts.map((o) => el('option', { value: o.key }, o.name)));
  sel.value = key || (none ? none.key : '');
}

// A chosen-item box that reopens its search when clicked, so it needs no Change button.
// Clicks on a control inside it, like the work item's open link, keep their own job.
function clickToChange(box, label, fn) {
  Object.assign(box, { tabIndex: 0, title: label });
  box.setAttribute('role', 'button');
  box.classList.add('pickable');
  box.addEventListener('click', (e) => { if (!e.target.closest('button, a')) fn(); });
  box.addEventListener('keydown', (e) => {
    if (e.target !== box || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    fn();
  });
}

// Work search: each list floats under its field while focus is in the field or the list.
// box names the ids: q (field), combo (wrapper), drop (floating list).
function openDrop(box, on) {
  $(box.drop).hidden = !on;
  $(box.q).setAttribute('aria-expanded', String(on));
}

function bindDrop(box) {
  const combo = $(box.combo);
  combo.addEventListener('focusin', () => openDrop(box, true));
  combo.addEventListener('focusout', (e) => { if (!combo.contains(e.relatedTarget)) openDrop(box, false); });
  // Keeps focus in the field on click, so the list doesn't close before the pick lands.
  $(box.drop).addEventListener('mousedown', (e) => e.preventDefault());
  combo.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;
    if (e.key === 'Escape' && !$(box.drop).hidden) { e.preventDefault(); $(box.q).focus(); openDrop(box, false); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const opts = [...$(box.drop).querySelectorAll('button')];
    if (!opts.length) return;
    e.preventDefault();
    openDrop(box, true);
    const i = opts.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') opts[Math.min(i + 1, opts.length - 1)].focus();
    else if (i <= 0) $(box.q).focus();
    else opts[i - 1].focus();
  });
}
