// Default settings, shared by background.js, content.js, the panel, and the settings page.
// Kept out of config.js, which build.sh rewrites for each target.
/* eslint-disable no-unused-vars */
const DEFAULTS = {
  autoStartWork: true, workStartSeconds: 1, autoStartContacts: false, contactStartSeconds: 5,
  remindContacts: true, contactNudgeSeconds: 60,
  autoSwitch: true, autoSwitchContacts: false, switchSeconds: 1, remindNoTimer: false, nudgeSeconds: 60,
  pauseOnLock: true, idlePause: false, idleMinutes: 10, autoResume: true,
  longTimerAlert: true, longTimerHours: 3, showIdleBadge: true, badgeWhere: 'everywhere', splitAtMidnight: true,
  noteLevel: 'auto', debugLog: false, toolbarTheme: 'dark',
};

// Each "no timer running" choice is one radio group stored as two switches: auto-start and remind.
const MODES = {
  startMode: ['autoStartWork', 'remindNoTimer'],
  contactMode: ['autoStartContacts', 'remindContacts'],
};
const modeOf = (s, name) => { const [a, r] = MODES[name]; return s[a] ? 'auto' : s[r] ? 'nudge' : 'none'; };
