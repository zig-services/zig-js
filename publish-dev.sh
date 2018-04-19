#!/bin/sh

set -e

./build.sh
publish-s3.sh dev
