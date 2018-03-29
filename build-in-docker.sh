#!/bin/sh

set -e

docker run -i --rm --net=host -v $PWD:/app \
    --user=$(id -u) --env TMPDIR=/tmp --workdir /app \
    node:9.10.0-slim ./build.sh
