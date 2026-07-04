#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_ENV="$ROOT_DIR/.env"
SERVER_ENV="$ROOT_DIR/packages/server/.env"
ROOT_EXAMPLE_ENV="$ROOT_DIR/.env.example"
SERVER_EXAMPLE_ENV="$ROOT_DIR/packages/server/.env.example"

cd "$ROOT_DIR"

info() {
  printf '[dev:setup] %s\n' "$1"
}

fail() {
  printf '[dev:setup] ERROR: %s\n' "$1" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || fail 'Docker is required to start the local Postgres service.'
docker compose version >/dev/null 2>&1 || fail 'Docker Compose v2 is required.'
docker info >/dev/null 2>&1 || fail 'Docker daemon is not running. Start Docker Desktop, then run pnpm dev again.'

if [ ! -f "$ROOT_ENV" ]; then
  if [ -f "$SERVER_ENV" ]; then
    cp "$SERVER_ENV" "$ROOT_ENV"
    info 'Created .env from packages/server/.env.'
  elif [ -f "$ROOT_EXAMPLE_ENV" ]; then
    cp "$ROOT_EXAMPLE_ENV" "$ROOT_ENV"
    info 'Created .env from .env.example.'
  elif [ -f "$SERVER_EXAMPLE_ENV" ]; then
    cp "$SERVER_EXAMPLE_ENV" "$ROOT_ENV"
    info 'Created .env from packages/server/.env.example.'
  else
    fail 'No .env or example env file was found.'
  fi
fi

api_key="$(sed -n 's/^OPENAI_API_KEY=//p' "$ROOT_ENV" | head -n 1 | tr -d '\r' || true)"
if [ -z "$api_key" ] || [ "$api_key" = "your_api_key" ]; then
  fail 'Fill OPENAI_API_KEY in .env, then run pnpm dev again.'
fi

info 'Starting Postgres...'
docker compose up -d postgres

info 'Waiting for Postgres to become healthy...'
for _ in $(seq 1 60); do
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' ai-pro-agent-postgres 2>/dev/null || true)"

  if [ "$status" = 'healthy' ]; then
    break
  fi

  if [ "$status" = 'unhealthy' ]; then
    docker compose logs postgres >&2 || true
    fail 'Postgres container is unhealthy.'
  fi

  sleep 1
done

status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' ai-pro-agent-postgres 2>/dev/null || true)"
if [ "$status" != 'healthy' ]; then
  docker compose logs postgres >&2 || true
  fail 'Timed out waiting for Postgres.'
fi

info 'Generating Prisma client...'
pnpm --filter server run generate

info 'Applying database migrations...'
pnpm --filter server run migrate:deploy

info 'Local setup complete.'
