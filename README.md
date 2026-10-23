# Reckonry Timer for Karbon

A Chrome extension (Manifest V3) that adds stopwatch tools to the Karbon timer: start from anywhere, auto-switch, reminders, and lock or idle pause. Published by Navica LLC.

## Layout

```
src/            The one source. Edit only here.
build.sh        Builds both targets from src/.
unpacked/       Build output for Load unpacked (production and stage). Not tracked.
dist/           Versioned zips for upload. Not tracked.
docs/           Release process and privacy policy tracking.
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

## Releasing

See [docs/RELEASING.md](docs/RELEASING.md). Any change to permissions, host access, or what data the extension reads or stores also needs the privacy review in [docs/PRIVACY.md](docs/PRIVACY.md).
