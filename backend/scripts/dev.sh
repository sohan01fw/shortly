#!/bin/sh

set -eu

docker compose -f compose.yaml -f compose.dev.yaml up --build --remove-orphans
