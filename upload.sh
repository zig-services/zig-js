#!/bin/sh

set -e

# read version from package.json file
VERSION=$(node -p 'require("./package.json").version')

if ! [ -f dist/zig-${VERSION}.tar.gz ] ; then
    echo "Did not find compiled files for $VERSION"
    exit 1
fi

BUCKET=lib.zig.services
echo "Using bucket $BUCKET"

echo "Create bucket if not exists needed"
s3cmd mb s3://"$BUCKET" || true

#
#if [ -n "$1" ] && [ "$1" != "dev" ] ; then
#    s3cmd put -P --no-preserve \
#        --mime-type="application/javascript; charset=utf8" \
#        --add-header='Cache-Control: public,max-age=31536000,immutable' \
#         dist/*.min.js s3://"$BUCKET"/$1/
#
#
#    s3cmd put -P --no-preserve \
#        --mime-type="application/javascript; charset=utf8" \
#        --add-header='Cache-Control: public,max-age=60' \
#         dist/*.min.js s3://"$BUCKET"/latest/
#fi

s3cmd put -P --no-preserve \
    --mime-type="application/javascript; charset=utf8" \
    --add-header='Cache-Control: public, max-age=60' \
     dist/zig-${VERSION}.tar.gz s3://"$BUCKET"/zig/${VERSION}/

s3cmd put -P --no-preserve \
    --mime-type="application/javascript; charset=utf8" \
    --add-header='Cache-Control: public, max-age=60' \
     dist/js/*.min.js s3://"$BUCKET"/zig/${VERSION}/

s3cmd put -P --no-preserve \
    --mime-type="text/html; charset=utf8" \
    --add-header='Cache-Control: private,no-store,no-cache' \
     debug-page.html s3://mylotto24.frontend.zig.services/dev/
