#!/bin/bash
# Start OAuth2 HTTP Server on configurable port (default 8006)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FASTMCP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Use PORT from environment if set, otherwise default to 8006
PORT="${PORT:-8006}"
export PORT

# Change to fastmcp root and run with uv
cd "$FASTMCP_ROOT"
exec uv run python -m servers.oauth2.http_server
