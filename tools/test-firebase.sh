#!/bin/sh
# Prove della corsia veloce con gli emulatori di Firebase (regole, custode, client veri, due browser).
# Servono Java e Node; le librerie di prova (firebase-tools, rules-unit-testing) si installano UNA volta fuori dal
# repository. Nessuna chiamata al progetto vero: solo emulatori (progetto «demo-psydiary»).
#   FB_DIR=cartella delle librerie (di serie ~/.cache/psydiary-firebase)
set -e
cd "$(dirname "$0")/.."
FB_DIR="${FB_DIR:-$HOME/.cache/psydiary-firebase}"
VERSIONE="$(node -p "require('./package.json').dependencies.firebase")"
if [ ! -x "$FB_DIR/node_modules/.bin/firebase" ]; then
  echo "Installo gli strumenti di Firebase in $FB_DIR (una volta sola)…"
  mkdir -p "$FB_DIR" && (cd "$FB_DIR" && npm init -y >/dev/null && npm i --legacy-peer-deps firebase-tools@15 @firebase/rules-unit-testing "firebase@$VERSIONE")
fi
# Playwright (per le prove con i browser) sta di solito in /opt/node22/lib/node_modules
export NODE_PATH="$FB_DIR/node_modules:${PLAYWRIGHT_DIR:-/opt/node22/lib/node_modules}${NODE_PATH:+:$NODE_PATH}"
export GCLOUD_PROJECT=demo-psydiary
node tools/test-veloce.mjs
"$FB_DIR/node_modules/.bin/firebase" emulators:exec --only firestore,auth --project demo-psydiary "node tools/test-firebase.cjs && node tools/test-firebase-browser.cjs"
