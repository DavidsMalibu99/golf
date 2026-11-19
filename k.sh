#!/bin/bash
# Replace the GitHub key used by the Check GHIN endpoint. Run in Cloud Shell:  curl -sL mvwns.com/k.sh|bash
P=msg-dev-74f88
for try in 1 2 3; do
  echo
  read -rsp ">>> Paste the GitHub key (github_pat_...) and press Enter (it won't show): " RAW < /dev/tty; echo
  T=$(printf '%s' "$RAW" | grep -o 'github_pat_[A-Za-z0-9_]*' | head -1); unset RAW
  if [ -z "$T" ]; then echo "No github_pat_ key found in what was pasted. Try again."; continue; fi
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $T" -H "Accept: application/vnd.github+json" \
    https://api.github.com/repos/DavidsMalibu99/golf/actions/workflows/ghin-update.yml/runs?per_page=1)
  if [ "$CODE" = "200" ]; then
    echo "GitHub accepted the key (${#T} characters)."
    printf '%s' "$T" | gcloud secrets versions add GH_DISPATCH_TOKEN --data-file=- --project=$P; unset T
    echo "== Restarting the endpoint so it uses the new key (about 2 minutes) =="
    cd ~/golf/tools/ghin-check-fn && git -C ~/golf pull -q
    gcloud functions deploy ghin-check --gen2 --project=$P --region=us-central1 --runtime=nodejs22 --entry-point=ghinCheck \
      --trigger-http --allow-unauthenticated --max-instances=2 --memory=256Mi \
      --set-secrets=GH_DISPATCH_TOKEN=GH_DISPATCH_TOKEN:latest --quiet >/dev/null 2>&1 && echo "ALL DONE - new key in use." || echo "Restart failed."
    exit 0
  fi
  echo "GitHub did not accept that key (HTTP $CODE, ${#T} characters). Copy it again from the GitHub tab and paste."
done
