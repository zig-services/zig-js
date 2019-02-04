#!/bin/bash

set -e -o pipefail

HASH=$(md5sum package.json | cut -b-32)
echo "package.json hash is $HASH"

if ! [[ -f "node_modules/$HASH" ]] ; then
    echo "package.json has changed, installing node modules"

    # ensure all dependencies are installed
    npm install
    touch "node_modules/$HASH"
fi

rm -rf dist

# Transpile the javascript source
node_modules/.bin/tsc

# Build the bundles and put them under ./dist
node_modules/.bin/webpack --mode production --progress

# delete the bundle entry points
rm dist/libint.* dist/libzig.*

# copy files for npm to output directory
cp package.json dist/
cp README.md dist/
