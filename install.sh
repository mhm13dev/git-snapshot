#!/bin/bash

# git-snapshot installer
# 
# One-line install:
#   curl -fsSL https://raw.githubusercontent.com/mhm13dev/git-snapshot/main/install.sh | bash
#
# Or with custom directory:
#   curl -fsSL https://raw.githubusercontent.com/mhm13dev/git-snapshot/main/install.sh | bash -s -- ~/.local/bin

set -e

# Configuration
REPO_URL="https://raw.githubusercontent.com/mhm13dev/git-snapshot/main"
SCRIPT_NAME="git-snapshot"

# Install directory (default: /usr/local/bin)
INSTALL_DIR="${1:-/usr/local/bin}"
INSTALL_PATH="$INSTALL_DIR/$SCRIPT_NAME"

echo "git-snapshot installer"
echo "======================"
echo ""

# Check if install directory exists
if [ ! -d "$INSTALL_DIR" ]; then
    echo "Error: Install directory '$INSTALL_DIR' does not exist"
    echo "Create it with: mkdir -p $INSTALL_DIR"
    exit 1
fi

# Check for curl or wget
if command -v curl &> /dev/null; then
    DOWNLOAD_CMD="curl -fsSL"
elif command -v wget &> /dev/null; then
    DOWNLOAD_CMD="wget -qO-"
else
    echo "Error: curl or wget is required"
    exit 1
fi

# Check if running from local repo or remote
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)" || SCRIPT_DIR=""
LOCAL_SOURCE="$SCRIPT_DIR/src/git-snapshot"

if [ -f "$LOCAL_SOURCE" ]; then
    echo "Installing from local source..."
    SOURCE_CONTENT=$(cat "$LOCAL_SOURCE")
else
    echo "Downloading from repository..."
    SOURCE_CONTENT=$($DOWNLOAD_CMD "$REPO_URL/src/git-snapshot")
fi

# Check if already installed
if [ -f "$INSTALL_PATH" ]; then
    echo "git-snapshot is already installed at $INSTALL_PATH"
    
    # Only prompt if running interactively
    if [ -t 0 ]; then
        read -p "Overwrite? [y/N] " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Cancelled"
            exit 0
        fi
    else
        echo "Overwriting..."
    fi
fi

# Install
echo "Installing to $INSTALL_PATH..."

if [ -w "$INSTALL_DIR" ]; then
    echo "$SOURCE_CONTENT" > "$INSTALL_PATH"
    chmod +x "$INSTALL_PATH"
else
    echo "Need sudo to write to $INSTALL_DIR"
    echo "$SOURCE_CONTENT" | sudo tee "$INSTALL_PATH" > /dev/null
    sudo chmod +x "$INSTALL_PATH"
fi

echo ""
echo "Installed successfully!"
echo ""

# Check if install dir is in PATH
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    echo "Note: $INSTALL_DIR is not in your PATH"
    echo "Add it with:"
    echo "  echo 'export PATH=\"$INSTALL_DIR:\$PATH\"' >> ~/.bashrc"
    echo "  # or for zsh:"
    echo "  echo 'export PATH=\"$INSTALL_DIR:\$PATH\"' >> ~/.zshrc"
    echo ""
fi

echo "Usage:"
echo "  git-snapshot my-checkpoint    # create snapshot"
echo "  git-snapshot list             # list snapshots"
echo "  git-snapshot restore <name>   # restore snapshot"
echo "  git-snapshot help             # show all commands"
