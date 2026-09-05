#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
cd "$root"
command -v docker >/dev/null || { printf 'Install Docker Engine and Docker Compose first.\n' >&2; exit 1; }
docker info >/dev/null
docker compose version
docker compose config --quiet
export KANBAN_REVISION=${KANBAN_REVISION:-$(git rev-parse HEAD 2>/dev/null || printf unknown)}
printf 'Building application and running its tests...\n'
docker compose build runtime-command-center
backup=$(bash "$root/scripts/backup.sh")
if [[ -n "$backup" ]]; then printf 'Private rollback backup: %s\n' "$backup"; fi
if ! docker compose up -d --no-deps --no-build --wait --wait-timeout 90 runtime-command-center; then
  if [[ -n "$backup" ]]; then
    printf 'Health check failed; restoring previous image...\n' >&2
    bash "$root/scripts/rollback.sh" "$backup"
  else
    docker compose stop runtime-command-center
    printf 'First startup failed. Container and private data are retained for diagnosis.\n' >&2
  fi
  exit 1
fi
printf 'Monitor is healthy. Published address: '
docker compose port runtime-command-center 8787
printf 'Open the dashboard to configure your Sub2API site.\n'
printf 'Read the private initialization code on this server: docker compose exec runtime-command-center cat /data/setup-code\n'
