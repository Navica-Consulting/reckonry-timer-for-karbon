// Shortcut buttons: a named role and task type pair, one click away in the panel.
// Shared by the panel (popup.js) and the settings page (welcome.js). Needs ui.js.
// Kept in storage.sync, apart from DEFAULTS, so Restore all defaults leaves them alone.
// Only your label and Karbon's role and task type keys are stored, never their names.
/* eslint-disable no-unused-vars */
const SHORTCUT_MAX = 8;
const SHORTCUT_NAME_MAX = 30;

const KTShortcuts = {
  async load() {
    const { shortcuts = [] } = await chrome.storage.sync.get('shortcuts');
    return Array.isArray(shortcuts) ? shortcuts.filter((s) => s && s.id) : [];
  },

  save(list) {
    const clean = list.slice(0, SHORTCUT_MAX).map((s) => ({
      id: s.id, name: String(s.name || '').trim().slice(0, SHORTCUT_NAME_MAX),
      roleKey: s.roleKey || null, taskTypeKey: s.taskTypeKey || null,
    }));
    return chrome.storage.sync.set({ shortcuts: clean });
  },

  newId: () => Math.random().toString(36).slice(2, 10),

  // The button's text: your label, or else the task type's name, then the role's.
  label(s, lists) {
    const name = (list, key) => ((list || []).find((o) => o.key === key) || {}).name;
    const lk = lists || {};
    return s.name || name(lk.taskTypes, s.taskTypeKey) || name(lk.roles, s.roleKey) || 'Shortcut';
  },

  // Role and task type in words, for screen readers and the button's tooltip.
  detail(s, lists) {
    const name = (list, key, noun) => ((list || []).find((o) => o.key === key) || {}).name || `no ${noun}`;
    const lk = lists || {};
    return `${name(lk.roles, s.roleKey, 'role')}, ${name(lk.taskTypes, s.taskTypeKey, 'task type')}`;
  },
};
