"""API Key HTTP Client.

This client connects to the API Key HTTP server using an API key as bearer token.
"""

import asyncio
import os

from fastmcp import Client

from src.common.constants import DEFAULT_API_KEY
from src.common.logging import get_logger, setup_logging
from src.common.client_logging import default_log_handler


# Setup logging
setup_logging()
logger = get_logger(__name__)


async def test_api_key_http_client() -> None:
    """Test API Key HTTP client connectivity and tool execution."""
    api_key = os.environ.get("API_KEY", DEFAULT_API_KEY)
    port = int(os.environ.get("PORT", PORT_API_KEY_HTTP))

    # Create client with API key as bearer token and log handler
    async with Client(
        f"http://localhost:{port}/mcp",
        auth=api_key,
        log_handler=default_log_handler  # Capture server logs
    ) as client:
        logger.info(f"Connected to API Key HTTP Server on port {port}")

        # Test ping
        await client.ping()
        logger.info("✓ Ping successful")

        # List tools
        tools = await client.list_tools()
        logger.info(f"✓ Available tools: {[tool.name for tool in tools.tools]}")

        # Test get_current_weather tool
        result = await client.call_tool("get_current_weather", {"city": "London", "units": "metric"})
        logger.info(f"✓ Current weather result: {result.content[0].text}")

        # Test get_forecast tool
        result = await client.call_tool("get_forecast", {"city": "Paris", "days": 5})
        logger.info(f"✓ Forecast result: {result.content[0].text}")

        # Test get_weather_alerts tool
        result = await client.call_tool("get_weather_alerts", {"city": "Miami"})
        logger.info(f"✓ Weather alerts result: {result.content[0].text}")


async def test_without_auth() -> None:
    """Test that requests without auth are rejected."""
    port = int(os.environ.get("PORT", PORT_API_KEY_HTTP))

    try:
        async with Client(f"http://localhost:{port}/mcp") as client:
            await client.ping()
            logger.error("✗ Request without auth should have failed but succeeded!")
    except Exception as e:
        logger.info(f"✓ Request without auth properly rejected: {type(e).__name__}")


async def test_with_invalid_key() -> None:
    """Test that requests with invalid API key are rejected."""
    port = int(os.environ.get("PORT", PORT_API_KEY_HTTP))

    try:
        async with Client(
            f"http://localhost:{port}/mcp",
            auth="invalid-api-key-xyz",
        ) as client:
            await client.ping()
            logger.error("✗ Request with invalid key should have failed but succeeded!")
    except Exception as e:
        logger.info(f"✓ Request with invalid key properly rejected: {type(e).__name__}")


if __name__ == "__main__":
    logger.debug("=====================================================")
    logger.info("Testing API Key HTTP Client")
    logger.debug("=====================================================")

    logger.info("\nTest 1: With valid API key")
    asyncio.run(test_api_key_http_client())

    logger.info("\nTest 2: Without API key")
    asyncio.run(test_without_auth())

    logger.info("\nTest 3: With invalid API key")
    asyncio.run(test_with_invalid_key())
