#!/bin/sh

set -eu

env_file="${ENV_FILE:-.env}"

if [ ! -f "$env_file" ]; then
  env_file=".env.example"
fi

cleanup() {
  docker compose stop postgres redis >/dev/null
}

trap cleanup EXIT INT TERM

docker compose up --detach --wait postgres redis
bun --env-file="$env_file" --watch src/index.ts
