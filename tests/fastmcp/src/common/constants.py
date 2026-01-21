"""Shared constants used across the project."""

# Server port assignments (SINGLE SOURCE OF TRUTH)
# These ports MUST match the test expectations in test-server-manager.ts
PORT_BASIC_AUTH_HTTP = 8000
PORT_BASIC_AUTH_SSE = 8001
PORT_API_KEY_HTTP = 8002
PORT_API_KEY_SSE = 8003
PORT_SECURITY_KEYS_HTTP = 8004
PORT_SECURITY_KEYS_SSE = 8005
PORT_OAUTH2_HTTP = 8006
PORT_NO_AUTH_HTTP = 8007
PORT_NO_AUTH_SSE = 8008
OAUTH2_PROVIDER_PORT = 9000

# Legacy aliases (deprecated - use specific PORT_* constants above)
DEFAULT_HTTP_PORT = 8000
DEFAULT_SSE_PORT = 8001

# Default credentials for testing
DEFAULT_USERNAME = "testuser"
DEFAULT_PASSWORD = "testpass123"
DEFAULT_API_KEY = "test-api-key-12345"
DEFAULT_GITHUB_PAT = "ghp_test1234567890abcdefghijklmnopqrstuvwxyz"
DEFAULT_BRAVE_API_KEY = "BSA1234567890abcdefghijklmnopqrstuvwxyz"

# OAuth2 defaults
DEFAULT_OAUTH2_CLIENT_ID = "test-client-id"
DEFAULT_OAUTH2_CLIENT_SECRET = "test-client-secret"
DEFAULT_OAUTH2_TOKEN_EXPIRY = 3600  # 1 hour in seconds

# Server names - User-friendly with versions
SERVER_NAME_BASIC_HTTP = "Project Manager v1.0"
SERVER_NAME_BASIC_SSE = "File Storage Service v1.0"
SERVER_NAME_API_KEY_HTTP = "Weather API v2.0"
SERVER_NAME_API_KEY_SSE = "News Aggregator v1.5"
SERVER_NAME_SECURITY_KEYS = "Database Query Tool v1.0"
SERVER_NAME_SECURITY_KEYS_SSE = "Database Query Tool SSE v1.0"
SERVER_NAME_OAUTH2 = "Email Service v1.0"
SERVER_NAME_NO_AUTH_HTTP = "Calculator & Utilities v1.0"
SERVER_NAME_NO_AUTH_SSE = "System Monitor v1.0"
