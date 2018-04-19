#!/bin/sh

set -e

SUFFIX=${1:-dev}

VERSION=${1:-$(node -p 'require("./package.json").version')}
VERSION_MAJOR=$(node -p "require('semver').major('$VERSION')")
VERSION_MAJOR_MINOR="$VERSION_MAJOR".$(node -p "require('semver').minor('$VERSION')")

echo "Uploading in version '$VERSION_MAJOR'"
s3cmd put -q --no-preserve \
    --mime-type="application/javascript; charset=utf8" \
    --add-header='Cache-Control: public, max-age=60' \
     dist/*.js s3://lib.zig.services/zig/$VERSION_MAJOR-$SUFFIX/

echo "Uploading in version '$VERSION_MAJOR_MINOR'"
s3cmd put -q --no-preserve \
    --mime-type="application/javascript; charset=utf8" \
    --add-header='Cache-Control: public, max-age=60' \
     dist/*.js s3://lib.zig.services/zig/$VERSION_MAJOR_MINOR-$SUFFIX/

echo "Uploading debug page"
s3cmd put -q --no-preserve \
    --mime-type="text/html; charset=utf8" \
    --add-header='Cache-Control: private,no-store,no-cache' \
     debug-page.html s3://mylotto24.frontend.zig.services/dev/
