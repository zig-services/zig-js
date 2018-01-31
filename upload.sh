#!/bin/sh

./build-in-docker.sh

s3cmd put -P \
    --mime-type="application/javascript; charset=utf8" \
    --add-header='Cache-Control:public, no-store, no-cache' \
     out/*.min.js s3://zig.js/latest/
