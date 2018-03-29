#!/bin/bash

set -e -o pipefail

# ensure all dependencies are installed
npm install

# Build the modules and put them under ./dist
node_modules/.bin/webpack --mode production --progress

# copy package.json for npm to output directory
cp package.json dist/js/

# package everything in a .tar.gz archive
VERSION=$(node -p 'require("./package.json").version')
tar -vc -C dist/js/ . | gzip -9 > dist/zig-${VERSION}.tar.gz
