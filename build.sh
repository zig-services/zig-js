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

node_modules/.bin/gulp

# copy files for npm to output directory
cp package.json dist/
cp README.md dist/
