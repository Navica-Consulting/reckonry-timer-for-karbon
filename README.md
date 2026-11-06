# Reckonry Timer for Karbon

A Chrome extension (Manifest V3) that adds stopwatch tools to the Karbon timer: start from anywhere, auto-switch, reminders, and lock or idle pause. Published by Navica LLC.

## Layout

```
src/            The one source. Edit only here.
build.sh        Builds both targets from src/.
unpacked/       Build output for Load unpacked (production and stage). Not tracked.
dist/           Versioned zips for upload. Not tracked.
docs/           Release process and privacy policy tracking.
site/           Landing page for timer.reckonry.ai. Plain HTML, no outside scripts.
store/          Store listing text, icon, and screenshot renderer.
```

## Build

```bash
./build.sh
```

This writes:

- `unpacked/production`: app2.karbonhq.com, the store candidate.
- `unpacked/stage`: webapp-stage.karbonhq.com. Never publish this one.
- `dist/reckonry-timer-for-karbon-<ver>.zip`: the store upload.

In Chrome, open `chrome://extensions`, turn on Developer mode, and Load unpacked each folder once. After that, rerun `./build.sh` and click Reload.

## Website

https://timer.reckonry.ai is GitHub Pages. `scripts/privacy-page.sh` copies `site/` and renders `docs/privacy-policy.md` as `/privacy`. The Privacy page workflow deploys it on every version tag, or run it by hand from Actions to publish a site change sooner.

To preview `site/` locally:

```bash
python3 -m http.server 8796 --directory site
```

## Releasing

See [docs/RELEASING.md](docs/RELEASING.md). Any change to permissions, host access, or what data the extension reads or stores also needs the privacy review in [docs/PRIVACY.md](docs/PRIVACY.md).
