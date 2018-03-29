#!/bin/sh

exec env TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' \
    node_modules/.bin/mocha \
    -r ts-node/register -r jsdom-global/register \
    "src/**/*.spec.ts"
