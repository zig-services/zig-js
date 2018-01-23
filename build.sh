#!/bin/bash

set -e -o pipefail

npm install
node_modules/.bin/tsc "$@"

for FILE in *.js ; do
    node_modules/.bin/uglifyjs --mangle --compress -o $FILE -- $FILE
done

ls -la *.js
