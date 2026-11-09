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

// Selects a role or task type by key. No key, or one the list doesn't have, selects None (or the first choice).
function selectKey(sel, key) {
  const opts = [...sel.options];
  const none = opts.find((o) => o.value === 'NONE' || o.textContent.trim() === 'None') || opts[0];
  const hit = key && opts.find((o) => o.value === key);
  if (hit || none) sel.value = (hit || none).value;
}

// Karbon's prefill for a work item you just picked: its own role and task type, from your last entry on it
// or its budget. Null when Karbon has neither, so what's already chosen stays, as in Karbon's timer.
async function workPrefill(item) {
  if (!item || (item.linkType && item.linkType !== 'WorkItem')) return null;
  const r = await chrome.runtime.sendMessage({ type: 'cmd', cmd: 'prefill', args: { workKey: item.key, linkType: 'WorkItem' } });
  const p = r && r.ok && r.result;
  return p && (p.source === 'work' || p.source === 'budget') ? p : null;
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
//      scope(): for Work, the client item whose work to search, or null for all work }
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
  let form = null; // the new work item form, while it's open
  const fail = (r) => { $(ids.head).textContent = ''; if (o.onError) o.onError(r); };
  // Every Work list ends with a way to create the work item you didn't find, titled from the search.
  const createRow = () => {
    const term = q.value.trim();
    return el('li', {}, el('button', { type: 'button', class: 'item more', onclick: () => f.create(term) },
      term.length >= 2 ? `+ Create work item "${term}"` : '+ Create work item'));
  };
  // Shows the first `shown` items, with Load more for the rest.
  const rows = (head, items, shown = items.length) => {
    $(ids.head).textContent = head;
    const lis = items.slice(0, shown).map((it) => el('li', {}, pickRow(it, () => f.pick(it))));
    if (items.length > shown) {
      lis.push(el('li', {}, el('button', { type: 'button', class: 'item more',
        onclick: () => { rows(head, items, shown + MORE_STEP); $(ids.list).querySelectorAll('button.item')[shown]?.focus(); } }, 'Load more')));
    }
    if (o.kind === 'work') lis.push(createRow());
    $(ids.list).replaceChildren(...lis);
  };
  // With a client set, Work lists that client's work. A client known by name only (its key not found yet)
  // falls back to matching search results by client name.
  const scope = () => (o.scope && o.scope()) || null;
  const scoped = (items) => {
    const c = scope();
    return c ? items.filter((it) => it.client === c.title) : items;
  };
  // One client's work, kept for a minute so typing filters it without asking Karbon again.
  let cache = null;
  const clientWork = async (c) => {
    if (cache && cache.key === c.key && Date.now() - cache.at < 60000) return { ok: true, result: cache.result };
    const r = await send('clientWork', { client: c.key, linkType: c.linkType });
    if (!r || !r.ok) return r;
    // Under each item: its start date, plus its client for a group, whose work spans its members.
    const group = c.linkType === 'ClientGroup';
    r.result.items.forEach((it) => { it.subtitle = [group ? it.client : '', startLabel(it)].filter(Boolean).join(' · '); });
    cache = { key: c.key, at: Date.now(), result: r.result };
    return r;
  };

  // Shows an item in the box, or the empty search box. Skipped while you're searching, unless forced.
  f.show = (item, force) => {
    if (f.editing && !force) return;
    f.editing = false;
    if (form) { form.remove(); form = null; }
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
  // Swaps the search for the new work item form. The new item is picked as if found by search.
  f.create = (term) => {
    openDrop(ids, false);
    f.editing = true;
    box.hidden = true;
    picker.hidden = true;
    form = el('div', { class: 'newwork' });
    host.append(form);
    newWorkForm(form, {
      id: o.id, title: term, client: scope(),
      onDone: (item) => { cache = null; f.pick(item); },
      onCancel: () => { const had = f.item; f.show(had, true); (had ? box : q).focus(); },
    });
  };
  f.invalid = (on) => (on ? q.setAttribute('aria-invalid', 'true') : q.removeAttribute('aria-invalid'));

  // Work shows recent work items before you type, or with a client set, that client's current work.
  // Karbon has no recents list for clients.
  f.recents = async (force) => {
    if (o.kind !== 'work') return rows('', []);
    const c = scope();
    if (!force && !(await chrome.runtime.sendMessage({ type: 'canReach' }))) {
      $(ids.head).replaceChildren(el('button', { type: 'button', class: 'linklike', onclick: () => f.recents(true) }, 'Show recent work items'));
      $(ids.list).replaceChildren();
      return;
    }
    if (c && c.key) {
      const mine = ++seq;
      $(ids.head).textContent = `Loading work for ${c.title}.`;
      const r = await clientWork(c);
      if (mine !== seq) return;
      if (!r || !r.ok) return fail(r);
      const { now, later } = splitWork(r.result.items);
      const head = now.length ? `Current work for ${c.title}` : later.length ? `No current work for ${c.title}.` : `No work for ${c.title}.`;
      return rows(head, now.concat(later), now.length);
    }
    $(ids.head).textContent = 'Loading recent work items.';
    const r = await send('recents', { take: c ? 25 : 6 });
    if (!r || !r.ok) return fail(r);
    const items = scoped(r.result).slice(0, 6);
    rows(items.length ? (c ? `Recent work for ${c.title}` : 'Recent work items') : (c ? `No recent work for ${c.title}. Search for it.` : 'No recent work items.'), items);
  };

  let seq = 0;
  let debounce = null;
  const search = async (term) => {
    const mine = ++seq;
    const c = o.kind === 'work' ? scope() : null;
    $(ids.head).textContent = 'Searching.';
    // A client's work is searched in full here, current work first.
    if (c && c.key) {
      const r = await clientWork(c);
      if (mine !== seq) return;
      if (!r || !r.ok) return fail(r);
      const { now, later } = splitWork(r.result.items.filter(matches(term)));
      const items = now.concat(later);
      return rows(items.length ? count(items.length) : `No matching work for ${c.title}.`, items, MORE_STEP);
    }
    const r = await send('search', { term, kind: o.kind, take: o.kind === 'work' ? 25 : 6 });
    if (mine !== seq) return;
    if (!r || !r.ok) return fail(r);
    // Karbon's search gives no dates, so open work goes first, then planned, then completed.
    const items = o.kind === 'work' ? rankByStatus(scoped(r.result)) : r.result;
    rows(items.length ? count(items.length) : c ? `No matching work for ${c.title}.` : 'No matches.', items, MORE_STEP);
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

// ---- New work item ----
// For work that search didn't find: a title, a client, and an optional template. It starts today and is
// assigned to you, as Karbon's Add Work form does by default. o: { id, title, client, onDone(item), onCancel() }
function newWorkForm(host, o) {
  const ids = { title: `${o.id}NewTitle`, tmpl: `${o.id}NewTmpl`, err: `${o.id}NewErr` };
  const title = el('input', { id: ids.title, type: 'text', autocomplete: 'off', 'aria-describedby': ids.err });
  const tmpl = el('select', { id: ids.tmpl }, el('option', { value: '' }, 'No template'));
  const err = el('p', { id: ids.err, class: 'err', role: 'alert', hidden: '' });
  const clientHost = el('div');
  const create = el('button', { type: 'button', class: 'btn primary' }, 'Create');
  const cancel = el('button', { type: 'button', class: 'btn' }, 'Cancel');
  host.replaceChildren(
    el('p', { class: 'muted' }, 'New work item. It starts today and is assigned to you.'),
    el('label', { for: ids.title, class: 'field' }, 'Title'), title, clientHost,
    el('label', { for: ids.tmpl, class: 'field' }, 'Template'), tmpl, err,
    el('div', { class: 'row end' }, cancel, create));
  title.value = o.title || '';

  const fail = (r) => {
    err.textContent = (r && r.code === 'SIGNED_OUT' ? 'You are signed out of Karbon. Sign in, then try again.' : r && r.error) || 'Something went wrong.';
    err.hidden = false;
  };
  const client = pickField(clientHost, { id: `${o.id}New`, label: 'Client', kind: 'contact', onError: fail, onPick: () => tmpl.focus() });
  // Starts with the client already chosen above, when it can own work.
  const owner = (c) => c && c.key && c.linkType !== 'ClientGroup';
  keyedClient(o.client).then((c) => { if (owner(c) && !client.item) client.show(c, true); }).catch(() => {});

  // Like Karbon's form, a template names the work until you type your own title.
  let auto = '';
  send('workTemplates').then((r) => {
    if (r && r.ok) tmpl.append(...r.result.map((t) => el('option', { value: t.key }, t.name)));
  });
  tmpl.addEventListener('change', () => {
    if (title.value.trim() && title.value !== auto) return;
    title.value = auto = tmpl.value ? tmpl.selectedOptions[0].textContent : '';
  });

  const submit = async () => {
    err.hidden = true;
    const c = client.item;
    if (!title.value.trim()) { fail({ error: 'Give the work item a title.' }); return title.focus(); }
    if (!c || !c.key) { fail({ error: 'Choose the client this work is for.' }); return client.q.focus(); }
    if (!owner(c)) { fail({ error: 'Work belongs to a person or an organization, not a client group. Choose one of its members.' }); return client.edit(); }
    create.disabled = true;
    create.textContent = 'Creating';
    const r = await send('createWork', { title: title.value, clientKey: c.key, clientLinkType: c.linkType, templateKey: tmpl.value || null });
    create.disabled = false;
    create.textContent = 'Create';
    if (!r || !r.ok) return fail(r);
    o.onDone(r.result);
  };
  create.addEventListener('click', submit);
  cancel.addEventListener('click', () => o.onCancel());
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  host.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    e.preventDefault();
    o.onCancel();
  });
  title.focus();
}

// ---- Ordering work ----
const MORE_STEP = 8;
const count = (n) => `${n} result${n === 1 ? '' : 's'}`;
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
// Every word of the search appears in the title, in any order.
const matches = (term) => {
  const words = term.toLowerCase().split(/\s+/).filter(Boolean);
  return (it) => { const t = (it.title || '').toLowerCase(); return words.every((w) => t.includes(w)); };
};
// Current work is open and already started. Both parts run newest start date first.
function splitWork(items) {
  const t = today();
  const newest = (a, b) => (b.start || '').localeCompare(a.start || '');
  const now = items.filter((it) => !it.done && it.start && it.start <= t).sort(newest);
  const later = items.filter((it) => !now.includes(it)).sort(newest);
  return { now, later };
}
function startLabel(it) {
  if (!it.start) return '';
  const d = new Date(`${it.start}T12:00:00`);
  const opts = { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) };
  const when = d.toLocaleDateString(undefined, opts);
  return it.done ? `Completed · started ${when}` : it.start > today() ? `Starts ${when}` : `Started ${when}`;
}
function rankByStatus(items) {
  const rank = (it) => (it.status === 'Completed' ? 2 : it.status === 'Planned' ? 1 : 0);
  return items.map((it, i) => [it, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([it]) => it);
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
