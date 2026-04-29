#!/usr/bin/env bash
set -euo pipefail

project_id="${1:-}"
secret_name="${2:-}"

if [[ -z "${project_id}" || -z "${secret_name}" ]]; then
  printf ''
  exit 0
fi

gcloud secrets versions access latest \
  --project "${project_id}" \
  --secret "${secret_name}" \
  2>/dev/null || printf ''
