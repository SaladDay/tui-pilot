#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
BIN_DIR="$PROJECT_ROOT/.tui-pilot/bin"

mkdir -p "$BIN_DIR"
swiftc "$PROJECT_ROOT/native/window-helper.swift" -o "$BIN_DIR/window-helper"
