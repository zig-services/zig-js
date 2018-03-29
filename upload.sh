#!/bin/sh

set -e

# read version from package.json file
TARGET_VERSION=${1:-"$(node -p 'require("./package.json").version')"}
SOURCE_VERSION=${2:-"$TARGET_VERSION"}

if ! [ -f dist/zig-${SOURCE_VERSION}.tar.gz ] ; then
    echo "Did not find compiled files for $SOURCE_VERSION"
    exit 1
fi

BUCKET=lib.zig.services
echo "Using bucket $BUCKET"

echo "Create bucket if not exists needed"
s3cmd mb s3://"$BUCKET" || true

s3cmd put -P --no-preserve \
    --mime-type="application/javascript; charset=utf8" \
    --add-header='Cache-Control: public, max-age=60' \
     dist/zig-${SOURCE_VERSION}.tar.gz s3://"$BUCKET"/zig/${TARGET_VERSION}/

s3cmd put -P --no-preserve \
    --mime-type="application/javascript; charset=utf8" \
    --add-header='Cache-Control: public, max-age=60' \
     dist/js/*.min.js s3://"$BUCKET"/zig/${TARGET_VERSION}/

s3cmd put -P --no-preserve \
    --mime-type="text/html; charset=utf8" \
    --add-header='Cache-Control: private,no-store,no-cache' \
     debug-page.html s3://mylotto24.frontend.zig.services/dev/
