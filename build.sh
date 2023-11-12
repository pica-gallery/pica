#!/usr/bin/env bash

set -e

cargo build --release

pushd frontend
  rm -rf dist
  npm install
  npm run build
  gzip -k dist/pica/browser/*.js
  gzip -k dist/pica/browser/*.css
  gzip -k dist/pica/browser/*.html
popd

