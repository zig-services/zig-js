#!/bin/sh

./build-in-docker.sh

if [ -n "$1" ] ; then
    s3cmd put -P \
        --mime-type="application/javascript; charset=utf8" \
        --add-header='Cache-Control:public, no-store, no-cache' \
         out/*.min.js s3://zig.js/$1/
fi

s3cmd put -P \
    --mime-type="application/javascript; charset=utf8" \
    --add-header='Cache-Control:public, no-store, no-cache' \
     out/*.min.js s3://zig.js/latest/
