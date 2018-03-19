#!/usr/bin/env bash
set -eu -o pipefail

# validate that everything builds
./build-in-docker.sh -p
git add dist/
git commit -m "Rebuild the libraries."

# update version and push to git - patch by default
npm version ${1:-patch}

# build code and upload
VERSION=$(jq -r .version < package.json)
echo "Building version ${VERSION}..."

./upload.sh "$VERSION"
