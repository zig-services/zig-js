#!/bin/sh

set -e

# read version from package.json file
TARGET_VERSION=${1:-$(node -p 'require("./package.json").version')}
VERSION_MAJOR=$(node -p "require('semver').major('$TARGET_VERSION')")

./upload.sh "$TARGET_VERSION" "$VERSION_MAJOR"-SNAPSHOT
