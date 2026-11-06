#!/usr/bin/env bash
# Uploads a zip to the Chrome Web Store and submits it for review (API v2).
#
#   scripts/cws-publish.sh dist/reckonry-timer-for-karbon-<ver>.zip
#   scripts/cws-publish.sh --status    read-only check that sign-in works; changes nothing
#   scripts/cws-publish.sh --cancel    withdraws the version in review, so a newer one can be submitted
#
# Needs these in the environment:
#   CWS_PUBLISHER_ID   Developer Dashboard, Account, Publisher ID
#   CWS_ITEM_ID        the extension's ID in the store
#   CWS_TOKEN          an OAuth access token with the chromewebstore scope. Locally:
#                      gcloud auth print-access-token --impersonate-service-account=<sa email> \
#                        --scopes=https://www.googleapis.com/auth/chromewebstore
#   CWS_PUBLISH_TYPE   optional: DEFAULT_PUBLISH (live after review, the default) or
#                      STAGED_PUBLISH (waits for you to press Publish after review)
set -euo pipefail
zip=${1:?usage: cws-publish.sh <zip> | --status | --cancel}
: "${CWS_PUBLISHER_ID:?}" "${CWS_ITEM_ID:?}" "${CWS_TOKEN:?}"
case "$zip" in *-stage.zip) echo "Refusing to publish a stage build: $zip" >&2; exit 1 ;; esac

api=https://chromewebstore.googleapis.com
item=publishers/$CWS_PUBLISHER_ID/items/$CWS_ITEM_ID
auth=(-H "Authorization: Bearer $CWS_TOKEN")
field() { python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('$1') or '')"; }

if [ "$zip" = --cancel ]; then
  curl -sS --fail-with-body "${auth[@]}" -X POST "$api/v2/$item:cancelSubmission"
  echo
  zip=--status
fi

if [ "$zip" = --status ]; then
  curl -sS --fail-with-body "${auth[@]}" "$api/v2/$item:fetchStatus"
  echo
  exit
fi

echo "Uploading $zip"
r=$(curl -sS --fail-with-body "${auth[@]}" -X POST -T "$zip" "$api/upload/v2/$item:upload")
echo "$r"
state=$(field uploadState <<<"$r")
# Large packages finish processing asynchronously.
for _ in $(seq 1 30); do
  case "$state" in IN_PROGRESS|UPLOAD_IN_PROGRESS) ;; *) break ;; esac
  sleep 10
  state=$(curl -sS --fail-with-body "${auth[@]}" "$api/v2/$item:fetchStatus" | field lastAsyncUploadState)
  echo "Upload state: $state"
done
[ "$state" = SUCCEEDED ] || { echo "Upload did not succeed: $state" >&2; exit 1; }

echo "Submitting for review (${CWS_PUBLISH_TYPE:-DEFAULT_PUBLISH})"
curl -sS --fail-with-body "${auth[@]}" -X POST -H "Content-Type: application/json" \
  -d "{\"publishType\":\"${CWS_PUBLISH_TYPE:-DEFAULT_PUBLISH}\"}" "$api/v2/$item:publish"
echo
