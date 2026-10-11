#!/bin/bash
set -ex
B=~/bundle/aelion
rm -rf ~/bundle && mkdir -p $B/dist-electron $B/assets
cd ~/AelionBot
cp dist-electron/cli.cjs dist-electron/code-worker.cjs dist-electron/file-search-worker.cjs dist-electron/token-worker.cjs $B/dist-electron/
cp -r assets/skills $B/assets/skills
node -e "
const p=require(\"./package.json\");
const names=[\"node-pty\",\"quickjs-emscripten\",\"ssh2\",\"@modelcontextprotocol/sdk\",\"yaml\",\"smol-toml\",\"jsonc-parser\",\"js-tiktoken\"];
const deps=Object.fromEntries(names.map(n=>[n,p.dependencies[n]]));
require(\"fs\").writeFileSync(process.argv[1]+\"/package.json\",JSON.stringify({name:\"aelion-headless\",version:p.version,private:true,dependencies:deps},null,2));
" $B
IMG=node:24-bullseye
docker pull -q $IMG || { IMG=node:24-bookworm; docker pull -q $IMG; }
docker run --rm -u $(id -u):$(id -g) -e HOME=/tmp -e npm_config_cache=/tmp/.npm -v $B:/w -w /w $IMG sh -c "ldd --version | head -1; npm install --omit=dev --no-audit --no-fund 2>&1 | tail -5; node -e \"require(\\\"node-pty\\\"); console.log(\\\"pty ok\\\")\""
mkdir -p $B/node && tar -xJf ~/node/node-v24*-linux-x64.tar.xz -C $B/node --strip-components=1 --wildcards "*/bin/node" "*/LICENSE"
tar -czf ~/bundle/aelion.tar.gz -C ~/bundle aelion
ls -la ~/bundle/aelion.tar.gz; du -sh $B/node_modules
echo BUNDLE_DONE $IMG
