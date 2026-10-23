// Shared note wording for time entry descriptions. Loaded by background.js, content.js, popup.html.
// Notes never name other work items or clients, because descriptions can appear on invoices.
// level: "auto" = the extension acted on its own; "manual" = you clicked; "always" = text you typed.
(() => {
  const EVENTS = {
    switchedAway: { level: 'auto', text: () => 'Timer stopped automatically when switching to another work item' },
    switchedIn: { level: 'auto', text: () => 'Timer started automatically when switching from another work item' },
    autoStart: { level: 'auto', text: (c) => `Timer started automatically when this ${c.kind || 'work item'} was opened` },
    lockPause: { level: 'auto', text: () => 'Timer paused: screen locked' },
    unlockResume: { level: 'auto', text: () => 'Timer resumed: screen unlocked' },
    idlePause: { level: 'auto', text: (c) => `Timer paused: idle for ${c.minutes} minutes` },
    idleResume: { level: 'auto', text: () => 'Timer resumed: activity after idle' },
    sleepGap: { level: 'auto', text: (c) => `Away from ${c.from} to ${c.to}: computer asleep. Review this entry` },
    dayEndStop: { level: 'auto', text: () => 'Timer stopped automatically at end of day; time continues in the next day\'s entry' },
    dayEndStopPaused: { level: 'auto', text: () => 'Paused timer saved automatically at end of day' },
    dayStartRestart: { level: 'auto', text: () => 'Timer restarted automatically after midnight, continuing from the previous day' },
    manualStart: { level: 'manual', text: () => 'Timer started from the extension' },
    nudgeStart: { level: 'manual', text: () => 'Timer started from a reminder' },
    manualPause: { level: 'manual', text: () => 'Timer paused from the extension' },
    manualResume: { level: 'manual', text: () => 'Timer resumed from the extension' },
    manualStop: { level: 'manual', text: () => 'Timer stopped and saved from the extension' },
    quickNote: { level: 'always', text: (c) => c.text },
  };

  const fmt = (d) => d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

  // level setting: 'off' | 'auto' | 'all'. Returns the stamped note, or null when skipped.
  function note(event, level, ctx = {}) {
    const e = EVENTS[event];
    if (!e) return null;
    if (e.level !== 'always') {
      if (level === 'off') return null;
      if (e.level === 'manual' && level !== 'all') return null;
    }
    const body = String(e.text(ctx)).trim().replace(/[.\s]+$/, '');
    return body ? `[${fmt(new Date())}] ${body}.` : null;
  }

  globalThis.KTNotes = { note, fmt };
})();
