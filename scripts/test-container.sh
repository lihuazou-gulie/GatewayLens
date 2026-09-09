#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
cd "$root"
export COMPOSE_PROJECT_NAME="kanban-acceptance-${RANDOM}"
export KANBAN_BIND_ADDRESS=127.0.0.1
export KANBAN_PUBLISH_PORT=${KANBAN_TEST_PORT:-18787}
export KANBAN_IMAGE=sub2api-monitor:acceptance
export COMPOSE_FILE=compose.yaml:tests/compose.acceptance.yaml
export KANBAN_BACKUP_DIR=$(mktemp -d /tmp/kanban-acceptance-backups-XXXXXX)
restore_volume="${COMPOSE_PROJECT_NAME}-restore"
compose=(docker compose -f compose.yaml -f tests/compose.acceptance.yaml)
cleanup() {
  "${compose[@]}" down --volumes
  if docker volume inspect "$restore_volume" >/dev/null 2>&1; then docker volume rm "$restore_volume"; fi
}
trap cleanup EXIT
"${compose[@]}" up -d --build --wait --wait-timeout 120
"${compose[@]}" exec -T sub2api-fixture node tests/container-smoke.mjs
"${compose[@]}" up -d --no-deps --no-build --force-recreate --wait --wait-timeout 90 runtime-command-center
"${compose[@]}" exec -T sub2api-fixture node tests/container-smoke.mjs
backup=$(bash scripts/backup.sh)
(cd "$backup" && sha256sum -c SHA256SUMS)
docker run --rm -i --network none --read-only --user 1000:1000 --cap-drop ALL \
  --mount "type=volume,source=$restore_volume,target=/data" --entrypoint tar "$KANBAN_IMAGE" -C /data -xzf - < "$backup/data.tar.gz"
docker run --rm --network none --read-only --user 1000:1000 --cap-drop ALL \
  --mount "type=volume,source=$restore_volume,target=/data" --entrypoint node "$KANBAN_IMAGE" --input-type=module -e \
  'import {openPersistence} from "./server/bootstrap/persistence.mjs"; import {ConfigurationRepository} from "./server/modules/configuration/infrastructure/configuration-repository.mjs"; const {store,vault}=await openPersistence("/data"); const s=new ConfigurationRepository(store,vault); if(s.snapshot().connection.apiKey!=="demo-admin-key-not-production")process.exit(1); console.log("Private volume restore and decryption passed");'
fault="$KANBAN_BACKUP_DIR/fault.yaml"
cat > "$fault" <<'YAML'
services:
  runtime-command-center:
    command: ["node", "-e", "setInterval(()=>{},1000)"]
    healthcheck:
      test: ["CMD", "node", "-e", "process.exit(1)"]
      interval: 1s
      start_period: 0s
      retries: 1
YAML
if COMPOSE_FILE="$COMPOSE_FILE:$fault" bash scripts/deploy.sh; then
  printf 'Expected unhealthy deployment to fail.\n' >&2; exit 1
fi
"${compose[@]}" exec -T sub2api-fixture node tests/container-smoke.mjs
printf 'Container acceptance, reconstruction, backup restore and automatic rollback passed.\n'
