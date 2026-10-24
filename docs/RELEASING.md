# Releasing

Store item ID: `gnkfhgggnmdfpddfghlhjdmailhbigde`
Publisher ID: `967ac224-b69a-4e8d-913c-74c12ebee2c5`
Developer Dashboard: https://chrome.google.com/webstore/devconsole

1. Bump `version` in `src/manifest.json`. The store rejects an upload with an unchanged version.
2. Run `./build.sh`, then Reload both unpacked builds and test against stage and production.
3. If permissions, host access, storage, or network calls changed, do the review in
   [PRIVACY.md](PRIVACY.md): update the data inventory, `docs/privacy-policy.md`, the hosted
   policy, and the store's Privacy practices tab.
4. Commit, tag, and push:

   ```bash
   git tag v<version> && git push origin main --tags
   ```

5. The Release workflow (`.github/workflows/release.yml`) checks that the tag matches the
   manifest, builds, and attaches the zips to a GitHub release.
6. Download `reckonry-timer-for-karbon-<version>.zip` from that release (or use `dist/`), and
   upload it in the Developer Dashboard under Package. Never upload the `-stage` zip. Submit for
   review. A new version can't be submitted while another is still in review.

Store upload is manual by choice. The optional automation below is off until its repository
variables are set.

## Before the first public release

- Drop "(beta draft)" from `name` in `src/manifest.json`.
- The first upload of a new item has to be done by hand in the Developer Dashboard, with the
  Store listing and Privacy tabs filled in. After that, the workflow can upload and publish.
- Privacy tab changes, such as a justification for a new permission, are always made by hand.

## Optional: automatic store upload (not set up)

The workflow can also upload and submit for review. It signs in to Google Cloud with Workload
Identity Federation, so no service account key is stored anywhere, and only this repository can
use it. Nothing is stored in Google Cloud and nothing bills: service accounts, Workload Identity
Federation, and the Chrome Web Store API are free, and the project needs no billing account.

1. In a Google Cloud project, run (set `PROJECT_ID` first):

   ```bash
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
   ```

2. In the Chrome Web Store Developer Dashboard, open Account, add the service account's email
   (`cws-publisher@<project>.iam.gserviceaccount.com`), and copy the Publisher ID. Only one
   service account can be added per publisher.
3. Set the repository variables (these are IDs, not secrets):

   ```bash
   gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER --body "projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github-actions"
   gh variable set GCP_SERVICE_ACCOUNT --body "$SA"
   gh variable set CWS_PUBLISHER_ID --body "<publisher id>"
   gh variable set CWS_ITEM_ID --body "<extension id>"
   ```

   Optional: set `CWS_PUBLISH_TYPE` to `STAGED_PUBLISH` so an approved version waits for you to
   press Publish in the dashboard. The default, `DEFAULT_PUBLISH`, goes live after review.

Until `CWS_ITEM_ID` is set, the workflow only builds and creates the GitHub release.

To publish from your Mac instead, with your own Google account allowed to impersonate the
service account:

```bash
CWS_TOKEN=$(gcloud auth print-access-token --impersonate-service-account=$SA --scopes=https://www.googleapis.com/auth/chromewebstore) \
CWS_PUBLISHER_ID=<publisher id> CWS_ITEM_ID=<extension id> \
scripts/cws-publish.sh dist/reckonry-timer-for-karbon-<version>.zip
```
