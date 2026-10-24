// Builds each shot's browser window, backdrop page, and toolbar panel from data attributes,
// so the five pages hold only their copy and scene. The extension's own pages load in iframes.
const dark = matchMedia('(prefers-color-scheme: dark)').matches;
const ICON = `../src/icons/icon32${dark ? '-light' : ''}.png`;
const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;

function workPage(title, client, crumb = 'Work') {
  const skel = (n) => '<b></b>'.repeat(n);
  return `<div class="app"><div class="side"><b></b><b></b><b class="on"></b><b></b><b></b><b></b><b></b></div>
    <div class="main"><div class="crumb">${crumb}</div><h2>${title}</h2><div class="client">${client || ''}</div>
      ${client ? '<div class="ptabs"><span>Tasks</span><span>Timeline</span><span>Notes</span><span>Details</span></div>' : ''}
      <div class="box">${skel(4)}</div><div class="box">${skel(3)}</div><div class="box">${skel(4)}</div></div></div>`;
}

for (const b of document.querySelectorAll('.browser')) {
  const d = b.dataset;
  const content = b.innerHTML;
  // Badge colors follow background.js: green running, yellow with dark text for "!", red for off.
  const ink = d.badgeColor === '#f2c94c' ? ';color:#1f2933' : '';
  const badge = d.badge ? `<span class="badge" style="${d.badgeColor ? `background:${d.badgeColor}${ink}` : ''}">${d.badge}</span>` : '';
  b.innerHTML = `
    <div class="tabs"><div class="dots"><i></i><i></i><i></i></div><div class="tab">${d.tab || ''}</div></div>
    <div class="toolbar">
      ${svg('M15 6l-6 6 6 6')}${svg('M9 6l6 6-6 6')}${svg('M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4')}
      <div class="addr">${svg('M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z')}${d.url || ''}</div>
      ${svg('M12 3l2.6 5.6 6 .7-4.5 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6L3.4 9.3l6-.7z')}
      <div class="ext ${d.open ? 'on' : ''}"><img src="${ICON}" alt="">${badge}</div>
      ${svg('M12 5h.01M12 12h.01M12 19h.01')}
    </div>
    <div class="viewport">${d.title ? workPage(d.title, d.client, d.crumb) : ''}${content}</div>`;
}

// Panels size to their content, like Chrome's popup does.
function fit(f) {
  const doc = f.contentDocument;
  if (!doc || !doc.body) return;
  f.style.height = `${Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight)}px`;
}
for (const f of document.querySelectorAll('.popup iframe')) {
  f.addEventListener('load', () => { fit(f); setTimeout(() => fit(f), 700); setTimeout(() => fit(f), 1400); });
}

// Page card (shot 2): content.js's own card styles and markup, read from the source so they stay in step.
async function pageCard(host, { pill, text, button, left }) {
  const src = await (await fetch('../src/content.js')).text();
  const css = src.match(/const CARD_CSS = `([\s\S]*?)`;/)[1];
  const watch = src.match(/const STOPWATCH = '([^']*)'/)[1];
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${css}
      .c{position:relative;right:auto;bottom:auto;animation:none}
      .bar{animation:none;transform:scaleX(${left})}</style>
    <div class="c"><div class="brand">${watch}Reckonry Timer<span class="pill">${pill}</span></div>
      <p class="msg">${text}</p><div class="row"><button type="button" class="no">${button}</button></div><span class="bar"></span></div>`;
}
