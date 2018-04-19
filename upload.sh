#!/bin/bash

set -e

VERSION=${1:-$(node -p 'require("./package.json").version')}

SUFFIX=stable
if [[ $VERSION == *beta* ]] ; then
    SUFFIX=${1:-dev}
else
    if s3cmd info s3://lib.zig.services/zig/$VERSION/libzig.js &> /dev/null ; then
        echo "Error: version $VERSION already exists on s3 storage."
        exit 1
    fi
fi

VERSION_MAJOR=$(node -p "require('semver').major('$VERSION')")-$SUFFIX
VERSION_MAJOR_MINOR=$(node -p "v=require('semver'); v.major('$VERSION') + '.' + v.minor('$VERSION')")-$SUFFIX

echo "Uploading in version '$VERSION_MAJOR'"
s3cmd put -P -q --no-preserve \
    --mime-type="application/javascript; charset=utf8" \
    --add-header="Cache-Control: public, max-age=60" \
     dist/*.js s3://lib.zig.services/zig/$VERSION_MAJOR/

echo "Uploading in version '$VERSION_MAJOR_MINOR'"
s3cmd put -P -q --no-preserve \
    --mime-type="application/javascript; charset=utf8" \
    --add-header="Cache-Control: public, max-age=60" \
     dist/*.js s3://lib.zig.services/zig/$VERSION_MAJOR_MINOR/

echo "Uploading in version '$VERSION'"
s3cmd put -P -q --no-preserve \
    --mime-type="application/javascript; charset=utf8" \
    --add-header='Cache-Control: public, max-age=60' \
     dist/*.js s3://lib.zig.services/zig/$VERSION/

echo "Uploading debug page"
s3cmd put -P -q --no-preserve \
    --mime-type="text/html; charset=utf8" \
    --add-header='Cache-Control: private,no-store,no-cache' \
     debug-page.html s3://mylotto24.frontend.zig.services/dev/
