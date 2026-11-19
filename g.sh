#!/bin/bash
# One-time setup of the Check GHIN endpoint (see tools/ghin-check-fn/README.md). Run in Cloud Shell:
#   curl -sL mvwns.com/g.sh|bash
set -e
P=msg-dev-74f88
echo "== Turning on the Google services the button needs (takes a minute) =="
gcloud services enable secretmanager.googleapis.com cloudfunctions.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project=$P
N=$(gcloud projects describe $P --format='value(projectNumber)')
SA="$N-compute@developer.gserviceaccount.com"
if ! gcloud secrets describe GH_DISPATCH_TOKEN --project=$P >/dev/null 2>&1; then
  echo
  read -rsp ">>> Paste the GitHub key (github_pat_...) and press Enter (it won't show): " T < /dev/tty; echo
  case "$T" in github_pat_*) ;; *) echo "That doesn't look like the GitHub key (should start with github_pat_). Run the command again."; exit 1;; esac
  printf '%s' "$T" | gcloud secrets create GH_DISPATCH_TOKEN --data-file=- --replication-policy=automatic --project=$P
  unset T
  echo "Key saved in Secret Manager."
fi
gcloud secrets add-iam-policy-binding GH_DISPATCH_TOKEN --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor --project=$P --quiet >/dev/null
gcloud projects add-iam-policy-binding $P --member="serviceAccount:$SA" --role=roles/cloudbuild.builds.builder --condition=None --quiet >/dev/null
echo "== Downloading the button code =="
rm -rf ~/golf && git clone -q --depth 1 https://github.com/DavidsMalibu99/golf ~/golf
cd ~/golf/tools/ghin-check-fn
echo "== Publishing the ghin-check endpoint (2-3 minutes) =="
gcloud functions deploy ghin-check --gen2 --project=$P --region=us-central1 \
  --runtime=nodejs22 --entry-point=ghinCheck --trigger-http --allow-unauthenticated \
  --max-instances=2 --memory=256Mi --set-secrets=GH_DISPATCH_TOKEN=GH_DISPATCH_TOKEN:latest --quiet
echo
echo "ALL DONE - Check GHIN endpoint is live."
