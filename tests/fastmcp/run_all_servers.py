#!/usr/bin/env python3
"""Quick start script to run all servers for demonstration."""

import multiprocessing
import time
from typing import Any

from src.common.constants import (
    PORT_BASIC_AUTH_HTTP,
    PORT_BASIC_AUTH_SSE,
    PORT_API_KEY_HTTP,
    PORT_API_KEY_SSE,
    PORT_SECURITY_KEYS_HTTP,
    PORT_SECURITY_KEYS_SSE,
    PORT_OAUTH2_HTTP,
    PORT_NO_AUTH_HTTP,
    PORT_NO_AUTH_SSE,
    OAUTH2_PROVIDER_PORT,
)
from src.servers.basic_auth import http_server as basic_http
from src.servers.basic_auth import sse_server as basic_sse
from src.servers.api_key import http_server as api_http
from src.servers.api_key import sse_server as api_sse
from src.servers.oauth2 import provider as oauth_provider
from src.servers.oauth2 import http_server as oauth_http
from src.servers.security_keys import http_server as security_http
from src.servers.security_keys import sse_server as security_sse
from src.servers.no_auth import http_server as no_auth_http
from src.servers.no_auth import sse_server as no_auth_sse


def run_server(create_func: Any, transport: str, port: int) -> None:
    """Run a server in a separate process.
    
    Args:
        create_func: Function that creates the server
        transport: Transport type (http or sse)
        port: Port to run on
    """
    server = create_func()
    server.run(transport=transport, port=port)


def run_oauth_provider_process() -> None:
    """Run OAuth2 provider."""
    import uvicorn
    
    app = oauth_provider.create_app()
    uvicorn.run(app, host="127.0.0.1", port=OAUTH2_PROVIDER_PORT, log_level="error", reload=True)


def main() -> None:
    """Start all servers."""
    print("Starting all FastMCP authentication servers...\n")
    
    servers = [
        ("Basic Auth HTTP", run_server, (basic_http.create_server, "http", PORT_BASIC_AUTH_HTTP)),
        ("Basic Auth SSE", run_server, (basic_sse.create_server, "sse", PORT_BASIC_AUTH_SSE)),
        ("API Key HTTP", run_server, (api_http.create_server, "http", PORT_API_KEY_HTTP)),
        ("API Key SSE", run_server, (api_sse.create_server, "sse", PORT_API_KEY_SSE)),
        ("Security Keys HTTP", run_server, (security_http.create_server, "http", PORT_SECURITY_KEYS_HTTP)),
        ("Security Keys SSE", run_server, (security_sse.create_server, "sse", PORT_SECURITY_KEYS_SSE)),
        ("OAuth2 MCP Server", run_server, (oauth_http.create_server, "http", PORT_OAUTH2_HTTP)),
        ("No Auth HTTP", run_server, (no_auth_http.create_server, "http", PORT_NO_AUTH_HTTP)),
        ("No Auth SSE", run_server, (no_auth_sse.create_server, "sse", PORT_NO_AUTH_SSE)),
        ("OAuth2 Provider", run_oauth_provider_process, ()),
    ]
    
    processes = []
    
    for name, func, args in servers:
        print(f"Starting {name}...")
        p = multiprocessing.Process(target=func, args=args, daemon=True)
        p.start()
        processes.append(p)
        time.sleep(0.5)
    
    print("\n" + "="*60)
    print("All servers are running!")
    print("="*60)
    print("\nServer URLs:")
    print(f"  Basic Auth HTTP:     http://localhost:{PORT_BASIC_AUTH_HTTP}/mcp")
    print(f"  Basic Auth SSE:      http://localhost:{PORT_BASIC_AUTH_SSE}/sse")
    print(f"  API Key HTTP:        http://localhost:{PORT_API_KEY_HTTP}/mcp")
    print(f"  API Key SSE:         http://localhost:{PORT_API_KEY_SSE}/sse")
    print(f"  Security Keys HTTP:  http://localhost:{PORT_SECURITY_KEYS_HTTP}/mcp")
    print(f"  Security Keys SSE:   http://localhost:{PORT_SECURITY_KEYS_SSE}/sse")
    print(f"  OAuth2 MCP Server:   http://localhost:{PORT_OAUTH2_HTTP}/mcp")
    print(f"  No Auth HTTP:        http://localhost:{PORT_NO_AUTH_HTTP}/mcp")
    print(f"  No Auth SSE:         http://localhost:{PORT_NO_AUTH_SSE}/sse")
    print(f"  OAuth2 Provider:     http://localhost:{OAUTH2_PROVIDER_PORT}")
    print("\nPress Ctrl+C to stop all servers")
    print("="*60 + "\n")
    
    try:
        # Keep main process alive
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n\nStopping all servers...")
        for p in processes:
            p.terminate()
        print("All servers stopped.")


if __name__ == "__main__":
    main()
