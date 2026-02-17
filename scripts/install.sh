#!/bin/sh
# tokentop installer — https://github.com/tokentopapp/tokentop
# Usage: curl -fsSL https://raw.githubusercontent.com/tokentopapp/tokentop/main/scripts/install.sh | sh
set -e

REPO="tokentopapp/tokentop"
BINARY_NAME="ttop"
INSTALL_DIR="${TOKENTOP_INSTALL_DIR:-/usr/local/bin}"

# --- Detect OS ---
OS="$(uname -s)"
case "$OS" in
  Darwin) OS="darwin" ;;
  Linux)  OS="linux" ;;
  *)
    echo "Error: Unsupported operating system: $OS"
    echo "For Windows, use Scoop:"
    echo "  scoop bucket add tokentop https://github.com/tokentopapp/scoop-tokentop"
    echo "  scoop install tokentop"
    exit 1
    ;;
esac

# --- Detect architecture ---
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64)  ARCH="x64" ;;
  arm64|aarch64)  ARCH="arm64" ;;
  *)
    echo "Error: Unsupported architecture: $ARCH"
    exit 1
    ;;
esac

ARTIFACT="${BINARY_NAME}-${OS}-${ARCH}"

# --- Resolve latest version ---
if [ -n "$TOKENTOP_VERSION" ]; then
  VERSION="$TOKENTOP_VERSION"
else
  echo "Fetching latest release..."
  VERSION="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')"
  if [ -z "$VERSION" ]; then
    echo "Error: Could not determine latest version. Set TOKENTOP_VERSION manually."
    exit 1
  fi
fi

URL="https://github.com/${REPO}/releases/download/${VERSION}/${ARTIFACT}"

echo "Installing tokentop ${VERSION} (${OS}/${ARCH})..."
echo "  ${URL}"

# --- Download ---
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

curl -fsSL "$URL" -o "${TMPDIR}/${BINARY_NAME}"
chmod +x "${TMPDIR}/${BINARY_NAME}"

# --- Verify it runs ---
if ! "${TMPDIR}/${BINARY_NAME}" --version > /dev/null 2>&1; then
  echo "Error: Downloaded binary failed to execute."
  echo "Please report this at https://github.com/${REPO}/issues"
  exit 1
fi

# --- Install ---
if [ -w "$INSTALL_DIR" ]; then
  mv "${TMPDIR}/${BINARY_NAME}" "${INSTALL_DIR}/${BINARY_NAME}"
else
  echo "Installing to ${INSTALL_DIR} (requires sudo)..."
  sudo mv "${TMPDIR}/${BINARY_NAME}" "${INSTALL_DIR}/${BINARY_NAME}"
fi

echo ""
echo "tokentop ${VERSION} installed to ${INSTALL_DIR}/${BINARY_NAME}"
echo ""
echo "Run 'ttop' to start, or 'ttop demo' to try it with sample data."
