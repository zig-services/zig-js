#!/bin/sh

set -e

./build-in-docker.sh -p

if [ -n "$1" ] ; then
    s3cmd put -P --no-preserve \
        --mime-type="application/javascript; charset=utf8" \
        --add-header='Cache-Control: public,max-age=31536000,immutable' \
         out/*.min.js s3://zig.js/$1/

    s3cmd put -P --no-preserve \
        --mime-type="application/javascript; charset=utf8" \
        --add-header='Cache-Control: public,no-store,no-cache' \
         out/*.min.js s3://zig.js/latest/
fi

s3cmd put -P --no-preserve \
    --mime-type="application/javascript; charset=utf8" \
    --add-header='Cache-Control: private,no-store,no-cache' \
     out/*.min.js s3://zig.js/dev/
