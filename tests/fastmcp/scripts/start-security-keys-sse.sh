#!/bin/bash
# Start Security Keys SSE Server on port 8005

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FASTMCP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Change to fastmcp root and run with uv
cd "$FASTMCP_ROOT"
exec uv run python -m servers.security_keys.sse_server
