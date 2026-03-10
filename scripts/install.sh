#!/bin/bash
#
# ClawTalk Plugin Installer
# Downloads the latest release from GitHub and installs via openclaw plugins.
#
# Usage:
#   ./scripts/install.sh          # Install latest release
#   ./scripts/install.sh v0.2.0   # Install specific version
#
# Prerequisites: openclaw, curl, jq

set -euo pipefail

REPO="team-telnyx/clawtalk-plugin"
API_URL="https://api.github.com/repos/${REPO}"
PLUGIN_ID="clawtalk"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

die() { echo -e "${RED}Error: $1${NC}" >&2; exit 1; }

# Check prerequisites
command -v openclaw >/dev/null 2>&1 || die "openclaw CLI not found"
command -v curl >/dev/null 2>&1 || die "curl not found"
command -v jq >/dev/null 2>&1 || die "jq not found"

# Determine target version
TARGET_TAG="${1:-}"
if [ -n "$TARGET_TAG" ]; then
  RELEASE_URL="${API_URL}/releases/tags/${TARGET_TAG}"
else
  RELEASE_URL="${API_URL}/releases/latest"
fi

echo -e "${GREEN}ClawTalk Plugin Installer${NC}"
echo "========================="

# Check current version
CURRENT=$(openclaw plugins info "$PLUGIN_ID" 2>/dev/null | grep -i version | head -1 | awk '{print $NF}' || echo "not installed")
echo "Current: ${CURRENT}"

# Fetch release metadata
echo "Fetching release info..."
RELEASE_JSON=$(curl -sL "$RELEASE_URL")
TAG=$(echo "$RELEASE_JSON" | jq -r '.tag_name // empty')
[ -n "$TAG" ] || die "Could not fetch release${TARGET_TAG:+ ($TARGET_TAG)}"
VERSION="${TAG#v}"
echo "Latest:  ${VERSION}"

if [ "$CURRENT" = "$VERSION" ]; then
  echo -e "${GREEN}✓ Already up to date${NC}"
  exit 0
fi

# Find .tgz asset
TGZ_URL=$(echo "$RELEASE_JSON" | jq -r '
  [.assets[] | select(.name | endswith(".tgz"))] | first | .browser_download_url // empty
')
[ -n "$TGZ_URL" ] || die "No .tgz asset found in release ${TAG}"
TGZ_NAME=$(basename "$TGZ_URL")

# Find checksum asset
SHA_URL=$(echo "$RELEASE_JSON" | jq -r '
  [.assets[] | select(.name | endswith(".sha256") or .name | endswith(".sha256sum"))] | first | .browser_download_url // empty
')

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

# Download tarball
echo "Downloading ${TGZ_NAME}..."
curl -sL "$TGZ_URL" -o "${TEMP_DIR}/${TGZ_NAME}"
[ -s "${TEMP_DIR}/${TGZ_NAME}" ] || die "Download failed"

# Verify checksum if available
if [ -n "$SHA_URL" ]; then
  echo "Verifying checksum..."
  curl -sL "$SHA_URL" -o "${TEMP_DIR}/checksum"

  # Extract expected hash (handle both "hash  filename" and bare hash formats)
  EXPECTED=$(grep "$TGZ_NAME" "${TEMP_DIR}/checksum" 2>/dev/null | awk '{print $1}' || head -1 "${TEMP_DIR}/checksum" | awk '{print $1}')

  if echo "$EXPECTED" | grep -Eq '^[a-fA-F0-9]{64}$'; then
    if command -v shasum >/dev/null 2>&1; then
      ACTUAL=$(shasum -a 256 "${TEMP_DIR}/${TGZ_NAME}" | awk '{print $1}')
    elif command -v sha256sum >/dev/null 2>&1; then
      ACTUAL=$(sha256sum "${TEMP_DIR}/${TGZ_NAME}" | awk '{print $1}')
    else
      die "No sha256 tool found (need shasum or sha256sum)"
    fi
    [ "$EXPECTED" = "$ACTUAL" ] || die "Checksum mismatch!\n  Expected: ${EXPECTED}\n  Actual:   ${ACTUAL}"
    echo -e "${GREEN}✓ Checksum verified${NC}"
  else
    echo -e "${YELLOW}⚠ Could not parse checksum, skipping verification${NC}"
  fi
else
  echo -e "${YELLOW}⚠ No checksum asset found, skipping verification${NC}"
fi

# Install
echo "Installing plugin..."
openclaw plugins install "${TEMP_DIR}/${TGZ_NAME}"

echo
echo -e "${GREEN}✓ ClawTalk plugin installed (${VERSION})${NC}"
echo
echo "Configure in your gateway config:"
echo "  plugins:"
echo "    clawtalk:"
echo "      apiKey: \"your-api-key\""
echo
echo "Then restart: openclaw gateway restart"
