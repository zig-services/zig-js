#!/bin/sh

set -e

docker run -i --rm -v $PWD:/app \
    --user=$(id -u) --env TMPDIR=/tmp --workdir /app \
    node:9.4.0-slim \
    ./build.sh
