"""Security Keys HTTP Client.

This client connects to the Security Keys HTTP server using security keys
(like GITHUB_PAT or BRAVE_API_KEY).
"""

import asyncio
import os

from fastmcp import Client

from src.common.constants import DEFAULT_BRAVE_API_KEY, DEFAULT_GITHUB_PAT
from src.common.logging import get_logger, setup_logging
from src.common.client_logging import default_log_handler


# Setup logging
setup_logging()
logger = get_logger(__name__)


async def test_security_keys_client(key: str, key_type: str) -> None:
    """Test Security Keys HTTP client with a specific key.

    Args:
        key: Security key value
        key_type: Type of key (e.g., 'GITHUB_PAT', 'BRAVE_API_KEY')
    """
    port = int(os.environ.get("PORT", PORT_SECURITY_KEYS_HTTP))

    # Use security key as bearer token
    async with Client(
        f"http://localhost:{port}/mcp",
        auth=key,
        log_handler=default_log_handler
    ) as client:
        logger.info(f"Connected to Security Keys HTTP Server on port {port} with {key_type}")

        # Test ping
        await client.ping()
        logger.info("✓ Ping successful")

        # List tools
        tools = await client.list_tools()
        logger.info(f"✓ Available tools: {[tool.name for tool in tools.tools]}")

        # Test run_sql_query tool
        result = await client.call_tool("run_sql_query", {
            "query": "SELECT * FROM users LIMIT 10",
            "database": "main",
            "limit": 10
        })
        logger.info(f"✓ SQL query result: {result.content[0].text}")

        # Test get_table_schema tool
        result = await client.call_tool("get_table_schema", {"table_name": "users", "database": "main"})
        logger.info(f"✓ Table schema result: {result.content[0].text}")


async def test_without_auth() -> None:
    """Test that requests without auth are rejected."""
    port = int(os.environ.get("PORT", PORT_SECURITY_KEYS_HTTP))

    try:
        async with Client(f"http://localhost:{port}/mcp") as client:
            await client.ping()
            logger.error("✗ Request without auth should have failed but succeeded!")
    except Exception as e:
        logger.info(f"✓ Request without auth properly rejected: {type(e).__name__}")


async def test_with_invalid_key() -> None:
    """Test that requests with invalid security key are rejected."""
    port = int(os.environ.get("PORT", PORT_SECURITY_KEYS_HTTP))

    try:
        async with Client(
            f"http://localhost:{port}/mcp",
            auth="invalid-security-key",
        ) as client:
            await client.ping()
            logger.error("✗ Request with invalid key should have failed but succeeded!")
    except Exception as e:
        logger.info(f"✓ Request with invalid key properly rejected: {type(e).__name__}")


if __name__ == "__main__":
    logger.debug("=====================================================")
    logger.info("Testing Security Keys HTTP Client")
    logger.debug("=====================================================")

    logger.info("\nTest 1: With GITHUB_PAT")
    github_pat = os.environ.get("GITHUB_PAT", DEFAULT_GITHUB_PAT)
    asyncio.run(test_security_keys_client(github_pat, "GITHUB_PAT"))

    logger.info("\nTest 2: With BRAVE_API_KEY")
    brave_key = os.environ.get("BRAVE_API_KEY", DEFAULT_BRAVE_API_KEY)
    asyncio.run(test_security_keys_client(brave_key, "BRAVE_API_KEY"))

    logger.info("\nTest 3: Without security key")
    asyncio.run(test_without_auth())

    logger.info("\nTest 4: With invalid security key")
    asyncio.run(test_with_invalid_key())
    asyncio.run(test_security_keys_client(brave_key, "BRAVE_API_KEY"))

    logger.info("\nTest 3: Without security key")
    asyncio.run(test_without_auth())

    logger.info("\nTest 4: With invalid security key")
    asyncio.run(test_with_invalid_key())
