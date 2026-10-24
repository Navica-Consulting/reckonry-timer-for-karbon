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
function clickToChange(box, label, fn) {
  Object.assign(box, { tabIndex: 0, title: label });
  box.setAttribute('role', 'button');
  box.classList.add('pickable');
  box.addEventListener('click', fn);
  box.addEventListener('keydown', (e) => {
    if (e.target !== box || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    fn();
  });
}

// ---- Client and Work fields ----
// Karbon books a timer to one thing: a work item, or a client where the firm allows it.
// Each field shows its pick in a box (click it to search again, x to clear), or a search box whose results drop down.
// o: { id, label, kind: 'work' | 'contact', onPick(item), onClear(), onError(reply), describedBy,
//      scope(): for Work, the client whose work to search, or null for all work }
// Uses the page's send().
function pickField(host, o) {
  const ids = { q: `${o.id}Q`, combo: `${o.id}Combo`, drop: `${o.id}Drop`, head: `${o.id}Head`, list: `${o.id}List` };
  const noun = o.kind === 'work' ? 'work' : 'client';
  const title = el('span', { class: 't' });
  const sub = el('span', { class: 's' });
  const clear = el('button', { type: 'button', class: 'clear', 'aria-label': `Clear ${noun}`, title: `Clear ${noun}` }, '×');
  const box = el('div', { class: 'chosen', hidden: '' }, el('div', { class: 'grow' }, title, sub), clear);
  const q = el('input', { id: ids.q, type: 'search', autocomplete: 'off', 'aria-controls': ids.list, 'aria-expanded': 'false',
    placeholder: o.kind === 'work' ? 'Search work items' : 'Search clients' });
  if (o.describedBy) q.setAttribute('aria-describedby', o.describedBy);
  const picker = el('div', { id: ids.combo, class: 'combo' }, q,
    el('div', { id: ids.drop, class: 'drop', hidden: '' },
      el('div', { id: ids.head, class: 'muted' }), el('ul', { id: ids.list, class: 'items', 'aria-live': 'polite' })));
  host.replaceChildren(el('label', { for: ids.q, class: 'field' }, ...[].concat(o.label)), box, picker);

  const f = { item: null, editing: false, q, box, ids };
  const fail = (r) => { $(ids.head).textContent = ''; if (o.onError) o.onError(r); };
  const rows = (head, items) => {
    $(ids.head).textContent = head;
    $(ids.list).replaceChildren(...items.map((it) => el('li', {}, pickRow(it, () => f.pick(it)))));
  };
  // With a client set, Work lists only that client's work. Karbon gives a work item's client by name only.
  const scope = () => (o.scope && o.scope()) || null;
  const scoped = (items) => {
    const c = scope();
    const ofClient = (it) => it.client === c;
    return c ? items.filter(ofClient).slice(0, 6) : items.slice(0, 6);
  };

  // Shows an item in the box, or the empty search box. Skipped while you're searching, unless forced.
  f.show = (item, force) => {
    if (f.editing && !force) return;
    f.editing = false;
    f.item = item && item.title ? item : null;
    title.textContent = f.item ? f.item.title : '';
    if (f.item && TAGS[f.item.linkType]) title.append(' ', el('span', { class: 'tag' }, TAGS[f.item.linkType]));
    // A work item's subtitle names its client, which Client already shows.
    sub.textContent = (o.kind !== 'work' && f.item && f.item.subtitle) || '';
    box.hidden = !f.item;
    picker.hidden = !!f.item;
    // Old results go, so the next search starts from recents.
    q.value = '';
    $(ids.head).textContent = '';
    $(ids.list).replaceChildren();
    openDrop(ids, false);
  };
  f.pick = (item) => { f.show(item, true); o.onPick(item); };
  f.edit = () => {
    f.editing = true;
    box.hidden = true;
    picker.hidden = false;
    q.focus();
  };
  f.invalid = (on) => (on ? q.setAttribute('aria-invalid', 'true') : q.removeAttribute('aria-invalid'));

  // Work shows recent work items before you type. Karbon has no recents list for clients.
  f.recents = async (force) => {
    if (o.kind !== 'work') return rows('', []);
    if (!force && !(await chrome.runtime.sendMessage({ type: 'canReach' }))) {
      $(ids.head).replaceChildren(el('button', { type: 'button', class: 'linklike', onclick: () => f.recents(true) }, 'Show recent work items'));
      $(ids.list).replaceChildren();
      return;
    }
    $(ids.head).textContent = 'Loading recent work items.';
    const r = await send('recents', { take: scope() ? 25 : 6 });
    if (!r || !r.ok) return fail(r);
    const items = scoped(r.result);
    const c = scope();
    rows(items.length ? (c ? `Recent work for ${c}` : 'Recent work items') : (c ? `No recent work for ${c}. Search for it.` : 'No recent work items.'), items);
  };

  let seq = 0;
  let debounce = null;
  const search = async (term) => {
    const mine = ++seq;
    $(ids.head).textContent = 'Searching.';
    const r = await send('search', { term, kind: o.kind, take: scope() ? 25 : 6 });
    if (mine !== seq) return;
    if (!r || !r.ok) return fail(r);
    const items = o.kind === 'work' ? scoped(r.result) : r.result;
    const none = scope() ? `No matching work for ${scope()}.` : 'No matches.';
    rows(items.length ? `${items.length} result${items.length === 1 ? '' : 's'}` : none, items);
  };

  clickToChange(box, `Change ${noun}`, f.edit);
  clear.addEventListener('click', (e) => {
    e.stopPropagation();
    f.show(null, true);
    if (o.onClear) o.onClear();
    q.focus();
  });
  bindDrop(ids);
  q.addEventListener('focus', () => { if (!q.value.trim() && !$(ids.list).children.length) f.recents(); });
  q.addEventListener('input', () => {
    openDrop(ids, true);
    clearTimeout(debounce);
    const term = q.value.trim();
    if (term.length < 2) { seq++; debounce = setTimeout(() => f.recents(), 200); return; }
    debounce = setTimeout(() => search(term), 350);
  });
  // Escape backs out of a search when the field already has a pick.
  q.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !f.item || !$(ids.drop).hidden) return;
    e.preventDefault();
    f.show(f.item, true);
    box.focus();
  });
  return f;
}

// A work item names its client but doesn't carry its key. Finds the client by an exact name match.
async function findClient(name) {
  if (!name) return null;
  const r = await send('search', { term: name, kind: 'contact', take: 10 });
  const hits = r && r.ok ? r.result.filter((c) => c.title === name) : [];
  return hits.length === 1 ? hits[0] : null;
}

// Client filled in from a picked work item: its name now, its key once found.
async function fillClient(field, name) {
  field.show(name ? { title: name } : null, true);
  const found = await findClient(name);
  if (found && field.item && field.item.title === name && !field.item.key) field.show(found, true);
}

// The client to book to, with its key, or null when it can't be found.
async function keyedClient(item) {
  if (!item) return null;
  return item.key ? item : findClient(item.title);
}

function pickRow(item, onPick, lead) {
  const b = el('button', { type: 'button', class: 'item', onclick: onPick },
    el('span', { class: 't' }, lead ? el('span', { class: 'lead' }, `${lead} `) : null, item.title || 'Untitled',
      TAGS[item.linkType] ? el('span', { class: 'tag' }, TAGS[item.linkType]) : null),
    item.subtitle ? el('span', { class: 's' }, item.subtitle) : null);
  b.setAttribute('aria-label', `${lead ? `${lead} ` : 'Choose '}${item.title || 'item'}${item.subtitle ? `, ${item.subtitle}` : ''}`);
  return b;
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
