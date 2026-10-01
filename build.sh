#!/bin/sh
# Baut krbn.html: Worker bündeln und in app.html einsetzen.
#   ./build.sh            Krbn wird beim ersten Mal geklont
#   (cd Krbn && git pull) für eine neuere Engine, dann neu bauen
set -e
cd "$(dirname "$0")"
[ -d Krbn ] || git clone --depth 1 https://github.com/vpalos/Krbn.git
npx --yes esbuild@0.25 worker.ts --bundle --format=iife --minify --target=es2022 \
  --loader:.obj=text --outfile=.worker.js
node -e '
const fs = require("fs");
const w = fs.readFileSync(".worker.js", "utf8").replace(/<\/script/gi, "<\\/script");
const html = fs.readFileSync("app.html", "utf8");
if (!html.includes("/*WORKER*/")) throw new Error("marker /*WORKER*/ fehlt in app.html");
fs.writeFileSync("krbn.html", html.replace("/*WORKER*/", () => w));
'
rm .worker.js
ls -lh krbn.html
