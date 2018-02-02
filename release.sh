#!/usr/bin/env bash
set -eu -o pipefail

function print_usage_and_exit() {
  echo "usage: $0 (minor|patch)"
  exit 1
}

if ! ${FORCE:-false} && [ -n "$(git status --porcelain -s)" ] ; then
    echo "Uncommitted changes."
    exit 1
fi

# get the latest tags
VERSION=$(git describe --tags | cut -d- -f1 || echo "0.0.0")

if [[ "$(git describe --tags)" == "$VERSION" ]] ; then
    echo "No change since previous release."
    exit 1
fi


ACTION=${1:-$ACTION}
case "$ACTION" in
    patch)
        NEXT_VERSION=$(echo $VERSION | gawk -F. '{ print $1 "." $2 "." ($3+1); }')
        ;;

    minor)
        NEXT_VERSION=$(echo $VERSION | gawk -F. '{ print $1 "." ($2+1) ".0" ; }')
        ;;

    major)
        NEXT_VERSION=$(echo $VERSION | gawk -F. '{ print ($1+1) ".0.0" ; }')
        ;;
    *)
        echo "ACTION is not correct"
        print_usage_and_exit
esac

if git tag --list | grep -qx $NEXT_VERSION ; then
    echo "Tag with name $NEXT_VERSION already exists."
    exit 1
fi

# try to build the version first

echo "Building version $NEXT_VERSION..."

./upload.sh $NEXT_VERSION

if [ -n "$NEXT_VERSION" ] ; then
  git tag "$NEXT_VERSION"
fi

# and push the tag to master
git push origin master --tags
