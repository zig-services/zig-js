#!/bin/bash

set -e -o pipefail

npm install

mkdir -p out
node_modules/.bin/webpack -p

#
# s3cmd put -P --mime-type="application/javascript" --add-header='Cache-Control:public, no-store, no-cache' *.min.js s3://zig.js/latest/
#