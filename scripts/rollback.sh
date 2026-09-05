#!/usr/bin/env bash
set -euo pipefail
if [[ $# -ne 1 ]]; then printf 'Usage: bash scripts/rollback.sh /private/backup/directory\n' >&2; exit 2; fi
backup=$(cd -- "$1" && pwd -P)
(cd "$backup" && sha256sum -c SHA256SUMS)
project=$(cat "$backup/project.txt")
[[ "$project" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || { printf 'Invalid Compose project.\n' >&2; exit 1; }
docker compose --project-name "$project" -f "$backup/compose.yaml" -f "$backup/image.yaml" \
  up -d --no-deps --no-build --wait --wait-timeout 90 runtime-command-center
printf 'Previous image restored. Persistent data was preserved.\n'
