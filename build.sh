#!/bin/sh
# Baut index.html: Worker bündeln und in app.html einsetzen.
#   ./build.sh            Krbn wird beim ersten Mal geklont
#   (cd Krbn && git pull) für eine neuere Engine, dann neu bauen
set -e
cd "$(dirname "$0")"
[ -d Krbn ] || git clone --depth 1 https://github.com/vpalos/Krbn.git
npx --yes esbuild@0.25 worker.ts --bundle --format=iife --minify --target=es2022 \
  --loader:.obj=text --outfile=.worker.js
KRBN_COMMIT=$(git -C Krbn rev-parse HEAD) node -e '
const fs = require("fs");
const w = fs.readFileSync(".worker.js", "utf8").replace(/<\/script/gi, "<\\/script");
const html = fs.readFileSync("app.html", "utf8");
for (const m of ["/*WORKER*/", "/*KRBN_COMMIT*/"])
  if (!html.includes(m)) throw new Error(`marker ${m} fehlt in app.html`);
fs.writeFileSync("index.html", html
  .replace("/*KRBN_COMMIT*/", process.env.KRBN_COMMIT)
  .replace("/*WORKER*/", () => w));
'
echo "Krbn $(git -C Krbn rev-parse --short HEAD)"
rm .worker.js
ls -lh index.html
