#!/bin/bash
# Enable pgvector extension on the default database.
# Runs automatically on first container start (docker-entrypoint-initdb.d).
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE EXTENSION IF NOT EXISTS "vector";
EOSQL
