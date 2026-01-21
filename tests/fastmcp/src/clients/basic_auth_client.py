"""Basic Auth HTTP Client.

This client connects to the Basic Auth HTTP server using username/password credentials.
"""

import asyncio
import os

from fastmcp import Client
from fastmcp.client.transports import StreamableHttpTransport

from src.common.auth_providers import create_basic_auth_header
from src.common.constants import (
    DEFAULT_HTTP_PORT,
    DEFAULT_PASSWORD,
    DEFAULT_USERNAME,
)
from src.common.logging import get_logger, setup_logging
from src.common.client_logging import default_log_handler


# Setup logging
setup_logging()
logger = get_logger(__name__)


async def test_basic_auth_http_client() -> None:
    """Test Basic Auth HTTP client connectivity and tool execution."""
    username = os.environ.get("AUTH_USERNAME", DEFAULT_USERNAME)
    password = os.environ.get("AUTH_PASSWORD", DEFAULT_PASSWORD)
    port = int(os.environ.get("PORT", DEFAULT_HTTP_PORT))

    # Create basic auth header
    auth_header = create_basic_auth_header(username, password)

    # Create transport with basic auth
    transport = StreamableHttpTransport(
        f"http://localhost:{port}/mcp",
        headers={"Authorization": auth_header},
    )

    # Create client
    async with Client(transport, log_handler=default_log_handler) as client:
        logger.info(f"Connected to Basic Auth HTTP Server on port {port}")

        # Test ping
        await client.ping()
        logger.info("✓ Ping successful")

        # List tools
        tools = await client.list_tools()
        logger.info(f"✓ Available tools: {[tool.name for tool in tools.tools]}")

        # Test create_project tool
        result = await client.call_tool("create_project", {
            "name": "Test Project",
            "description": "A test project",
            "deadline": "2024-12-31",
            "priority": "high"
        })
        logger.info(f"✓ Create project result: {result.content[0].text}")

        # Test add_task tool
        result = await client.call_tool("add_task", {
            "project_id": "proj_001",
            "title": "Implement feature",
            "assignee": "Alice",
            "due_date": "2024-06-01"
        })
        logger.info(f"✓ Add task result: {result.content[0].text}")

        # Test get_project_status tool
        result = await client.call_tool("get_project_status", {"project_id": "proj_001"})
        logger.info(f"✓ Project status result: {result.content[0].text}")


async def test_without_auth() -> None:
    """Test that requests without auth are rejected."""
    port = int(os.environ.get("PORT", DEFAULT_HTTP_PORT))

    try:
        # Create transport without auth
        transport = StreamableHttpTransport(f"http://localhost:{port}/mcp")

        async with Client(transport) as client:
            await client.ping()
            logger.error("✗ Request without auth should have failed but succeeded!")
    except Exception as e:
        logger.info(f"✓ Request without auth properly rejected: {type(e).__name__}")


if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info("Testing Basic Auth HTTP Client")
    logger.info("=" * 60)

    logger.info("\nTest 1: With valid credentials")
    asyncio.run(test_basic_auth_http_client())

    logger.info("\nTest 2: Without credentials")
    asyncio.run(test_without_auth())
