#!/bin/sh

set -e

./build-in-docker.sh -p

if [ "$1" == "latest" ] ; then
    echo "Can not be latest."
    exit 1
fi

BUCKET=lib.zig.services
echo "Using bucket $BUCKET"

s3cmd mb s3://"$BUCKET" || true

if [ -n "$1" ] && [ "$1" != "dev" ] ; then
    s3cmd put -P --no-preserve \
        --mime-type="application/javascript; charset=utf8" \
        --add-header='Cache-Control: public,max-age=31536000,immutable' \
         out/*.min.js s3://"$BUCKET"/$1/


    s3cmd put -P --no-preserve \
        --mime-type="application/javascript; charset=utf8" \
        --add-header='Cache-Control: public,no-store,no-cache' \
         out/*.min.js s3://"$BUCKET"/latest/
fi

s3cmd put -P --no-preserve \
    --mime-type="application/javascript; charset=utf8" \
    --add-header='Cache-Control: private,no-store,no-cache' \
     out/*.min.js s3://"$BUCKET"/dev/

s3cmd put -P --no-preserve \
    --mime-type="text/html; charset=utf8" \
    --add-header='Cache-Control: private,no-store,no-cache' \
     debug-page.html s3://"$BUCKET"/dev/
