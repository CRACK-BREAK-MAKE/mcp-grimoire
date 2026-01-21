# FastMCP Authentication Examples

Production-grade MCP servers demonstrating various authentication methods using [FastMCP](https://gofastmcp.com/).

## Overview

This project showcases different authentication patterns for Model Context Protocol (MCP) servers with comprehensive logging and testing. Each server implements **practical, domain-specific tools** for real-world use cases:

1. **Basic Authentication** (HTTP & SSE) - Username/password authentication with bcrypt hashing
   - HTTP: **Project Manager v1.0** - Project management with tasks and deadlines
   - SSE: **File Storage Service v1.0** - Cloud file storage operations
2. **API Key Authentication** (HTTP & SSE) - Bearer token with API keys using constant-time comparison
   - HTTP: **Weather API v2.0** - Weather data, forecasts, and alerts
   - SSE: **News Aggregator v1.5** - News articles and trending topics
3. **Security Keys Authentication** (HTTP & SSE) - Custom security keys (GITHUB_PAT, BRAVE_API_KEY style)
   - HTTP: **Database Query Tool v1.0** - SQL queries and schema inspection
   - SSE: **Data Analytics v1.0** - Data analysis and reporting
4. **OAuth2 Client Credentials** (HTTP) - Full OAuth2 Client Credentials flow (RFC 6749) with Authorization Server
   - **Email Service v1.0** - Email operations (send, inbox, search)
5. **No Authentication** (HTTP & SSE) - Public MCP servers without authentication
   - HTTP: **Calculator & Utilities v1.0** - Calculations and unit conversions
   - SSE: **System Monitor v1.0** - CPU, memory, and disk monitoring

Each authentication method is implemented in a separate, focused server following the Single Responsibility Principle (SRP).

## Project Structure

```
tests/fastmcp/
├── src/
│   ├── common/                     # Shared utilities and middleware
│   │   ├── auth_providers.py      # Authentication helper functions
│   │   ├── constants.py           # Centralized port and server name constants
│   │   ├── logging.py             # Centralized logging configuration
│   │   ├── middleware.py          # Reusable logging middleware for servers
│   │   └── client_logging.py     # Log handlers for MCP clients
│   │
│   ├── servers/                   # MCP servers (9 servers total)
│   │   ├── basic_auth/            # Basic authentication servers
│   │   │   ├── http_server.py    # HTTP transport (port 8000)
│   │   │   └── sse_server.py     # SSE transport (port 8001)
│   │   │
│   │   ├── api_key/               # API key authentication servers
│   │   │   ├── http_server.py    # HTTP transport (port 8002)
│   │   │   └── sse_server.py     # SSE transport (port 8003)
│   │   │
│   │   ├── security_keys/         # Security keys authentication servers
│   │   │   ├── http_server.py    # HTTP transport (port 8004)
│   │   │   └── sse_server.py     # SSE transport (port 8005)
│   │   │
│   │   ├── oauth2/                # OAuth2 Client Credentials flow
│   │   │   ├── http_server.py    # OAuth2 MCP server (port 8006)
│   │   │   └── oauth_provider.py # OAuth2 Authorization Server (port 9000)
│   │   │
│   │   └── no_auth/               # No authentication servers
│   │       ├── http_server.py    # HTTP transport (port 8007)
│   │       └── sse_server.py     # SSE transport (port 8008)
│   │
│   ├── clients/                   # Test clients (4 clients total)
│   │   ├── basic_auth_client.py  # Tests Basic Auth HTTP server
│   │   ├── api_key_client.py     # Tests API Key HTTP server
│   │   ├── security_keys_client.py # Tests Security Keys server
│   │   └── oauth2_client.py      # Tests OAuth2 server
│   │
│   └── tests/                     # Comprehensive integration tests
│       ├── conftest.py            # Pytest fixtures (server startup/teardown)
│       └── test_integration.py   # 23 integration tests for all auth methods
│
├── pyproject.toml                 # Python dependencies and project config
└── README.md                      # This file
```

## Installation

### Prerequisites

- Python 3.14+
- UV package manager

### Setup

```bash
# Navigate to project directory
cd tests/fastmcp

# Install dependencies using UV
uv sync

# Or install with pip
pip install -e ".[dev]"
```

## Servers

### 1. Basic Auth HTTP Server - Project Manager v1.0 (Port 8000)

**What it does:**
- Implements HTTP Basic Authentication using username/password
- Validates credentials using bcrypt password hashing
- Returns `401 Unauthorized` with `WWW-Authenticate: Basic` header when auth fails
- **Domain:** Project management with tasks, deadlines, and status tracking
- **Tools:** `create_project`, `add_task`, `get_project_status`

**How to run:**
```bash
uv run python -m src.servers.basic_auth.http_server
```

**Authentication:**
```python
from fastmcp import Client
from src.common.auth_providers import create_basic_auth_header

auth_header = create_basic_auth_header("testuser", "testpass123")
async with Client(
    "http://localhost:8000/mcp",
    headers={"Authorization": auth_header}
) as client:
    await client.ping()
```

### 2. Basic Auth SSE Server - File Storage Service v1.0 (Port 8001)

**What it does:**
- Same as HTTP server but uses Server-Sent Events (SSE) transport
- Useful for streaming and long-lived connections
- **Domain:** Cloud file storage with upload, listing, and deletion
- **Tools:** `upload_file`, `list_files`, `delete_file`

**How to run:**
```bash
uv run python -m src.servers.basic_auth.sse_server
```

### 3. API Key HTTP Server - Weather API v2.0 (Port 8002)

**What it does:**
- Validates bearer tokens against a list of valid API keys
- Uses constant-time comparison (`hmac.compare_digest`) to prevent timing attacks
- Returns `401 Unauthorized` with `WWW-Authenticate: Bearer` header when auth fails
- **Domain:** Weather information with current conditions, forecasts, and alerts
- **Tools:** `get_current_weather`, `get_forecast`, `get_weather_alerts`

**How to run:**
```bash
# With default API keys
uv run python -m src.servers.api_key.http_server

# With custom API keys (comma-separated)
API_KEYS="key1,key2,key3" uv run python -m src.servers.api_key.http_server
```

**Authentication:**
```python
async with Client("http://localhost:8002/mcp", auth="test-api-key-12345") as client:
    await client.ping()
```

### 4. API Key SSE Server - News Aggregator v1.5 (Port 8003)

**What it does:**
- Same as HTTP server but uses Server-Sent Events (SSE) transport
- Includes additional logging middleware to demonstrate request header logging
- **Domain:** News aggregation with articles, search, and trending topics
- **Tools:** `get_latest_news`, `search_news`, `get_trending_topics`

**How to run:**
```bash
uv run python -m src.servers.api_key.sse_server
```

### 5. Security Keys HTTP Server - Database Query Tool v1.0 (Port 8004)

**What it does:**
- Authenticates using custom security keys (GitHub PAT, Brave API Key formats)
- Validates keys using custom header names (`X-GitHub-Token`, `X-Brave-Key`)
- Demonstrates multi-key-type authentication in a single server
- **Domain:** Database operations with SQL queries, schema inspection, and exports
- **Tools:** `run_sql_query`, `get_table_schema`, `export_query_results`

**How to run:**
```bash
# With default keys
uv run python -m src.servers.security_keys.http_server

# With custom keys
GITHUB_PATS="ghp_token1,ghp_token2" BRAVE_API_KEYS="BSA_key1" uv run python -m src.servers.security_keys.http_server
```

**Authentication:**
```python
from fastmcp.client.transports import StreamableHttpTransport

# Using GitHub PAT
transport = StreamableHttpTransport(
    "http://localhost:8004/mcp",
    headers={"X-GitHub-Token": "ghp_test1234567890abcdefghijklmnopqrstuvwxyz"}
)
async with Client(transport) as client:
    await client.ping()
```

### 6. Security Keys SSE Server - Data Analytics v1.0 (Port 8005)

**What it does:**
- Same authentication as HTTP server but uses Server-Sent Events (SSE) transport
- Demonstrates multi-key authentication with SSE protocol
- **Domain:** Data analysis, reporting, and statistics calculations
- **Tools:** `analyze_dataset`, `generate_report`, `calculate_statistics`

**How to run:**
```bash
# With default keys
uv run python -m src.servers.security_keys.sse_server

# With custom keys
GITHUB_PATS="ghp_token1,ghp_token2" BRAVE_API_KEYS="BSA_key1" uv run python -m src.servers.security_keys.sse_server
```

**Authentication:**
```python
from fastmcp.client.transports import SseTransport

# Using GitHub PAT with SSE
transport = SseTransport(
    "http://localhost:8005/sse",
    headers={"X-GitHub-Token": "ghp_test1234567890abcdefghijklmnopqrstuvwxyz"}
)
async with Client(transport) as client:
    await client.ping()
```

### 7. OAuth2 HTTP Server - Email Service v1.0 (Port 8006)

**What it does:**
- Implements **OAuth2 Client Credentials flow** (RFC 6749 Section 4.4)
- Returns `401 Unauthorized` with `WWW-Authenticate: Bearer` header containing Protected Resource Metadata (PRM) URL
- Automatically creates PRM endpoint at `/.well-known/oauth-protected-resource/mcp` (RFC 9728)
- Validates Bearer tokens by calling OAuth2 provider's `/oauth/validate` endpoint
- **Domain:** Email service with send, inbox management, and search
- **Tools:** `send_email`, `get_inbox`, `search_emails`

**How to run:**
```bash
# Start OAuth2 provider FIRST
uv run python -m src.servers.oauth2.oauth_provider

# Then start MCP server (in another terminal)
uv run python -m src.servers.oauth2.http_server
```

**OAuth2 Flow:**
1. Client tries to connect without token → Gets `401` with PRM URL in `WWW-Authenticate` header
2. Client fetches PRM from `/.well-known/oauth-protected-resource/mcp` (public, no auth)
3. Client discovers Authorization Server URL from PRM's `authorization_servers` array
4. Client fetches AS metadata from `/.well-known/oauth-authorization-server`
5. Client requests access token from AS token endpoint using `client_id` and `client_secret`
6. Client retries MCP request with `Authorization: Bearer <token>` header
7. Server validates token and grants access

**Authentication:**
```python
import httpx

# Step 1: Get access token from OAuth2 provider
async with httpx.AsyncClient() as client:
    response = await client.post(
        "http://localhost:9000/oauth/token",
        data={
            "grant_type": "client_credentials",
            "client_id": "test-client-id",
            "client_secret": "test-client-secret",
            "scope": "mcp:tools:read mcp:tools:write"
        }
    )
    access_token = response.json()["access_token"]

# Step 2: Use token with MCP server
from fastmcp.client.transports import StreamableHttpTransport
transport = StreamableHttpTransport(
    "http://localhost:8006/mcp",
    headers={"Authorization": f"Bearer {access_token}"}
)
async with Client(transport) as client:
    await client.ping()
```

### 7. OAuth2 Authorization Server (Port 9000)

**What it does:**
- Acts as OAuth2 Authorization Server for the OAuth2 MCP server
- Implements OAuth2 Client Credentials grant type (RFC 6749 Section 4.4)
- Provides AS metadata at `/.well-known/oauth-authorization-server` (RFC 8414)
- Issues JWT access tokens with configurable expiration (default: 1 hour)
- Validates tokens via `/oauth/validate` endpoint
- Supports scopes: `mcp:tools:read`, `mcp:tools:write`

**Endpoints:**
- `GET /.well-known/oauth-authorization-server` - AS metadata (public)
- `POST /oauth/token` - Token issuance endpoint (requires client credentials)
- `POST /oauth/validate` - Token validation endpoint (used by resource servers)

### 8. No Auth HTTP Server - Calculator & Utilities v1.0 (Port 8007)

**What it does:**
- Public MCP server with no authentication required
- Demonstrates baseline server functionality
- **Domain:** Mathematical calculations, unit conversions, and random generation
- **Tools:** `calculate`, `convert_units`, `generate_random`

**How to run:**
```bash
uv run python -m src.servers.no_auth.http_server
```

**Usage:**
```python
async with Client("http://localhost:8007/mcp") as client:
    await client.ping()
```

### 9. No Auth SSE Server - System Monitor v1.0 (Port 8008)

**What it does:**
- Same as HTTP server but uses Server-Sent Events (SSE) transport
- Public server for testing SSE without authentication complexity
- **Domain:** System resource monitoring (CPU, memory, disk)
- **Tools:** `get_cpu_usage`, `get_memory_stats`, `get_disk_usage`

**How to run:**
```bash
uv run python -m src.servers.no_auth.sse_server
```

## Clients

### 1. Basic Auth Client

**What it does:**
- Tests Basic Auth HTTP server connectivity
- Demonstrates username/password authentication
- Calls **Project Manager v1.0** tools: `create_project`, `add_task`, `get_project_status`
- Shows proper error handling for invalid credentials

**How to run:**
```bash
uv run python -m src.clients.basic_auth_client
```

### 2. API Key Client

**What it does:**
- Tests API Key HTTP server connectivity
- Demonstrates bearer token authentication
- Calls **Weather API v2.0** tools: `get_current_weather`, `get_forecast`, `get_weather_alerts`
- Shows proper error handling for invalid API keys

**How to run:**
```bash
uv run python -m src.clients.api_key_client
```

### 3. Security Keys Client

**What it does:**
- Tests Security Keys HTTP server connectivity
- Demonstrates custom header authentication (GitHub PAT, Brave API Key)
- Calls **Database Query Tool v1.0** tools: `run_sql_query`, `get_table_schema`
- Shows multi-key-type authentication

**How to run:**
```bash
uv run python -m src.clients.security_keys_client
```

### 4. OAuth2 Client

**What it does:**
- Tests OAuth2 HTTP server connectivity
- Demonstrates full OAuth2 Client Credentials flow
- Obtains access token from Authorization Server
- Uses token to authenticate with MCP server
- Calls **Email Service v1.0** tools: `send_email`, `get_inbox`, `search_emails`

**How to run:**
```bash
# Ensure OAuth2 provider and server are running first
uv run python -m src.clients.oauth2_client
```

## Logging

### Centralized Logging System

All servers and clients use a centralized logging system for consistent, structured logging:

**[src/common/logging.py](src/common/logging.py):**
- `get_logger(__name__)` - Returns configured logger for a module
- `setup_logging(log_level, log_format)` - Configures root logger with level and format
- `log_startup(logger, server_name, port, auth_type, transport)` - Logs server startup info
- `mask_sensitive_value(value)` - Masks sensitive data (passwords, tokens) in logs

**[src/common/middleware.py](src/common/middleware.py):**
- `StructuredLoggingMiddleware` - Logs HTTP requests/responses with timing and status
- `RequestHeaderLoggingMiddleware` - Logs request headers (useful for debugging auth)
- `get_default_logging_middleware()` - Returns standard logging middleware configuration
- `add_standard_middleware(mcp, server_name, include_payload_length)` - Adds logging middleware to FastMCP server

**[src/common/client_logging.py](src/common/client_logging.py):**
- `setup_client_logging(client_name)` - Configures logging for MCP clients
- `create_request_log_handler()` - Logs outgoing MCP requests
- `create_response_log_handler()` - Logs incoming MCP responses

**Features:**
- **Structured Logging**: JSON-like format with timestamps, levels, and context
- **Request/Response Logging**: Automatic logging of all HTTP requests and responses
- **Performance Metrics**: Request duration tracking
- **Sensitive Data Masking**: Automatic masking of passwords, tokens, and secrets
- **Consistent Format**: All servers and clients use the same logging format

**Example log output:**
```
2026-01-21 10:30:45 INFO [API_KEY_HTTP] Server starting on port 8002
2026-01-21 10:30:45 INFO [API_KEY_HTTP] Auth type: API Key
2026-01-21 10:30:45 INFO [API_KEY_HTTP] Transport: HTTP
2026-01-21 10:30:50 INFO [MIDDLEWARE] POST /mcp → 200 OK (15ms)
```

## Integration Tests

## Integration Tests

### Overview

The test suite includes **23 comprehensive integration tests** that validate all authentication methods, error handling, and end-to-end flows.

**[src/tests/conftest.py](src/tests/conftest.py):**
- Pytest fixtures for automatic server startup and teardown
- Session-scoped OAuth2 provider to avoid port conflicts
- Port availability checking before server startup
- Graceful server cleanup after tests
- Shared test credentials for all authentication methods

**[src/tests/test_integration.py](src/tests/test_integration.py):**

### Test Classes (23 tests total):

#### 1. TestBasicAuthHTTP (3 tests)
- ✅ `test_with_valid_credentials` - Successful auth with correct username/password
- ✅ `test_without_credentials` - Fails without auth header (401)
- ✅ `test_with_invalid_credentials` - Fails with wrong password (401)

#### 2. TestBasicAuthSSE (1 test)
- ✅ `test_with_valid_credentials` - SSE connection with Basic Auth

#### 3. TestAPIKeyHTTP (3 tests)
- ✅ `test_with_valid_api_key` - Successful auth with valid API key
- ✅ `test_without_api_key` - Fails without bearer token (401)
- ✅ `test_with_invalid_api_key` - Fails with invalid key (401)

#### 4. TestAPIKeySSE (1 test)
- ✅ `test_with_valid_api_key` - SSE connection with API key

#### 5. TestSecurityKeys (4 tests)
- ✅ `test_with_github_pat` - Auth with GitHub PAT token
- ✅ `test_with_brave_api_key` - Auth with Brave API key
- ✅ `test_without_security_key` - Fails without custom header (401)
- ✅ `test_with_invalid_security_key` - Fails with invalid key (401)

#### 6. TestOAuth2ClientCredentials (3 tests)
- ✅ `test_with_client_credentials` - Full OAuth2 token request and MCP connection
- ✅ `test_without_credentials` - Fails without Bearer token (401)
- ✅ `test_with_invalid_credentials` - Fails with invalid client_id/secret (401)

#### 7. TestNoAuthHTTP (1 test)
- ✅ `test_without_authentication` - Public server access without auth

#### 8. TestNoAuthSSE (1 test)
- ✅ `test_without_authentication` - Public SSE server access

#### 9. TestEndToEnd (1 test)
- ✅ `test_all_servers_running` - Verifies all servers are reachable and functional

#### 10. TestOAuth2HTTP (5 tests)
- ✅ `test_oauth2_client_credentials_end_to_end` - **Complete OAuth2 flow with detailed logging:**
  - Step 1: Initial request without token → HTTP 401
  - Step 2: Extract PRM URL from WWW-Authenticate header
  - Step 3: Fetch Protected Resource Metadata (public endpoint)
  - Step 4: Discover Authorization Server URL from PRM
  - Step 5: Fetch AS metadata from well-known endpoint
  - Step 6: Request access token with client credentials
  - Step 7: Connect MCP client with Bearer token and call tools
- ✅ `test_oauth2_invalid_token_rejected` - Invalid tokens are rejected (401)
- ✅ `test_oauth2_client_credentials_flow` - Programmatic OAuth2 flow test
- ✅ `test_without_token` - Fails without Bearer token (401)
- ✅ `test_with_invalid_token` - Fails with fake/expired token (401)

### Running Tests

```bash
# Run all 23 tests
uv run pytest src/tests/test_integration.py -v

# Run specific test class
uv run pytest src/tests/test_integration.py::TestOAuth2HTTP -v

# Run specific test
uv run pytest src/tests/test_integration.py::TestOAuth2HTTP::test_oauth2_client_credentials_end_to_end -v -s

# Run with coverage
uv run pytest src/tests/test_integration.py --cov=src --cov-report=html

# Run with verbose output and show print statements
uv run pytest src/tests/test_integration.py -v -s
```

### Test Features

- **Automatic Server Management**: Fixtures start/stop servers automatically
- **AAA Pattern**: All tests follow Arrange-Act-Assert pattern
- **Comprehensive Coverage**: Tests success and failure paths
- **Port Management**: Centralized port configuration prevents conflicts
- **Session Scoping**: OAuth2 provider runs once per test session for efficiency
- **Error Validation**: Tests verify correct HTTP status codes (401, 200)
- **Tool Execution**: Tests actually call MCP tools to verify full functionality
- **Detailed Logging**: OAuth2 end-to-end test shows complete flow with step-by-step logs

### Test Output Example

```
✅ Step 1: Got 401 with WWW-Authenticate header
✅ Step 2: Fetched PRM: {'resource': 'http://localhost:8006/mcp', ...}
✅ Step 3: Authorization Server: http://localhost:9000
✅ Step 4: Token endpoint: http://localhost:9000/oauth/token
✅ Step 5: Got access token: eyJhbGciOiJIUzI1NiIsInR5cC...
✅ Step 6: MCP Client connected successfully
✅ send_email: Email sent to user@example.com with subject 'Test' (ID: email_abc123)
✅ OAuth2 Client Credentials flow completed successfully!
```

## Environment Variables

### Port Configuration (Centralized in [src/common/constants.py](src/common/constants.py))
- `PORT_BASIC_AUTH_HTTP` - Basic Auth HTTP server port (default: 8000)
- `PORT_BASIC_AUTH_SSE` - Basic Auth SSE server port (default: 8001)
- `PORT_API_KEY_HTTP` - API Key HTTP server port (default: 8002)
- `PORT_API_KEY_SSE` - API Key SSE server port (default: 8003)
- `PORT_SECURITY_KEYS_HTTP` - Security Keys server port (default: 8004)
- `PORT_OAUTH2_HTTP` - OAuth2 MCP server port (default: 8006)
- `PORT_NO_AUTH_HTTP` - No Auth HTTP server port (default: 8007)
- `PORT_NO_AUTH_SSE` - No Auth SSE server port (default: 8008)
- `OAUTH2_PROVIDER_PORT` - OAuth2 Authorization Server port (default: 9000)

### Authentication Credentials

**Basic Auth:**
- `AUTH_USERNAME` - Username (default: "testuser")
- `AUTH_PASSWORD` - Password (default: "testpass123")

**API Key:**
- `API_KEYS` - Comma-separated list of valid API keys (default: "test-api-key-12345")

**Security Keys:**
- `GITHUB_PATS` - Comma-separated GitHub PATs (default: "ghp_test1234567890abcdefghijklmnopqrstuvwxyz")
- `BRAVE_API_KEYS` - Comma-separated Brave keys (default: "BSA_test1234567890abcdefghijklmnopqrstuvwxyz")

**OAuth2:**
- `OAUTH2_CLIENT_ID` - OAuth2 client ID (default: "test-client-id")
- `OAUTH2_CLIENT_SECRET` - OAuth2 client secret (default: "test-client-secret")
- `TOKEN_EXPIRY` - Access token expiration in seconds (default: 3600)

## Architecture

### Key Principles

1. **Single Responsibility Principle (SRP)**
   - Each server file implements ONE authentication method for ONE transport
   - Each client tests ONE authentication method
   - Each module has one clear purpose

2. **Don't Repeat Yourself (DRY)**
   - Centralized logging in `src/common/logging.py`
   - Shared middleware in `src/common/middleware.py`
   - Port constants in `src/common/constants.py`
   - Common auth helpers in `src/common/auth_providers.py`

3. **Security Best Practices**
   - **Password Hashing**: Basic auth uses bcrypt (work factor: 12)
   - **Constant-Time Comparison**: API keys use `hmac.compare_digest()` to prevent timing attacks
   - **Token Validation**: OAuth2 tokens are validated via Authorization Server
   - **No Hardcoded Secrets**: All credentials from environment variables
   - **Sensitive Data Masking**: Automatic masking in logs

4. **Comprehensive Logging**
   - Structured logging with timestamps and levels
   - Request/response logging with timing metrics
   - Automatic sensitive data masking (passwords, tokens)
   - Consistent format across all servers and clients

5. **Robust Testing**
   - 23 integration tests covering all authentication methods
   - Tests both success and failure paths
   - Automatic server lifecycle management
   - AAA (Arrange-Act-Assert) pattern throughout

### OAuth2 Client Credentials Flow (RFC 6749)

Our implementation follows the official OAuth2 specification exactly:

1. **Initial Request**: Client tries to access MCP server → `401 Unauthorized` with `WWW-Authenticate: Bearer` header
2. **PRM Discovery**: Client extracts Protected Resource Metadata URL from header
3. **PRM Fetch**: Client fetches PRM (public endpoint, no auth) per RFC 9728
4. **AS Discovery**: Client extracts Authorization Server URL from PRM's `authorization_servers` array
5. **AS Metadata**: Client fetches AS metadata from `/.well-known/oauth-authorization-server` (RFC 8414)
6. **Token Request**: Client sends `POST` to token endpoint with:
   - `grant_type=client_credentials`
   - `client_id` and `client_secret`
   - `scope` (requested permissions)
7. **Token Response**: AS validates credentials and returns JWT access token with expiration
8. **Authenticated Request**: Client retries MCP request with `Authorization: Bearer <token>`
9. **Token Validation**: MCP server validates token via AS's `/oauth/validate` endpoint
10. **Access Granted**: Server processes request and returns response

This is true machine-to-machine (M2M) authentication without human interaction.

## Quick Start

### Run All Servers

```bash
# Terminal 1: OAuth2 Provider
uv run python -m src.servers.oauth2.oauth_provider

# Terminal 2: All other servers in background
uv run python -m src.servers.basic_auth.http_server &
uv run python -m src.servers.basic_auth.sse_server &
uv run python -m src.servers.api_key.http_server &
uv run python -m src.servers.api_key.sse_server &
uv run python -m src.servers.security_keys.http_server &
uv run python -m src.servers.oauth2.http_server &
uv run python -m src.servers.no_auth.http_server &
uv run python -m src.servers.no_auth.sse_server &
```

### Run All Tests

```bash
uv run pytest src/tests/test_integration.py -v
```

### Test Individual Clients

```bash
# Test each client
uv run python -m src.clients.basic_auth_client
uv run python -m src.clients.api_key_client
uv run python -m src.clients.security_keys_client
uv run python -m src.clients.oauth2_client
```
