#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <SPACE_ID> [BRANCH]"
  echo "Example: $0 sisbas/AzollaPhy main"
  exit 1
fi

SPACE_ID="$1"
BRANCH="${2:-main}"
SPACE_URL="https://huggingface.co/spaces/${SPACE_ID}"

if [[ ! -f "Dockerfile" ]]; then
  echo "ERROR: Dockerfile not found in current directory."
  exit 1
fi

if [[ ! -f "README.md" ]]; then
  echo "ERROR: README.md not found in current directory."
  exit 1
fi

if ! grep -q "sdk: docker" README.md; then
  echo "ERROR: README.md YAML header must contain 'sdk: docker'."
  exit 1
fi

echo "Preparing Hugging Face Space remote: ${SPACE_URL}"
if git remote get-url hf >/dev/null 2>&1; then
  git remote set-url hf "${SPACE_URL}"
else
  git remote add hf "${SPACE_URL}"
fi

echo "Pushing current HEAD to ${SPACE_ID} (${BRANCH})..."
git push hf HEAD:"${BRANCH}"

echo "Done. Open https://huggingface.co/spaces/${SPACE_ID} and check Build logs."
