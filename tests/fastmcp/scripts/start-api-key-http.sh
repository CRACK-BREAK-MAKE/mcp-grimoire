#!/bin/bash
# Start API Key HTTP Server (port from PORT env var, default 8002)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FASTMCP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Change to fastmcp root and run with uv, preserving PORT env var
cd "$FASTMCP_ROOT"
exec env PORT="${PORT:-8002}" uv run python -m servers.api_key.http_server
