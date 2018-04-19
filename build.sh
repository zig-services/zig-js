#!/bin/bash

set -e -o pipefail

# ensure all dependencies are installed
npm install

rm -rf dist

# Build the modules and put them under ./dist
node_modules/.bin/webpack --mode production --progress
rm -rf dist/typings

# copy package.json for npm to output directory
cp package.json dist/
