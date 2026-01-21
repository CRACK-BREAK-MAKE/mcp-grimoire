"""Pytest configuration and fixtures."""

import asyncio
import logging
import multiprocessing
import os
import signal
import socket
import time
from collections.abc import Generator

import pytest
import uvicorn

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from common.constants import (
    DEFAULT_API_KEY,
    DEFAULT_BRAVE_API_KEY,
    DEFAULT_GITHUB_PAT,
    DEFAULT_HTTP_PORT,
    DEFAULT_OAUTH2_CLIENT_ID,
    DEFAULT_OAUTH2_CLIENT_SECRET,
    DEFAULT_PASSWORD,
    DEFAULT_SSE_PORT,
    DEFAULT_USERNAME,
    OAUTH2_PROVIDER_PORT,
    PORT_NO_AUTH_HTTP,
    PORT_OAUTH2_HTTP,
)


def is_port_in_use(port: int) -> bool:
    """Check if a port is in use.
    
    Args:
        port: Port number to check
        
    Returns:
        True if port is in use, False otherwise
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0


def wait_for_port(port: int, timeout: int = 10) -> bool:
    """Wait for a port to become available.
    
    Args:
        port: Port number to wait for
        timeout: Maximum seconds to wait
        
    Returns:
        True if port is available, False if timeout
    """
    start_time = time.time()
    while time.time() - start_time < timeout:
        if is_port_in_use(port):
            return True
        time.sleep(0.2)
    return False


def wait_for_port_release(port: int, timeout: int = 5) -> bool:
    """Wait for a port to be released (no longer in use).
    
    Args:
        port: Port number to wait for
        timeout: Maximum seconds to wait
        
    Returns:
        True if port is released, False if timeout
    """
    start_time = time.time()
    while time.time() - start_time < timeout:
        if not is_port_in_use(port):
            return True
        time.sleep(0.1)
    return False


def cleanup_process(process: multiprocessing.Process, port: int, server_name: str) -> None:
    """Cleanup a server process forcefully.
    
    Args:
        process: The process to cleanup
        port: Port the server is running on
        server_name: Name of the server for logging
    """
    logger.info(f"[CLEANUP] Stopping {server_name} on port {port}")
    
    # Try graceful termination first
    if process.is_alive():
        logger.debug(f"[CLEANUP] Terminating {server_name} process (PID: {process.pid})")
        process.terminate()
        process.join(timeout=5)  # Increased from 2s to 5s for FastMCP background workers
    
    # Force kill if still alive
    if process.is_alive():
        logger.warning(f"[CLEANUP] Force killing {server_name} (PID: {process.pid})")
        process.kill()
        process.join(timeout=1)
    
    # Wait for port to be released
    if is_port_in_use(port):
        logger.debug(f"[CLEANUP] Waiting for port {port} to be released")
        if not wait_for_port_release(port, timeout=3):
            logger.warning(f"[CLEANUP] Port {port} still in use after cleanup")
        else:
            logger.info(f"[CLEANUP] Port {port} released successfully")
    
    logger.info(f"[CLEANUP] {server_name} cleanup complete")


def run_server_process(server_module: str, port: int) -> None:
    """Run a server in a separate process.

    Args:
        server_module: Python module path of the server
        port: Port to run the server on
    """
    import importlib

    module = importlib.import_module(server_module)
    server = module.create_server()

    # Determine transport from module name
    transport = "sse" if "sse" in server_module else "http"

    server.run(transport=transport, port=port, log_level="error")


def run_oauth_provider(port: int) -> None:
    """Run OAuth2 provider in a separate process.

    Args:
        port: Port to run the provider on
    """
    from servers.oauth2.provider import create_app

    app = create_app()
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="error")


@pytest.fixture
def event_loop() -> Generator:
    """Create event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


# Function-scoped fixtures for per-test server management (AAA pattern)


@pytest.fixture
def basic_auth_http_server() -> Generator:
    """Start Basic Auth HTTP server for testing (port 8000).
    
    AAA Pattern:
    - Arrange: Start server and wait for port
    - Act: Test runs (yield)
    - Cleanup: Stop server
    """
    port = 8000
    server_name = "Basic Auth HTTP"
    
    # Ensure port is free before starting
    if is_port_in_use(port):
        raise RuntimeError(f"Port {port} already in use before starting {server_name} server")
    
    logger.info(f"[SETUP] Starting {server_name} server on port {port}")
    process = multiprocessing.Process(
        target=run_server_process,
        args=("servers.basic_auth.http_server", port),
        daemon=True,
    )
    process.start()
    
    # Wait for server to be ready
    if not wait_for_port(port, timeout=10):
        cleanup_process(process, port, server_name)
        raise RuntimeError(f"{server_name} server failed to start on port {port}")
    
    logger.info(f"[SETUP] {server_name} server ready on port {port}")
    
    try:
        yield
    finally:
        cleanup_process(process, port, server_name)


@pytest.fixture
def basic_auth_sse_server() -> Generator:
    """Start Basic Auth SSE server for testing (port 8001).
    
    AAA Pattern:
    - Arrange: Start server and wait for port
    - Act: Test runs (yield)
    - Cleanup: Stop server
    """
    port = 8001
    server_name = "Basic Auth SSE"
    
    if is_port_in_use(port):
        raise RuntimeError(f"Port {port} already in use before starting {server_name} server")
    
    logger.info(f"[SETUP] Starting {server_name} server on port {port}")
    process = multiprocessing.Process(
        target=run_server_process,
        args=("servers.basic_auth.sse_server", port),
        daemon=True,
    )
    process.start()
    
    if not wait_for_port(port, timeout=10):
        cleanup_process(process, port, server_name)
        raise RuntimeError(f"{server_name} server failed to start on port {port}")
    
    logger.info(f"[SETUP] {server_name} server ready on port {port}")
    
    try:
        yield
    finally:
        cleanup_process(process, port, server_name)


@pytest.fixture
def api_key_http_server() -> Generator:
    """Start API Key HTTP server for testing (port 8002).
    
    AAA Pattern:
    - Arrange: Start server and wait for port
    - Act: Test runs (yield)
    - Cleanup: Stop server
    """
    port = 8002
    server_name = "API Key HTTP"
    
    if is_port_in_use(port):
        raise RuntimeError(f"Port {port} already in use before starting {server_name} server")
    
    logger.info(f"[SETUP] Starting {server_name} server on port {port}")
    process = multiprocessing.Process(
        target=run_server_process,
        args=("servers.api_key.http_server", port),
        daemon=True,
    )
    process.start()
    
    if not wait_for_port(port, timeout=10):
        cleanup_process(process, port, server_name)
        raise RuntimeError(f"{server_name} server failed to start on port {port}")
    
    logger.info(f"[SETUP] {server_name} server ready on port {port}")
    
    try:
        yield
    finally:
        cleanup_process(process, port, server_name)


@pytest.fixture
def api_key_sse_server() -> Generator:
    """Start API Key SSE server for testing (port 8003).
    
    AAA Pattern:
    - Arrange: Start server and wait for port
    - Act: Test runs (yield)
    - Cleanup: Stop server
    """
    port = 8003
    server_name = "API Key SSE"
    
    if is_port_in_use(port):
        raise RuntimeError(f"Port {port} already in use before starting {server_name} server")
    
    logger.info(f"[SETUP] Starting {server_name} server on port {port}")
    process = multiprocessing.Process(
        target=run_server_process,
        args=("servers.api_key.sse_server", port),
        daemon=True,
    )
    process.start()
    
    if not wait_for_port(port, timeout=10):
        cleanup_process(process, port, server_name)
        raise RuntimeError(f"{server_name} server failed to start on port {port}")
    
    logger.info(f"[SETUP] {server_name} server ready on port {port}")
    
    try:
        yield
    finally:
        cleanup_process(process, port, server_name)


@pytest.fixture
def security_keys_server() -> Generator:
    """Start Security Keys HTTP server for testing (port 8004).
    
    AAA Pattern:
    - Arrange: Start server and wait for port
    - Act: Test runs (yield)
    - Cleanup: Stop server
    """
    port = 8004
    server_name = "Security Keys"
    
    if is_port_in_use(port):
        raise RuntimeError(f"Port {port} already in use before starting {server_name} server")
    
    logger.info(f"[SETUP] Starting {server_name} server on port {port}")
    process = multiprocessing.Process(
        target=run_server_process,
        args=("servers.security_keys.http_server", port),
        daemon=True,
    )
    process.start()
    
    if not wait_for_port(port, timeout=10):
        cleanup_process(process, port, server_name)
        raise RuntimeError(f"{server_name} server failed to start on port {port}")
    
    logger.info(f"[SETUP] {server_name} server ready on port {port}")
    
    try:
        yield
    finally:
        cleanup_process(process, port, server_name)


@pytest.fixture
def oauth2_http_server(oauth2_provider) -> Generator:
    """Start OAuth2 HTTP server for testing.
    
    Requires oauth2_provider to be running.
    
    AAA Pattern:
    - Arrange: Start server and wait for port
    - Act: Test runs (yield)
    - Cleanup: Stop server
    """
    port = PORT_OAUTH2_HTTP
    server_name = "OAuth2 HTTP"
    
    if is_port_in_use(port):
        raise RuntimeError(f"Port {port} already in use before starting {server_name} server")
    
    logger.info(f"[SETUP] Starting {server_name} server on port {port}")
    process = multiprocessing.Process(
        target=run_server_process,
        args=("servers.oauth2.http_server", port),
        daemon=True,
    )
    process.start()
    
    if not wait_for_port(port, timeout=10):
        cleanup_process(process, port, server_name)
        raise RuntimeError(f"{server_name} server failed to start on port {port}")
    
    logger.info(f"[SETUP] {server_name} server ready on port {port}")
    
    try:
        yield
    finally:
        cleanup_process(process, port, server_name)


@pytest.fixture
def no_auth_http_server() -> Generator:
    """Start No Auth HTTP server for testing.
    
    AAA Pattern:
    - Arrange: Start server and wait for port
    - Act: Test runs (yield)
    - Cleanup: Stop server
    """
    port = PORT_NO_AUTH_HTTP
    server_name = "No Auth HTTP"
    
    if is_port_in_use(port):
        raise RuntimeError(f"Port {port} already in use before starting {server_name} server")
    
    logger.info(f"[SETUP] Starting {server_name} server on port {port}")
    process = multiprocessing.Process(
        target=run_server_process,
        args=("servers.no_auth.http_server", port),
        daemon=True,
    )
    process.start()
    
    if not wait_for_port(port, timeout=10):
        cleanup_process(process, port, server_name)
        raise RuntimeError(f"{server_name} server failed to start on port {port}")
    
    logger.info(f"[SETUP] {server_name} server ready on port {port}")
    
    try:
        yield
    finally:
        cleanup_process(process, port, server_name)


@pytest.fixture
def no_auth_sse_server() -> Generator:
    """Start No Auth SSE server for testing (port 8007).
    
    AAA Pattern:
    - Arrange: Start server and wait for port
    - Act: Test runs (yield)
    - Cleanup: Stop server
    """
    port = 8007
    server_name = "No Auth SSE"
    
    if is_port_in_use(port):
        raise RuntimeError(f"Port {port} already in use before starting {server_name} server")
    
    logger.info(f"[SETUP] Starting {server_name} server on port {port}")
    process = multiprocessing.Process(
        target=run_server_process,
        args=("servers.no_auth.sse_server", port),
        daemon=True,
    )
    process.start()
    
    if not wait_for_port(port, timeout=10):
        cleanup_process(process, port, server_name)
        raise RuntimeError(f"{server_name} server failed to start on port {port}")
    
    logger.info(f"[SETUP] {server_name} server ready on port {port}")
    
    try:
        yield
    finally:
        cleanup_process(process, port, server_name)


@pytest.fixture
def test_credentials() -> dict:
    """Provide test credentials for all auth types.

    Returns:
        Dictionary with test credentials
    """
    return {
        "username": DEFAULT_USERNAME,
        "password": DEFAULT_PASSWORD,
        "api_key": DEFAULT_API_KEY,
        "github_pat": DEFAULT_GITHUB_PAT,
        "brave_api_key": DEFAULT_BRAVE_API_KEY,
        "oauth2_client_id": DEFAULT_OAUTH2_CLIENT_ID,
        "oauth2_client_secret": DEFAULT_OAUTH2_CLIENT_SECRET,
    }

@pytest.fixture(scope="session")
def oauth2_provider_server() -> Generator:
    """Start OAuth2 Provider (Authorization Server) for testing (port 9000).
    
    Uses session scope since the provider can be shared across all tests.
    
    AAA Pattern:
    - Arrange: Start OAuth2 provider and wait for port
    - Act: Test runs (yield)
    - Cleanup: Stop provider
    """
    port = OAUTH2_PROVIDER_PORT
    server_name = "OAuth2 Provider"
    
    if is_port_in_use(port):
        raise RuntimeError(f"Port {port} already in use before starting {server_name}")
    
    logger.info(f"[SETUP] Starting {server_name} on port {port}")
    process = multiprocessing.Process(
        target=run_oauth_provider,
        args=(port,),
        daemon=True,
    )
    process.start()
    
    if not wait_for_port(port, timeout=10):
        cleanup_process(process, port, server_name)
        raise RuntimeError(f"{server_name} failed to start on port {port}")
    
    logger.info(f"[SETUP] {server_name} ready on port {port}")
    
    try:
        yield
    finally:
        cleanup_process(process, port, server_name)


def run_oauth2_http_server(port: int):
    """Run OAuth2 HTTP server with MCP + separate PRM server.
    
    Must be defined at module level for multiprocessing pickling.
    Runs both MCP server (port) and PRM server (port+1) via threading.
    """
    import sys
    import os
    from pathlib import Path
    
    # Set up Python path
    src_path = str(Path(__file__).parent.parent.absolute())
    if src_path not in sys.path:
        sys.path.insert(0, src_path)
    
    # Set environment
    os.environ["PORT"] = str(port)
    os.environ["OAUTH2_PROVIDER_PORT"] = str(OAUTH2_PROVIDER_PORT)
    
    # Import and run - the module's __main__ handles both servers
    import runpy
    runpy.run_module("servers.oauth2.http_server", run_name="__main__")


@pytest.fixture
def oauth2_http_server(oauth2_provider_server) -> Generator:
    """Start OAuth2 HTTP server for testing.
    
    Depends on oauth2_provider_server to ensure AS is running first.
    Uses the combined Starlette app with both PRM and MCP endpoints.
    
    AAA Pattern:
    - Arrange: Start OAuth2 MCP server and wait for port
    - Act: Test runs (yield)
    - Cleanup: Stop server
    """
    port = PORT_OAUTH2_HTTP
    server_name = "OAuth2 HTTP"
    
    if is_port_in_use(port):
        raise RuntimeError(f"Port {port} already in use before starting {server_name} server")
    
    logger.info(f"[SETUP] Starting {server_name} server on port {port}")
    
    # Set environment variables for OAuth2 configuration
    env = os.environ.copy()
    env["PORT"] = str(port)
    env["OAUTH2_PROVIDER_PORT"] = str(OAUTH2_PROVIDER_PORT)
    
    process = multiprocessing.Process(
        target=run_oauth2_http_server,
        args=(port,),
        daemon=True,
    )
    process.start()
    
    if not wait_for_port(port, timeout=10):
        cleanup_process(process, port, server_name)
        raise RuntimeError(f"{server_name} server failed to start on port {port}")
    
    logger.info(f"[SETUP] {server_name} server ready on port {port}")
    
    try:
        yield
    finally:
        cleanup_process(process, port, server_name)