#!/bin/bash

# FastBuyJSON MCP Server Installation Script
# This script installs and configures the FastBuyJSON MCP Server for use with Claude Desktop

set -e

echo "🚀 FastBuyJSON MCP Server Installation"
echo "======================================"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the project
echo "🔨 Building MCP server..."
npm run build

if [ ! -f "dist/index.js" ]; then
    echo "❌ Build failed. Please check for errors above."
    exit 1
fi

echo "✅ Build successful"

# Get the absolute path to the built server
SERVER_PATH=$(realpath dist/index.js)
echo "📍 Server built at: $SERVER_PATH"

# Detect OS and set config path
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    CONFIG_DIR="$HOME/Library/Application Support/Claude"
    CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"
    elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    # Windows
    CONFIG_DIR="$APPDATA/Claude"
    CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"
else
    # Linux or other
    CONFIG_DIR="$HOME/.config/Claude"
    CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"
fi

echo "🔧 Configuring Claude Desktop..."

# Create config directory if it doesn't exist
mkdir -p "$CONFIG_DIR"

# Check if config file exists
if [ -f "$CONFIG_FILE" ]; then
    echo "⚠️  Claude Desktop config already exists at: $CONFIG_FILE"
    echo "   Please manually add the following configuration:"
    echo ""
    echo "   {"
    echo "     \"mcpServers\": {"
    echo "       \"fastbuyjson\": {"
    echo "         \"command\": \"node\","
    echo "         \"args\": [\"$SERVER_PATH\"],"
    echo "         \"env\": {"
    echo "           \"FASTBUYJSON_API_URL\": \"http://localhost:3000/api/fastbuyjson\""
    echo "         }"
    echo "       }"
    echo "     }"
    echo "   }"
    echo ""
else
    # Create new config file
    cat > "$CONFIG_FILE" << EOF
{
  "mcpServers": {
    "fastbuyjson": {
      "command": "node",
      "args": ["$SERVER_PATH"],
      "env": {
        "FASTBUYJSON_API_URL": "http://localhost:3000/api/fastbuyjson"
      }
    }
  }
}
EOF
    echo "✅ Claude Desktop config created at: $CONFIG_FILE"
fi

echo ""
echo "🎉 Installation complete!"
echo ""
echo "Next steps:"
echo "1. 🏃 Start your FastBuyJSON API server:"
echo "   cd .. && npm start"
echo "   # or: cd .. && npm run start:python"
echo ""
echo "2. 🔄 Restart Claude Desktop to load the new MCP server"
echo ""
echo "3. 💬 In Claude, you can now use commands like:"
echo "   - 'Search for wireless headphones'"
echo "   - 'Add this product to my cart'"
echo "   - 'Checkout my cart'"
echo ""
echo "4. 🔧 To customize the API URL, edit:"
echo "   $CONFIG_FILE"
echo ""
echo "📚 For more information, see README.md"
