#!/usr/bin/env bash
# Fetch Google's pinned Linux x64 Headless Shell only when a card needs rendering.
set -euo pipefail

version=158.0.8127.36
sha256=2d3a23017323c54fd457a678e4351f895c4076d8050e39d5aa6247f93448b73a
platform=linux64
bundle="chrome-headless-shell-$platform"
install_dir="${RUNNER_TEMP:?}/portfolio-chrome-$version-$sha256"
executable="$install_dir/chrome-headless-shell"

if [[ ! -x "$executable" ]]; then
  tmp="$(mktemp -d "${RUNNER_TEMP}/portfolio-chrome.XXXXXX")"
  trap 'rm -rf -- "$tmp"' EXIT
  url="https://storage.googleapis.com/chrome-for-testing-public/$version/$platform/$bundle.zip"
  curl --fail --silent --show-error --proto '=https' --max-time 30 --retry 1 --retry-max-time 30 \
    "$url" -o "$tmp/chrome.zip"
  checksum="$(sha256sum "$tmp/chrome.zip")"
  if [[ "${checksum%% *}" != "$sha256" ]]; then
    printf 'Chrome for Testing %s archive failed its SHA-256 check.\n' "$version" >&2
    exit 1
  fi
  unzip -q "$tmp/chrome.zip" -d "$tmp"
  # Publish the complete bundle at once. A concurrent install can win this move.
  if ! mv -T "$tmp/$bundle" "$install_dir" && [[ ! -x "$executable" ]]; then
    exit 1
  fi
fi

"$executable" --version >&2
printf '%s\n' "$executable"
