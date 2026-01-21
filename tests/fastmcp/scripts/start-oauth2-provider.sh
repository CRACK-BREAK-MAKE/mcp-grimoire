#!/bin/bash
# Start OAuth2 Provider on configurable port (default 9000)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FASTMCP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Use PORT from environment if set, otherwise default to 9000
PORT="${PORT:-9000}"
export PORT

# Change to fastmcp root and run with uv
cd "$FASTMCP_ROOT"
exec uv run python -c "from servers.oauth2.provider import create_app; import uvicorn; app = create_app(); uvicorn.run(app, host='127.0.0.1', port=${PORT}, log_level='error')"
