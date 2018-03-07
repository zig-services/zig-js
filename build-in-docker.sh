#!/bin/sh

set -e

docker run -i --rm --net=host -v $PWD:/app \
    --user=$(id -u) --env TMPDIR=/tmp --workdir /app \
    node:9.4.0-slim npm install

docker run -i --rm --net=host -v $PWD:/app \
    --user=$(id -u) --env TMPDIR=/tmp --workdir /app \
    node:9.4.0-slim npm run build
