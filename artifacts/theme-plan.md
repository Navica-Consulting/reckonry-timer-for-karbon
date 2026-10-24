# Theme and toolbar icon

Status: built in 0.7.5. Decided 2026-10-23 (Max).

## Decisions
- No theme setting. The panel, finish form, and setup guide keep following the system theme through `prefers-color-scheme`, as they already did.
- The pop-ups inside Karbon stay a dark card in every theme.
- The toolbar icon color is the person's choice, not tied to any theme. Some light Chrome themes still have a dark toolbar, so detecting the theme would guess wrong.

## What was built
- Setting: `toolbarTheme: 'light' | 'dark'` in `storage.sync`, default `'light'` (the original icon). It names the theme the icon suits, since that's how people think about it, not the icon's own color.
- Icons: `src/icons/icon{16,32,48,128}.png` is the dark icon. `icon{16,32,48,128}-light.png` is the light icon: a light gray body (#e8eaed) and a lighter blue hand (#8ab4f8).
- Background: `applyIcon()` calls `chrome.action.setIcon` on install, on browser start, and when the setting changes.
- Setup guide, step 1 (pin): "Pick the icon color that's easiest to see on your toolbar," with two choices, "For light themes" and "For dark themes," each shown on a sample toolbar. Choosing here doesn't mark step 3 (preferences) as done.
- Preferences: a "Toolbar icon" group just above Troubleshooting, with the same two choices.
- Manifest icons (0.7.6): `icon{16,32,48,128}-face.png` is the dark icon with a white face and a thin white outline, so it shows on the extensions page and store in light and dark themes. Chrome has no theme variant for manifest icons.
- Unchanged: the toolbar default, notifications, and the setup guide's header icon use the dark icon.

## Privacy
- One new `storage.sync` key holding a display preference. It's covered by the existing "Settings" row in `docs/PRIVACY.md`; no policy change.
- No new permissions, host access, or network calls.
