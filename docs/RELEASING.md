# Releasing

> Retired 2026-11-19. The extension is unpublished and mothballed. The Release workflow is disabled and `CWS_AUTO_PUBLISH` is `false`. Kept for reference only.

Store item ID: `gnkfhgggnmdfpddfghlhjdmailhbigde`
Publisher ID: `967ac224-b69a-4e8d-913c-74c12ebee2c5`
Developer Dashboard: https://chrome.google.com/webstore/devconsole

1. Bump `version` in `src/manifest.json`. The store rejects an upload with an unchanged version.
2. Run `./build.sh`, then Reload both unpacked builds and test against stage and production.
3. If permissions, host access, storage, or network calls changed, do the review in
   [PRIVACY.md](PRIVACY.md): update the data inventory, `docs/privacy-policy.md`, and the store's
   Privacy practices tab. The hosted policy publishes itself from the tag.
4. Commit, tag, and push:

   ```bash
   git tag v<version> && git push origin main --tags
   ```

5. The Release workflow (`.github/workflows/release.yml`) checks that the tag matches the
   manifest, builds, and attaches the zips to a GitHub release. It uploads the store zip and
   submits it for review only when the repository variable `CWS_AUTO_PUBLISH` is `true`. It's
   `true` since 2026-11-06 (first automated submission: 0.7.39), so a tag goes to review on its
   own. If a version changes permissions, host access, or what data it handles, update
   [store-privacy-tab.md](store-privacy-tab.md) and the store's Privacy practices tab before
   tagging. To go back to uploading by hand, run `gh variable set CWS_AUTO_PUBLISH --body false`. The Privacy page
   workflow publishes `docs/privacy-policy.md` to https://timer.reckonry.ai/privacy, and the
   landing page in `site/` to https://timer.reckonry.ai, from the same tag. Check both runs under Actions on GitHub.

A new version can't be submitted while another is still in review. Wait for approval before
tagging, or withdraw the one in review: Actions, Release, Run workflow, action `cancel` (tested
2026-11-06). Then tag the new version. To upload by hand instead, use `reckonry-timer-for-karbon-<version>.zip` from the GitHub
release or `dist/`, never the `-stage` zip.

## Before the first public release

- Drop "(beta)" from `name` in `src/manifest.json` (it was "(beta draft)" until 0.7.40).
- Privacy tab changes, such as a justification for a new permission, are always made by hand.

## Automatic store upload (set up and tested 2026-10-23)

Google Cloud project: `reckonry-timer-for-karbon`. Service account:
`cws-publisher@reckonry-timer-for-karbon.iam.gserviceaccount.com`. The steps below are a record
of how it was set up. If the service account binding is refused right after the account is
created, wait a minute and run that one command again.

The workflow can also upload and submit for review. It signs in to Google Cloud with Workload
Identity Federation, so no service account key is stored anywhere, and only this repository can
use it. Nothing is stored in Google Cloud and nothing bills: service accounts, Workload Identity
Federation, and the Chrome Web Store API are free, and the project needs no billing account.

1. Open the Google Cloud Console, pick the project at the top, click the Cloud Shell icon
   (`>_`), and paste this. It prints the values for step 3 at the end.

   ```bash
   PROJECT_ID=$(gcloud config get-value project)
   REPO=Navica-Consulting/reckonry-timer-for-karbon
   SA=cws-publisher@$PROJECT_ID.iam.gserviceaccount.com
   PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
   gcloud services enable chromewebstore.googleapis.com iamcredentials.googleapis.com sts.googleapis.com --project=$PROJECT_ID
   gcloud iam service-accounts create cws-publisher --project=$PROJECT_ID
   gcloud iam workload-identity-pools create github --location=global --project=$PROJECT_ID
   gcloud iam workload-identity-pools providers create-oidc github-actions --location=global \
     --workload-identity-pool=github --project=$PROJECT_ID \
     --issuer-uri=https://token.actions.githubusercontent.com \
     --attribute-mapping=google.subject=assertion.sub,attribute.repository=assertion.repository \
     --attribute-condition="assertion.repository=='$REPO'"
   gcloud iam service-accounts add-iam-policy-binding $SA --project=$PROJECT_ID \
     --role=roles/iam.workloadIdentityUser \
     --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"
   echo; echo "Service account: $SA"
   echo "Provider: projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github-actions"
   ```

2. In the Chrome Web Store Developer Dashboard, open Account and add the service account email
   printed above. Only one service account can be added per publisher.
3. Set the repository variables (these are IDs, not secrets):

   ```bash
   gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER --body "<provider printed above>"
   gh variable set GCP_SERVICE_ACCOUNT --body "<service account printed above>"
   gh variable set CWS_PUBLISHER_ID --body "967ac224-b69a-4e8d-913c-74c12ebee2c5"
   gh variable set CWS_ITEM_ID --body "gnkfhgggnmdfpddfghlhjdmailhbigde"
   ```

4. Test without publishing: in GitHub, open Actions, then Release, then Run workflow. On a manual
   run it only reads the item's status from the store. A green run means sign-in works.

   Optional: set `CWS_PUBLISH_TYPE` to `STAGED_PUBLISH` so an approved version waits for you to
   press Publish in the dashboard. The default, `DEFAULT_PUBLISH`, goes live after review.

Until `CWS_ITEM_ID` is set and `CWS_AUTO_PUBLISH` is `true`, a tag only builds and creates the
GitHub release. Turn it on with `gh variable set CWS_AUTO_PUBLISH --body true`.

To publish from your Mac instead, with your own Google account allowed to impersonate the
service account:

```bash
CWS_TOKEN=$(gcloud auth print-access-token --impersonate-service-account=$SA --scopes=https://www.googleapis.com/auth/chromewebstore) \
CWS_PUBLISHER_ID=<publisher id> CWS_ITEM_ID=<extension id> \
scripts/cws-publish.sh dist/reckonry-timer-for-karbon-<version>.zip
```
