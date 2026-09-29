#!/usr/bin/env bash
# Render build command: `./build.sh`
# Installs the backend, then builds the web app into app/dist (which app.py serves),
# so the built bundle no longer has to be committed to git.
set -euo pipefail

pip install -r requirements.txt

cd app
npm ci --legacy-peer-deps --no-audit --no-fund
npx expo export -p web
test -f dist/index.html  # fail the deploy rather than go live without a page
