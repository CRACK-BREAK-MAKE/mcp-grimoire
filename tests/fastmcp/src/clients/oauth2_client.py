"""OAuth2 HTTP Client.

This client connects to the OAuth2 HTTP server using OAuth2 authentication.
Note: This is a simplified test client. Full OAuth2 flow with browser interaction
requires the FastMCP OAuth helper.
"""

import asyncio
import os

from fastmcp import Client

from src.common.constants import OAUTH2_PROVIDER_PORT, PORT_OAUTH2_HTTP
from src.common.logging import get_logger, setup_logging
from src.common.client_logging import default_log_handler


# Setup logging
setup_logging()
logger = get_logger(__name__)


async def test_oauth2_client_with_token(access_token: str) -> None:
    """Test OAuth2 HTTP client with an access token.

    Args:
        access_token: OAuth2 access token
    """
    port = int(os.environ.get("PORT", PORT_OAUTH2_HTTP))

    # Use access token as bearer token
    async with Client(
        f"http://localhost:{port}/mcp",
        auth=access_token,
        log_handler=default_log_handler
    ) as client:
        logger.info(f"Connected to OAuth2 HTTP Server on port {port}")

        # Test ping
        await client.ping()
        logger.info("✓ Ping successful")

        # List tools
        tools = await client.list_tools()
        logger.info(f"✓ Available tools: {[tool.name for tool in tools.tools]}")

        # Test send_email tool
        result = await client.call_tool("send_email", {
            "to": "dave@example.com",
            "subject": "Test Email",
            "body": "Hello from OAuth2 client!"
        })
        logger.info(f"✓ Send email result: {result.content[0].text}")

        # Test get_inbox tool
        result = await client.call_tool("get_inbox", {"folder": "inbox", "limit": 10})
        logger.info(f"✓ Get inbox result: {result.content[0].text}")


async def test_with_oauth_flow() -> None:
    """Test OAuth2 client with full OAuth flow.

    Note: This would typically open a browser for user authentication.
    For automated testing, we'll use a pre-obtained token or mock the flow.
    """
    port = int(os.environ.get("PORT", PORT_OAUTH2_HTTP))

    logger.info("OAuth2 flow testing requires browser interaction.")
    logger.info(f"Server URL: http://localhost:{port}/mcp")
    logger.info("Use the FastMCP OAuth helper for full browser-based flow:")
    logger.info(f'  async with Client("http://localhost:{PORT_OAUTH2_HTTP}/mcp", auth="oauth") as client:')


async def test_without_auth() -> None:
    """Test that requests without auth are rejected."""
    port = int(os.environ.get("PORT", PORT_OAUTH2_HTTP))

    try:
        async with Client(f"http://localhost:{port}/mcp") as client:
            await client.ping()
            logger.error("✗ Request without auth should have failed but succeeded!")
    except Exception as e:
        logger.info(f"✓ Request without auth properly rejected: {type(e).__name__}")


if __name__ == "__main__":
    logger.debug("=====================================================")
    logger.info("Testing OAuth2 HTTP Client")
    logger.debug("=====================================================")

    logger.info("\nOAuth2 authentication requires browser-based flow.")
    logger.info("For testing, you can:")
    logger.info("1. Manually obtain a token from the OAuth2 provider")
    logger.info("2. Use the FastMCP OAuth helper with auth='oauth'")
    logger.info(f"3. OAuth2 Provider: http://localhost:{OAUTH2_PROVIDER_PORT}")

    # Test with full OAuth flow info
    asyncio.run(test_with_oauth_flow())

    logger.info("\nTest: Without authentication")
    asyncio.run(test_without_auth())

    # If you have a token, you can test with it:
    # token = "your-access-token-here"
    # asyncio.run(test_oauth2_client_with_token(token))
