#!/bin/bash

set -e -o pipefail

npm install

rm -rf out
mkdir -p out
node_modules/.bin/webpack -p