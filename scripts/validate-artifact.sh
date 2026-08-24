#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

worker="${SITES_PROJECT_ROOT}/dist/server/index.js"
hosting="${SITES_PROJECT_ROOT}/dist/.openai/hosting.json"
migration_root="${SITES_PROJECT_ROOT}/dist/.openai/drizzle"
required_migrations=(
  "0000_complex_thena.sql"
  "0001_add-content-type-demo.sql"
  "meta/_journal.json"
)

[[ -f "${worker}" ]] || {
  echo "Missing Sites Worker entry: dist/server/index.js" >&2
  exit 66
}
[[ -f "${hosting}" ]] || {
  echo "Missing packaged Sites manifest: dist/.openai/hosting.json" >&2
  exit 66
}
[[ -d "${migration_root}" ]] || {
  echo "Missing packaged Sites migration history: dist/.openai/drizzle" >&2
  exit 66
}
for migration in "${required_migrations[@]}"; do
  [[ -f "${migration_root}/${migration}" ]] || {
    echo "Missing packaged Sites migration file: dist/.openai/drizzle/${migration}" >&2
    exit 66
  }
done

node --input-type=module - "${worker}" "${hosting}" <<'NODE'
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const OBSOLETE_PROJECT_ID = "REPLACE_WITH_YOUR_SITES_PROJECT_ID";
const [workerPath, hostingPath] = process.argv.slice(2);
const hosting = JSON.parse(await readFile(hostingPath, "utf8"));
if (hosting.project_id === OBSOLETE_PROJECT_ID) {
  throw new Error(
    "dist/.openai/hosting.json contains the obsolete project_id placeholder"
  );
}

const workerUrl = pathToFileURL(workerPath);
workerUrl.searchParams.set("sites-validation", `${process.pid}-${Date.now()}`);
const worker = await import(workerUrl.href);
if (!worker.default || typeof worker.default.fetch !== "function") {
  throw new Error("dist/server/index.js must have an ESM default export with fetch(request, env, ctx)");
}
NODE

echo "Validated Sites artifact: Worker, manifest, and migration history are present."
