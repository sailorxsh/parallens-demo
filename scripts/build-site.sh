#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p dist/data dist/vendor dist/assets
cp index.html app.js style.css favicon.svg dist/
cp data/*.json dist/data/
cp vendor/echarts.min.js dist/vendor/
cp -R vendor/fonts dist/vendor/
cp assets/*.webp dist/assets/

printf 'Prepared %s static files for publication.\n' "$(find dist -type f | wc -l | tr -d ' ')"
