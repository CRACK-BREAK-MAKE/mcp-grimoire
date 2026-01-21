#!/bin/bash
# Start Basic Auth HTTP Server on port 8000

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FASTMCP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Change to fastmcp root and run with uv
cd "$FASTMCP_ROOT"
exec uv run python -m servers.basic_auth.http_server
