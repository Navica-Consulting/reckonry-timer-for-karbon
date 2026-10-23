# Releasing

1. Bump `version` in `src/manifest.json`. The store rejects an upload with an unchanged version.
2. Run `./build.sh`, then Reload both unpacked builds and test against stage and production.
3. If permissions, host access, storage, or network calls changed, do the review in
   [PRIVACY.md](PRIVACY.md): update the data inventory, `docs/privacy-policy.md`, the hosted
   policy, and the store's Privacy practices tab.
4. Commit, then tag: `git tag v<version>`.
5. Upload `dist/reckonry-timer-for-karbon-<version>.zip` (never the `-stage` zip) and submit for
   review.

## Before the first public release

- Drop "(beta draft)" from `name` in `src/manifest.json`.
- The first upload of a new item has to be done by hand in the Developer Dashboard, with the
  Store listing and Privacy tabs filled in. After that, the API can upload and publish.
