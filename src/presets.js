// Presets: a named role and task type pair, one click away in the panel.
// Shared by the panel (popup.js) and the settings page (welcome.js). Needs ui.js.
// Kept in storage.sync, apart from DEFAULTS, so Restore all defaults leaves them alone.
// Only your label and Karbon's role and task type keys are stored, never their names.
/* eslint-disable no-unused-vars */
const PRESET_MAX = 8;
const PRESET_NAME_MAX = 30;

const KTPresets = {
  // 0.7.36 called them shortcuts; that unreleased key moves over once.
  async load() {
    const { presets, shortcuts } = await chrome.storage.sync.get(['presets', 'shortcuts']);
    if (!presets && Array.isArray(shortcuts)) {
      await KTPresets.save(shortcuts);
      await chrome.storage.sync.remove('shortcuts');
      return KTPresets.load();
    }
    return Array.isArray(presets) ? presets.filter((p) => p && p.id) : [];
  },

  save(list) {
    const clean = list.slice(0, PRESET_MAX).map((p) => ({
      id: p.id, name: String(p.name || '').trim().slice(0, PRESET_NAME_MAX),
      roleKey: p.roleKey || null, taskTypeKey: p.taskTypeKey || null,
    }));
    return chrome.storage.sync.set({ presets: clean });
  },

  newId: () => Math.random().toString(36).slice(2, 10),

  // The button's text: your label, or else the task type's name, then the role's.
  label(p, lists) {
    const name = (list, key) => ((list || []).find((o) => o.key === key) || {}).name;
    const lk = lists || {};
    return p.name || name(lk.taskTypes, p.taskTypeKey) || name(lk.roles, p.roleKey) || 'Preset';
  },

  // Role and task type in words, for screen readers and tooltips.
  detail(p, lists) {
    const name = (list, key, noun) => ((list || []).find((o) => o.key === key) || {}).name || `no ${noun}`;
    const lk = lists || {};
    return `${name(lk.roles, p.roleKey, 'role')}, ${name(lk.taskTypes, p.taskTypeKey, 'task type')}`;
  },
};
