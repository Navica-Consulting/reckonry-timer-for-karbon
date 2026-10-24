# Plan: light, dark, and system theme

Status: proposed, not built. Written 2026-10-23.

## Where things stand
- The toolbar panel, finish form, and setup guide already follow the system theme through `prefers-color-scheme`. There is no way to choose a theme.
- `src/ui.css` holds the panel and finish form colors as tokens. `src/welcome.html` has its own copy of most of them inline.
- Two colors sit outside the tokens: the error red and the danger button, each with its own dark media query.
- The pop-ups inside Karbon (`content.js`, shadow DOM) are always a dark card, in any theme.
- The toolbar icon is one dark navy set, which is hard to see on a dark Chrome toolbar.
- Dark icons now exist: `src/icons/icon{16,32,48,128}-dark.png`. They are the same stopwatch with a light gray body (#e8eaed) and a lighter blue hand (#8ab4f8). Nothing uses them yet.

## The setting
- A new Preferences group, "Appearance", placed just above Troubleshooting.
- One radio choice, using the existing `fieldset.group` pattern: "Match system" (default), "Light", and "Dark".
- Stored as `theme: 'system' | 'light' | 'dark'` in `storage.sync`, so it follows the user to other computers, like the other settings.
- The open panel changes as soon as the user picks an option.

## Step 1: tokens only (no visible change)
- Add `--danger`, `--card`, and `--ok` to `ui.css`, and replace the hard-coded reds and the two extra dark media queries with them.
- Move the setup guide onto `ui.css` tokens. Keep its page layout styles in `welcome.html`, but drop its own `:root` color block.
- Restructure the dark tokens so they apply in two cases:
  - `:root[data-theme="dark"]` (forced dark).
  - `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ... } }` (system).
- Set `color-scheme` to match (`light` or `dark` when forced), so form controls and scroll bars follow.
- Check: with no `data-theme`, every page looks exactly as it does today.

## Step 2: apply the setting
- New `src/theme.js`, loaded first in `<head>` of `popup.html`, `complete.html`, and `welcome.html`.
- It sets `data-theme` on `<html>` from `storage.sync`, and listens on `storage.onChanged` so other open pages update too.
- `chrome.storage` is async, so the popup could flash the wrong theme for a frame. To avoid that, `theme.js` also keeps a copy in `localStorage` (shared by all extension pages) and applies it synchronously before first paint, then corrects it from `storage.sync`.
- Add `theme: 'system'` to the `DEFAULTS` in `popup.js` and `background.js`. Moving `DEFAULTS` into a shared `src/defaults.js` (already recommended in `settings-walkthrough-review.md`) would make this a one-line change; worth doing first.
- The setup guide's large icon swaps to `icon128-dark.png` in dark mode. Two `<img>` tags shown or hidden by `data-theme` keeps this in CSS.

## Step 3: toolbar icon
- Chrome has no manifest field for a dark toolbar icon, and the background service worker can't read `prefers-color-scheme`.
- The icon should follow Chrome's own appearance, not the extension's theme setting, since it sits on Chrome's toolbar. A user who picks "Light" for the panel but runs Chrome in dark mode still needs the light-colored icon.
- Approach, with no new permission: the popup, the setup guide, and the Karbon content script read `matchMedia('(prefers-color-scheme: dark)')`, send it to the background on load and on change, and the background calls `chrome.action.setIcon` with the matching set.
- The background saves the last known scheme in `storage.local` and applies it on browser start, so the icon is right before any page opens.
- Limit: if Chrome changes appearance while no extension page or Karbon tab is open, the icon updates the next time one opens.
- Rejected: an offscreen document could watch the scheme all the time, but it needs the `offscreen` permission and a store review for little gain.
- Notifications keep the light icon, since the OS draws them on its own background. The store listing icon stays light.

## Step 4: pop-ups inside Karbon (optional)
- Today they are a dark card on Karbon's light page, which reads as an alert and has good contrast.
- Option A, recommended: leave them as they are.
- Option B: give them a light card in light mode and keep the dark card in dark mode. `content.js` would read `theme` from `storage.sync` and, for "Match system", use `matchMedia`.

## Privacy review
Per `docs/PRIVACY.md`, this adds storage keys, so the review applies. It is low impact:
- `theme` in `storage.sync`: a display preference, synced like the other settings. It is covered by the existing "Settings" row, so no policy change.
- The color scheme in `storage.local`: add it to the data inventory as display state.
- The `localStorage` copy of the theme: add it to the data inventory. It never leaves the device.
- No new permissions, host access, or network calls.

## Testing
- Each page (panel, finish form, setup guide) in all three settings, with macOS in light mode and in dark mode. That is 18 views.
- Changing the setting while the panel and setup guide are both open updates both.
- No flash of the wrong theme when the panel opens.
- Text and accent contrast at 4.5:1 or better in both themes, including muted text on `--soft` backgrounds.
- Focus outlines, the switch control, and the error state are visible in both themes.
- Toolbar icon switches when Chrome's appearance changes with the panel open, and is right after a browser restart.
- High contrast (`forced-colors: active`) still works.

## Files touched
- `src/ui.css`, `src/theme.js` (new), `src/popup.html`, `src/popup.js`, `src/complete.html`, `src/welcome.html`, `src/welcome.js`, `src/background.js`, `src/content.js`, `src/manifest.json` (version only).
- `docs/PRIVACY.md` for the inventory rows.

## Questions for Max
- Default to "Match system"? Recommended, since it keeps today's behavior.
- Leave the Karbon pop-ups as a dark card (Option A)?
- Should the toolbar icon follow Chrome's appearance (recommended) or the extension's theme setting?
