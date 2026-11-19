# Reckonry Timer for Karbon (archived)

> [!CAUTION]
> **Do not install or use this extension.** Karbon has told us in writing that it does not approve of this extension, because it relies on Karbon's internal web endpoints and session cookies rather than its public API. That puts it outside Karbon's [Terms of Use](https://karbonhq.com/terms/) and [Acceptable Use Policy](https://karbonhq.com/acceptable-use-policy/). Using it could get your firm's Karbon account suspended or terminated.
>
> The project is **discontinued and archived**. It has been removed from the Chrome Web Store, gets no updates, and accepts no issues or pull requests. The source is published only so people can read it and learn from it (Manifest V3 service worker, content scripts, a toolbar panel, idle and lock detection, and a settings page). Navica LLC is not affiliated with or endorsed by Karbon. "Karbon" is Karbon's trademark.
>
> Want this in Karbon itself? Vote for the feature idea in the [Loft](https://theloft.bykarbon.com/c/feature-request/timer-that-follows-your-work-auto-switch-on-work-and-pause-when-you-re-away).

A Chrome extension (Manifest V3) that added stopwatch tools to the Karbon timer: start from anywhere, auto-switch, reminders, and lock or idle pause. Built by Navica LLC in October and November 2026 and mothballed on 2026-11-19. The rest of this README describes how it worked.

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

## Releasing (retired)

The Release workflow is disabled and store auto-publish is off. For history only, see [docs/RELEASING.md](docs/RELEASING.md). Any change to permissions, host access, or what data the extension reads or stores also needs the privacy review in [docs/PRIVACY.md](docs/PRIVACY.md).

## License

MIT, see [LICENSE](LICENSE). The license covers this code only. It grants no rights to use Karbon's services, name, or marks.
