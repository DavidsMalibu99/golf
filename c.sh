#!/bin/bash
# Publishes the course-map endpoint (tools/course-map-fn). Run in Cloud Shell: curl -sL mvwns.com/c.sh|bash
set -e
P=msg-dev-74f88
N=$(gcloud projects describe $P --format='value(projectNumber)')
SA="$N-compute@developer.gserviceaccount.com"
gcloud services enable firestore.googleapis.com --project=$P >/dev/null
gcloud projects add-iam-policy-binding $P --member="serviceAccount:$SA" --role=roles/datastore.user --condition=None --quiet >/dev/null
rm -rf ~/golf && git clone -q --depth 1 https://github.com/DavidsMalibu99/golf ~/golf
cd ~/golf/tools/course-map-fn
echo "== Publishing the course-map endpoint (2-3 minutes) =="
gcloud functions deploy course-map --gen2 --project=$P --region=us-central1 \
  --runtime=nodejs22 --entry-point=courseMap --trigger-http --allow-unauthenticated \
  --max-instances=3 --memory=512Mi --timeout=150s --quiet >/dev/null 2>&1 && echo "ALL DONE - course-map is live." || echo "Publish failed - tell Claude."
