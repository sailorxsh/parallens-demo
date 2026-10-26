#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
node scripts/prepare_route_data.mjs --check
node scripts/verify_route_data.mjs
mkdir -p dist/data dist/vendor dist/assets
cp index.html app.js style.css favicon.svg dist/
# Validation reports are local build output, not website data.
rm -f dist/data/validation-report.json
for data_file in data/*.json; do
  [[ "$data_file" == "data/validation-report.json" ]] && continue
  cp "$data_file" dist/data/
done
cp vendor/echarts.min.js dist/vendor/
cp -R vendor/fonts dist/vendor/
cp assets/*.webp dist/assets/

printf 'Prepared %s static files for publication.\n' "$(find dist -type f | wc -l | tr -d ' ')"
