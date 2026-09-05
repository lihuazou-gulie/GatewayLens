#!/usr/bin/env bash
set -euo pipefail
umask 077
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
cd "$root"
container=$(docker compose ps -a -q runtime-command-center)
if [[ -z "$container" ]]; then exit 0; fi
backup_root=${KANBAN_BACKUP_DIR:-${HOME}/.local/state/sub2api-monitor/backups}
mkdir -p -- "$backup_root"
backup_root=$(cd -- "$backup_root" && pwd -P)
case "$backup_root/" in "$root/"*) printf 'Backup directory must be outside the source tree.\n' >&2; exit 1;; esac
backup=$(mktemp -d "$backup_root/$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")
image=$(docker inspect --format '{{.Image}}' "$container")
project=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$container")
tag="sub2api-monitor:rollback-$(basename "$backup" | tr '[:upper:]' '[:lower:]')"
docker image tag "$image" "$tag"
docker inspect "$container" | docker run --rm -i --network none --read-only --user 1000:1000 \
  --cap-drop ALL --security-opt no-new-privileges:true \
  --mount "type=bind,source=$root/scripts/capture-compose.mjs,target=/capture-compose.mjs,readonly" \
  --entrypoint node "$image" /capture-compose.mjs > "$backup/compose.yaml"
printf '%s\n' "$project" > "$backup/project.txt"
printf 'services:\n  runtime-command-center:\n    image: %s\n' "$tag" > "$backup/image.yaml"
# The archive is redirected straight into the private backup directory.
docker run --rm --network none --read-only --user 1000:1000 --cap-drop ALL \
  --security-opt no-new-privileges:true --volumes-from "$container:ro" \
  --entrypoint tar "$image" -C /data -czf - . > "$backup/data.tar.gz"
tar -tzf "$backup/data.tar.gz" >/dev/null
(cd "$backup" && sha256sum data.tar.gz compose.yaml image.yaml project.txt > SHA256SUMS)
printf '%s\n' "$backup"
