#!/usr/bin/env bash
set -eu -o pipefail

./build-in-docker.sh -p

# update version and push to git - patch by default
npm version ${1:-patch}

# build code and upload
VERSION=$(jq .version < package.json)
echo "Building version ${VERSION}..."

./upload.sh "$VERSION"
