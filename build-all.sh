#!/usr/bin/env bash
# Build G2 Editor packages from an M-series Mac.
# Prerequisites: brew install mingw-w64  (for Windows target)
#
# Usage:
#   ./build-all.sh              # build all targets
#   ./build-all.sh arm64        # macOS arm64 DMG
#   ./build-all.sh x64          # macOS x64 DMG
#   ./build-all.sh win          # Windows NSIS installer
#   ./build-all.sh arm64 win    # multiple targets
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLI_DIR="$SCRIPT_DIR/cli"
EDITOR_DIR="$SCRIPT_DIR/g2-editor"
RESOURCES_DIR="$EDITOR_DIR/resources"

step() { echo; echo "==> $1"; }

# --- Parse targets ---
BUILD_ARM64=false
BUILD_X64=false
BUILD_WIN=false

if [ $# -eq 0 ]; then
  BUILD_ARM64=true; BUILD_X64=true; BUILD_WIN=true
else
  for arg in "$@"; do
    case "$arg" in
      arm64) BUILD_ARM64=true ;;
      x64)   BUILD_X64=true ;;
      win)   BUILD_WIN=true ;;
      *) echo "Unknown target: '$arg'. Valid targets: arm64  x64  win"; exit 1 ;;
    esac
  done
fi

# --- Shared prerequisites ---
step "Installing npm dependencies"
cd "$EDITOR_DIR"
npm ci

step "Compiling Electron app"
npx electron-vite build

# ──────────────────────────────────────────
# macOS arm64
# ──────────────────────────────────────────
if $BUILD_ARM64; then
  step "Building CLI for macOS arm64"
  cd "$CLI_DIR"
  make clean
  make CC=clang ARCH_FLAGS="-arch arm64"
  cp build/bin/g2-cli "$RESOURCES_DIR/g2-cli"

  step "Packaging macOS arm64 DMG"
  cd "$EDITOR_DIR"
  npx electron-builder --mac --arm64
fi

# ──────────────────────────────────────────
# macOS x64
# Builds libusb from source for x86_64 — no Rosetta Homebrew needed.
# clang on macOS supports -arch x86_64 natively (Universal Binary toolchain).
# ──────────────────────────────────────────
if $BUILD_X64; then
  LIBUSB_VERSION=1.0.27
  LIBUSB_X64_PREFIX=/tmp/libusb-x64

  step "Building libusb $LIBUSB_VERSION for macOS x64"
  if [ ! -f "$LIBUSB_X64_PREFIX/lib/libusb-1.0.a" ]; then
    cd /tmp
    curl -fsSL "https://github.com/libusb/libusb/releases/download/v${LIBUSB_VERSION}/libusb-${LIBUSB_VERSION}.tar.bz2" -o libusb.tar.bz2
    tar -xjf libusb.tar.bz2
    cd "libusb-${LIBUSB_VERSION}"
    CFLAGS="-arch x86_64" LDFLAGS="-arch x86_64" CC=clang \
      ./configure --prefix="$LIBUSB_X64_PREFIX" --enable-static --disable-shared
    make -j4 install
  else
    echo "libusb x64 already built at $LIBUSB_X64_PREFIX — skipping."
  fi

  step "Building CLI for macOS x64"
  cd "$CLI_DIR"
  make clean
  make CC=clang \
    ARCH_FLAGS="-arch x86_64" \
    LIBUSB_CFLAGS="-I$LIBUSB_X64_PREFIX/include/libusb-1.0" \
    LIBUSB_LIBS="-L$LIBUSB_X64_PREFIX/lib -lusb-1.0 -framework CoreFoundation -framework IOKit -framework Security -lobjc"
  cp build/bin/g2-cli "$RESOURCES_DIR/g2-cli"
  make clean

  step "Packaging macOS x64 DMG"
  cd "$EDITOR_DIR"
  npx electron-builder --mac --x64
fi

# ──────────────────────────────────────────
# Windows x64 (native MinGW cross-compiler via Homebrew)
# One-time setup: brew install mingw-w64
# ──────────────────────────────────────────
if $BUILD_WIN; then
  if ! command -v x86_64-w64-mingw32-gcc &>/dev/null; then
    echo "ERROR: mingw-w64 not found. Install with: brew install mingw-w64"
    exit 1
  fi

  LIBUSB_VERSION=1.0.27
  LIBUSB_WIN_PREFIX=/tmp/libusb-win

  step "Building libusb $LIBUSB_VERSION for Windows x64"
  if [ ! -f "$LIBUSB_WIN_PREFIX/lib/libusb-1.0.a" ]; then
    cd /tmp
    curl -fsSL "https://github.com/libusb/libusb/releases/download/v${LIBUSB_VERSION}/libusb-${LIBUSB_VERSION}.tar.bz2" -o libusb-win.tar.bz2
    tar -xjf libusb-win.tar.bz2
    cd "libusb-${LIBUSB_VERSION}"
    ./configure --host=x86_64-w64-mingw32 --prefix="$LIBUSB_WIN_PREFIX" --enable-static --disable-shared
    make -j4 install
  else
    echo "libusb win already built at $LIBUSB_WIN_PREFIX — skipping."
  fi

  step "Building CLI for Windows x64"
  cd "$CLI_DIR"
  make clean
  make CC=x86_64-w64-mingw32-gcc \
    LIBUSB_CFLAGS="-I$LIBUSB_WIN_PREFIX/include/libusb-1.0" \
    LIBUSB_LIBS="-L$LIBUSB_WIN_PREFIX/lib -lusb-1.0 -lsetupapi"
  cp build/bin/g2-cli.exe "$RESOURCES_DIR/g2-cli.exe"
  make clean

  step "Packaging Windows NSIS installer"
  cd "$EDITOR_DIR"
  npx electron-builder --win
fi

# ──────────────────────────────────────────
step "Done. Artifacts in g2-editor/release/"
ls -1 "$EDITOR_DIR/release/"*.{dmg,exe} 2>/dev/null || true
