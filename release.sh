#!/usr/bin/env bash
set -eu -o pipefail

if [[ $(node -p 'require("./package.json").version') != *-SNAPSHOT ]] ; then
    echo "Expected SNAPSHOT version in package.json"
    exit 1
fi

# validate that everything builds
./build-in-docker.sh

# update version and push to git - patch by default
npm version ${1:-patch}

# build code and upload
VERSION=$(node -p 'require("./package.json").version')
echo "Building release version ${VERSION}..."

./build-in-docker.sh

# update version to next snapshot
VERSION_NEXT=$(node_modules/.bin/semver -i ${VERSION})-SNAPSHOT
npm --no-git-tag-version version ${VERSION_NEXT}
git add package.json
git commit -m "Move to next snapshot version $VERSION_NEXT"

./build-in-docker.sh
./upload.sh "$VERSION_NEXT"
