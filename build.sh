#!/bin/bash

set -e -o pipefail

npm install

for DIR in zig integration wrapper ; do
    (
        cd $DIR
        ../node_modules/.bin/tsc
    )
done

mkdir -p out

for DIR in zig integration wrapper ; do
    (
        echo '!function(){'
        node_modules/.bin/uglifyjs --mangle toplevel --compress -- $DIR/*.js
        echo '}();'
    ) > out/$DIR.min.js
done

#
# s3cmd put -P --mime-type="application/javascript" --add-header='Cache-Control:public, no-store, no-cache' *.min.js s3://zig.js/latest/
#