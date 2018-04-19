#!/bin/bash

set -e -o pipefail

# ensure all dependencies are installed
npm install

# Build the modules and put them under ./dist
node_modules/.bin/webpack --mode production --progress
rm -rf dist/typings

# copy package.json for npm to output directory
cp package.json dist/

# package everything in a .tar.gz archive
VERSION=$(node -p 'require("./package.json").version')
tar -vc -C dist/ . | gzip -9 > zig-${VERSION}.tar.gz
