# Plan: one page for setup, settings, help, and support

Date: 2026-10-23
Version reviewed: 0.7.11 (`src/`, uncommitted)
Status: Built on 2026-10-23 and committed in 0.7.14. The panel was trimmed to Work, Clients, and Auto-switch (Max).
Replaces: the recommendations in `settings-walkthrough-review.md` (its defaults are out of date since 0.7.11).

## Goal

Turn `welcome.html` into the extension's one full-size page. It is the setup guide on install, and the
settings, help, and support page after that. Every preference in the toolbar panel also lives here, with
room to explain what it does, what the default is, and when to change it.

## What we have today

- `welcome.html` is a setup checklist (pin, connect, preferences), a "What it does" list, a notes callout,
  privacy, and shortcuts. It is opened on install and from the panel's "Setup guide" link.
- Preferences live only in the toolbar panel (`popup.html`): 7 groups, about 20 controls. The panel is
  340px wide, so each setting gets one line of help at most.
- `DEFAULTS` is copied in `background.js` and `popup.js`. The form logic (load, save, dim dependent rows)
  is inside `popup.js`.
- The page has its own inline styles and color tokens, separate from `ui.css`.
- Chrome has no "Options" entry for the extension, since the manifest has no `options_ui`.

## The page

One long page with a sticky side menu on wide windows and a top menu on narrow ones. Each part has a URL
hash (`#setup`, `#settings`, `#how`, `#faq`, `#support`), so the panel and notifications can link straight
to a part.

1. **Get started.** The three-step checklist, live as today. Once all steps are done it shrinks to a
   one-line "You're set up" banner with a "Show steps" link, so returning visitors land on settings.
   Step 3 becomes "Review your settings" and scrolls to the Settings part instead of describing them.
2. **Settings.** The same groups, order, names, and controls as the panel, so the two match. Each group is
   a card. Each setting has:
   - The control, saved on change, with a quiet "Saved" note (one `aria-live` region for the page).
   - One line on what it does, and one line on when to change it.
   - "Default: On." When the person's value differs, a small "Changed" tag and a "Reset" link.
   - A "Restore all defaults" button at the end, with a confirm step.
   Settings that change with the firm (work-only firms on Clients) use the same live text as the panel.
3. **How it works.** Today's "What it does," rewritten as short explainers: following your work, blank
   timers and the finish form, pausing when away, midnight splits, the badge colors, and notes on time
   entries (the current callout, kept prominent).
4. **Keyboard shortcuts.** As today, with a button that opens `chrome://extensions/shortcuts`.
5. **Questions.** A `<details>` list, one question each. Starting set:
   - Why did a timer start on its own?
   - Why didn't my timer switch when I opened a work item?
   - What is a timer with no work item, and how do I finish it?
   - What do the badge colors mean?
   - Will notes show up on invoices?
   - Do I need a Karbon tab open?
   - Why did my timer pause or split at midnight?
   - My firm books time to work items only. What changes?
   - Does the extension see my password or client data?
   - How do I change or turn off a shortcut?
6. **Support.** Live connection status (today's Troubleshooting line, in plain words), firm name,
   extension and Chrome version, diagnostic logging switch, "Send feedback" (the same prefilled email as
   the panel), "Copy details for support" (version and settings only, never client or work data), and the
   privacy policy link.

Design: keep the current look (system font, cards, the same accent and tokens), with more spacing, a
header with the icon and version, and both light and dark themes. Screen-reader structure: one `h1`,
an `h2` per part, an `h3` per settings group, real `<fieldset>`s for radio groups, and the help text tied
to each control with `aria-describedby`.

## Code changes

1. **`src/defaults.js`.** `DEFAULTS`, `MODES`, and `modeOf` move here. Loaded by `background.js`
   (`importScripts`), `popup.html`, and `welcome.html`. Not in `config.js`, since `build.sh` rewrites it.
2. **`src/prefs.js`.** The form binding moves out of `popup.js`: fill a form from storage, save on change,
   and dim dependent rows (`data-when`). Both pages call it on their own form, so the panel and the page
   can't drift. It also listens to `chrome.storage.onChanged`, so a change in one shows in the other.
3. **`src/ui.css`.** Split the shared tokens and controls (switches, radios, `.opt`, `.nest`, swatches)
   from panel layout. The panel's fixed `body { width:340px }` moves under a panel class. The page loads
   `ui.css` plus a short page layout block, and drops its own copy of the tokens.
4. **`src/welcome.html` and `welcome.js`.** Keep the file names, since `build.sh` never deletes files and a
   rename leaves a stale copy in `unpacked/`. Add the parts above, the hash menu, the per-setting help,
   default and reset, and the support details.
5. **`src/manifest.json`.** Add `"options_ui": { "page": "welcome.html", "open_in_tab": true }`, so
   "Options" in Chrome's menus opens the page. Bump to 0.8.0.
6. **`src/popup.html` and `popup.js`.** Use `prefs.js`. The footer's "Setup guide" link becomes
   "Settings and help" and opens `welcome.html#settings`. Optional: a small "?" beside each group that
   opens its card on the page.

## Privacy review

No new permissions, host access, storage keys, or network calls. `options_ui` is not a permission. The
copy button writes to the clipboard from a click, which needs no permission. Note the review in
`docs/PRIVACY.md` with "no inventory change."

## Order of work

1. Commit the current 0.7.11 changes first.
2. Shared `defaults.js` and `prefs.js`, with the panel switched over. No visible change. Check the panel.
3. Page shell: menu, parts, styles, `options_ui`.
4. Settings part with help text, defaults, and reset.
5. How it works, Questions, and Support.
6. Panel link changes.
7. Test in Chromium against the mock Karbon: first install, returning visit, panel and page side by
   side, a work-only firm, dark mode, a narrow window, and VoiceOver by headings.
8. Bump the version, run `./build.sh`, and update `claude/handoff.md` and `claude/context/timer-behavior.md`.

## Decisions for Max

1. **Panel preferences.** Keep the full list in the panel (recommended for now, since both share one
   form module), or trim the panel to Work, Clients, and Auto-switch with a link for the rest.
2. **First view for returning visitors.** Settings first once setup is done (recommended), or always the
   checklist first.
3. **Support channel.** The interim email stays, or a permanent address or help page.
4. **Help copy.** Claude drafts every setting's "what" and "when" lines and the FAQ answers for review.
