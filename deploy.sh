#!/bin/sh
# Deploy CogniCard to Cloud Run.
#
# No key is passed in: the service already holds GEMINI_API_KEY, and `--update-env-vars`
# is the only flag that would touch it. The old instructions pasted the key on the command
# line every time, which put it in the shell history for no reason.
set -e
cd "$(dirname "$0")"

export CLOUDSDK_PYTHON=/opt/homebrew/bin/python3   # gcloud crashes on the system Python 3.9

npm run build

# The bundle must never carry the key — nginx injects it server-side at runtime. This is
# the check that would have caught the 2026-07 leak.
if grep -rqE 'AQ\.[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{30,}' dist/assets/ 2>/dev/null; then
  echo "ABORT: an API key ended up in dist/ — do not deploy this build." >&2
  exit 1
fi

gcloud run deploy cognicard-academic \
  --source . \
  --region=asia-southeast1 \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080
