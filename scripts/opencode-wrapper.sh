#!/bin/bash
# opencode-wrapper installer — https://github.com/tokentopapp/tokentop
# Adds a wrapper function for OpenCode that launches tokentop (ttop) on exit
# Usage: curl -fsSL https://raw.githubusercontent.com/tokentopapp/tokentop/main/scripts/opencode-wrapper.sh | sh

set -e

SHELL_CONFIGS=()
DETECTED_SHELL=""

echo "🔧 Setting up OpenCode wrapper for tokentop..."

# Detect shell and config file
if [ -n "$ZSH_VERSION" ]; then
    DETECTED_SHELL="zsh"
    SHELL_CONFIGS+=("$HOME/.zshrc")
elif [ -n "$BASH_VERSION" ]; then
    DETECTED_SHELL="bash"
    SHELL_CONFIGS+=("$HOME/.bashrc")
elif [ -n "$FISH_VERSION" ]; then
    echo "❌ Error: Fish shell not supported yet."
    echo "   This script supports bash and zsh."
    exit 1
fi

echo "   Detected shell: $DETECTED_SHELL"

# Define the wrapper function
WRAPPER_CODE='# OpenCode wrapper - launch tokentop (ttop) on exit
opencode() {
  command opencode "$@"
  ttop
}'

# Find the first existing config file
CONFIG_FILE=""
for config in "${SHELL_CONFIGS[@]}"; do
    if [ -f "$config" ]; then
        CONFIG_FILE="$config"
        break
    fi
done

if [ -z "$CONFIG_FILE" ]; then
    echo "⚠️  Warning: No shell config file found."
    echo "   Creating ~/.zshrc (since you seem to be using zsh)..."
    touch "$HOME/.zshrc"
    CONFIG_FILE="$HOME/.zshrc"
fi

echo "   Target file: $CONFIG_FILE"

# Check if wrapper is already installed
if grep -q 'opencode() {' "$CONFIG_FILE" 2>/dev/null; then
    echo "✅ OpenCode wrapper already installed in $CONFIG_FILE"
    echo ""
    echo "🚀 To start using it:"
    echo "   source $CONFIG_FILE"
    echo "   OR open a new terminal window"
    exit 0
fi

# Backup config file
BACKUP_FILE="${CONFIG_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
echo "   Backing up to: $BACKUP_FILE"
cp "$CONFIG_FILE" "$BACKUP_FILE"

# Add the wrapper to config file
echo ""
echo "   Adding wrapper function..."
echo "" >> "$CONFIG_FILE"
echo "$WRAPPER_CODE" >> "$CONFIG_FILE"

echo ""
echo "✅ OpenCode wrapper installed successfully!"
echo ""
echo "🔄 To activate immediately:"
echo "   source $CONFIG_FILE"
echo ""
echo "   OR open a new terminal window"
echo ""
echo "📝 What this does:"
echo "   When you run 'opencode' and exit, tokentop (ttop) will automatically"
echo "   launch so you can see your token usage and costs from that session."
