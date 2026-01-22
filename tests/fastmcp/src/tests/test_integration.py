"""Integration tests for all authentication methods.

These tests validate that:
1. Servers start correctly
2. Clients can connect with valid authentication
3. Tool execution works with authentication
4. Requests without authentication are rejected
5. Requests with invalid authentication are rejected
"""

import pytest
from fastmcp import Client
from fastmcp.client.transports import StreamableHttpTransport
from mcp.client.auth.extensions.client_credentials import ClientCredentialsOAuthProvider

from common.auth_providers import create_basic_auth_header
from common.constants import (
    DEFAULT_HTTP_PORT,
    DEFAULT_SSE_PORT,
    OAUTH2_PROVIDER_PORT,
    PORT_NO_AUTH_HTTP,
    PORT_OAUTH2_HTTP,
)
from common.logging import get_logger

logger = get_logger(__name__)


class TestBasicAuthHTTP:
    """Tests for Basic Auth HTTP server."""

    @pytest.mark.asyncio
    async def test_with_valid_credentials(
        self,
        basic_auth_http_server,
        test_credentials,
    ) -> None:
        """Test Basic Auth HTTP with valid credentials."""
        # Arrange
        # FastMCP requires Bearer token scheme, so we send Bearer with base64 credentials
        auth_header = create_basic_auth_header(
            test_credentials["username"],
            test_credentials["password"],
        )
        
        # Use transport with Bearer token (FastMCP only accepts Bearer scheme)
        # The create_basic_auth_header() returns "Basic <base64>" so we need to replace with "Bearer"
        bearer_token = auth_header.replace("Basic ", "Bearer ")
        transport = StreamableHttpTransport(
            f"http://localhost:{DEFAULT_HTTP_PORT}/mcp",
            headers={"Authorization": bearer_token},
        )

        # Act & Assert
        async with Client(transport) as client:
            # Test ping
            await client.ping()

            # Test tool listing
            tools = await client.list_tools()
            assert len(tools) > 0
            tool_names = [tool.name for tool in tools]
            assert "create_project" in tool_names
            assert "add_task" in tool_names
            assert "get_project_status" in tool_names

            # Test create_project tool
            result = await client.call_tool("create_project", {"name": "Test Project", "description": "Test", "deadline": "2024-12-31", "priority": "high"})
            assert "project_id" in result.content[0].text or "Test Project" in result.content[0].text

            # Test add_task tool
            result = await client.call_tool("add_task", {"project_id": "proj_001", "title": "Task 1", "assignee": "John", "due_date": "2024-06-01"})
            assert "task_id" in result.content[0].text or "Task 1" in result.content[0].text

            # Test unique tool: get_project_status
            result = await client.call_tool("get_project_status", {"project_id": "proj_001"})
            assert "status" in result.content[0].text or "completion_percentage" in result.content[0].text

    @pytest.mark.asyncio
    async def test_without_credentials(self, basic_auth_http_server) -> None:
        """Test Basic Auth HTTP without credentials fails."""
        # Arrange
        transport = StreamableHttpTransport(f"http://localhost:{DEFAULT_HTTP_PORT}/mcp")

        # Act & Assert
        with pytest.raises(Exception):
            async with Client(transport) as client:
                await client.ping()

    @pytest.mark.asyncio
    async def test_with_invalid_credentials(self, basic_auth_http_server) -> None:
        """Test Basic Auth HTTP with invalid credentials fails."""
        # Arrange
        auth_header = create_basic_auth_header("wrong", "credentials")
        bearer_token = auth_header.replace("Basic ", "Bearer ")
        transport = StreamableHttpTransport(
            f"http://localhost:{DEFAULT_HTTP_PORT}/mcp",
            headers={"Authorization": bearer_token},
        )

        # Act & Assert
        with pytest.raises(Exception):
            async with Client(transport) as client:
                await client.ping()


class TestBasicAuthSSE:
    """Tests for Basic Auth SSE server."""

    @pytest.mark.asyncio
    async def test_with_valid_credentials(
        self,
        basic_auth_sse_server,
        test_credentials,
    ) -> None:
        """Test Basic Auth SSE with valid credentials."""
        # Arrange
        auth_header = create_basic_auth_header(
            test_credentials["username"],
            test_credentials["password"],
        )
        # For SSE transport, pass just the token (without "Bearer " prefix)
        # FastMCP's BearerAuth class will add the "Bearer " prefix
        token = auth_header.replace("Basic ", "")

        # For SSE, we use the SSETransport through the Client
        # The Client will create appropriate transport based on URL
        url = f"http://localhost:{DEFAULT_SSE_PORT}/sse"

        # Act & Assert
        async with Client(url, auth=token) as client:
            # Test ping
            await client.ping()

            # Test tool listing
            tools = await client.list_tools()
            assert len(tools) > 0

            # Test upload_file tool
            result = await client.call_tool("upload_file", {"filename": "test.txt", "size_mb": 1.5, "folder": "documents"})
            assert "file_id" in result.content[0].text or "uploaded" in result.content[0].text

            # Test unique tool: list_files
            result = await client.call_tool("list_files", {"folder": "documents", "sort_by": "date"})
            assert "files" in result.content[0].text or "file_count" in result.content[0].text

            # Test unique tool: delete_file
            result = await client.call_tool("delete_file", {"file_id": "file_001", "permanent": False})
            assert "success" in result.content[0].text or "deleted" in result.content[0].text


class TestAPIKeyHTTP:
    """Tests for API Key HTTP server."""

    @pytest.mark.asyncio
    async def test_with_valid_api_key(
        self,
        api_key_http_server,
        test_credentials,
    ) -> None:
        """Test API Key HTTP with valid API key."""
        # Arrange & Act & Assert
        async with Client(
            "http://localhost:8002/mcp",
            auth=test_credentials["api_key"],
        ) as client:
            # Test ping
            await client.ping()

            # Test tool listing
            tools = await client.list_tools()
            assert len(tools) > 0

            # Test get_current_weather tool
            result = await client.call_tool("get_current_weather", {"city": "London", "units": "metric"})
            assert "temperature" in result.content[0].text or "weather" in result.content[0].text

            # Test unique tool: get_forecast
            result = await client.call_tool("get_forecast", {"city": "Paris", "days": 5})
            assert "forecast" in result.content[0].text or "high" in result.content[0].text

            # Test unique tool: get_weather_alerts
            result = await client.call_tool("get_weather_alerts", {"city": "Miami"})
            assert "alerts" in result.content[0].text or "success" in result.content[0].text

    @pytest.mark.asyncio
    async def test_without_api_key(self, api_key_http_server) -> None:
        """Test API Key HTTP without API key fails."""
        # Arrange & Act & Assert
        with pytest.raises(Exception):
            async with Client("http://localhost:8002/mcp") as client:
                await client.ping()

    @pytest.mark.asyncio
    async def test_with_invalid_api_key(self, api_key_http_server) -> None:
        """Test API Key HTTP with invalid API key fails."""
        # Arrange & Act & Assert
        with pytest.raises(Exception):
            async with Client(
                "http://localhost:8002/mcp",
                auth="invalid-key",
            ) as client:
                await client.ping()


class TestAPIKeySSE:
    """Tests for API Key SSE server."""

    @pytest.mark.asyncio
    async def test_with_valid_api_key(
        self,
        api_key_sse_server,
        test_credentials,
    ) -> None:
        """Test API Key SSE with valid API key."""
        # Arrange & Act & Assert
        async with Client(
            "http://localhost:8003/sse",
            auth=test_credentials["api_key"],
        ) as client:
            # Test ping
            await client.ping()

            # Test tool listing
            tools = await client.list_tools()
            assert len(tools) > 0

            # Test get_latest_news tool
            result = await client.call_tool("get_latest_news", {"category": "technology", "limit": 10})
            assert "articles" in result.content[0].text or "news" in result.content[0].text

            # Test unique tool: search_news
            result = await client.call_tool("search_news", {"query": "AI technology", "from_date": "2024-01-01"})
            assert "results" in result.content[0].text or "articles" in result.content[0].text

            # Test unique tool: get_trending_topics
            result = await client.call_tool("get_trending_topics", {})
            assert "trending" in result.content[0].text or "topics" in result.content[0].text


class TestSecurityKeys:
    """Tests for Security Keys HTTP server."""

    @pytest.mark.asyncio
    async def test_with_github_pat(
        self,
        security_keys_server,
        test_credentials,
    ) -> None:
        """Test Security Keys with GITHUB_PAT."""
        # Arrange - Security Keys server validates X-GitHub-Token header
        transport = StreamableHttpTransport(
            "http://localhost:8004/mcp",
            headers={"X-GitHub-Token": test_credentials["github_pat"]},
        )

        # Act & Assert
        async with Client(transport) as client:
            # Test ping
            await client.ping()

            # Test tool listing
            tools = await client.list_tools()
            assert len(tools) > 0

            # Test run_sql_query tool
            result = await client.call_tool("run_sql_query", {"query": "SELECT * FROM users", "database": "main", "limit": 10})
            assert "results" in result.content[0].text or "query_type" in result.content[0].text

            # Test get_table_schema tool
            result = await client.call_tool("get_table_schema", {"table_name": "users", "database": "main"})
            assert "columns" in result.content[0].text or "schema" in result.content[0].text

            # Test unique tool: export_query_results
            result = await client.call_tool("export_query_results", {"query_id": "query_123", "format": "csv"})
            assert "download_url" in result.content[0].text or "file_name" in result.content[0].text

    @pytest.mark.asyncio
    async def test_with_brave_api_key(
        self,
        security_keys_server,
        test_credentials,
    ) -> None:
        """Test Security Keys with BRAVE_API_KEY."""
        # Arrange - Security Keys server validates X-Brave-Key header
        transport = StreamableHttpTransport(
            "http://localhost:8004/mcp",
            headers={"X-Brave-Key": test_credentials["brave_api_key"]},
        )

        # Act & Assert
        async with Client(transport) as client:
            # Test ping
            await client.ping()

            # Test tool listing
            tools = await client.list_tools()
            assert len(tools) > 0

    @pytest.mark.asyncio
    async def test_without_security_key(self, security_keys_server) -> None:
        """Test Security Keys without key fails."""
        # Arrange - No custom headers = should fail
        transport = StreamableHttpTransport("http://localhost:8004/mcp")

        # Act & Assert
        with pytest.raises(Exception):
            async with Client(transport) as client:
                await client.ping()

    @pytest.mark.asyncio
    async def test_with_invalid_security_key(self, security_keys_server) -> None:
        """Test Security Keys with invalid key fails."""
        # Arrange & Act & Assert
        with pytest.raises(Exception):
            async with Client(
                "http://localhost:8004/mcp",
                auth="invalid-security-key",
            ) as client:
                await client.ping()


class TestOAuth2ClientCredentials:
    """Tests for OAuth2 Client Credentials flow."""

    @pytest.mark.asyncio
    async def test_with_client_credentials(
        self,
        oauth2_http_server,
        oauth2_provider_server,
        test_credentials,
    ) -> None:
        """Test OAuth2 client credentials flow."""
        # Create a simple in-memory token storage
        from mcp.shared.auth import OAuthToken, OAuthClientInformationFull
        
        class SimpleTokenStorage:
            def __init__(self):
                self.tokens = None
                self.client_info = None
            
            async def get_tokens(self):
                return self.tokens
            
            async def set_tokens(self, tokens: OAuthToken):
                self.tokens = tokens
            
            async def get_client_info(self):
                return self.client_info
            
            async def set_client_info(self, client_info: OAuthClientInformationFull):
                self.client_info = client_info
        
        storage = SimpleTokenStorage()
        
        # Create OAuth provider for client credentials
        oauth_provider = ClientCredentialsOAuthProvider(
            server_url=f"http://localhost:{PORT_OAUTH2_HTTP}",
            storage=storage,
            client_id=test_credentials["oauth2_client_id"],
            client_secret=test_credentials["oauth2_client_secret"],
            scopes="mcp:tools:read mcp:tools:write",
        )
        
        # Create transport with OAuth provider
        from fastmcp.client.transports import StreamableHttpTransport
        transport = StreamableHttpTransport(
            f"http://localhost:{PORT_OAUTH2_HTTP}/mcp",
        )
        
        # The OAuth provider needs to be used as httpx.Auth
        # For client credentials, we need to get the token first and pass it
        import httpx
        async with httpx.AsyncClient() as client:
            # Get token from OAuth provider
            token_response = await client.post(
                f"http://localhost:{OAUTH2_PROVIDER_PORT}/oauth/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": test_credentials["oauth2_client_id"],
                    "client_secret": test_credentials["oauth2_client_secret"],
                    "scope": "mcp:tools:read mcp:tools:write",
                },
            )
            assert token_response.status_code == 200
            token_data = token_response.json()
            access_token = token_data["access_token"]
        
        # Use the access token with the MCP server
        transport_with_auth = StreamableHttpTransport(
            f"http://localhost:{PORT_OAUTH2_HTTP}/mcp",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        
        # Act & Assert
        async with Client(transport_with_auth) as mcp_client:
            # Test ping
            await mcp_client.ping()

            # Test tool listing
            tools = await mcp_client.list_tools()
            assert len(tools) > 0
            tool_names = [tool.name for tool in tools]
            assert "send_email" in tool_names
            assert "get_inbox" in tool_names
            assert "search_emails" in tool_names

            # Test send_email tool
            result = await mcp_client.call_tool("send_email", {"to": "test@example.com", "subject": "Test", "body": "Hello"})
            assert "message_id" in result.content[0].text or "success" in result.content[0].text

            # Test get_inbox tool
            result = await mcp_client.call_tool("get_inbox", {"folder": "inbox", "limit": 10})
            assert "messages" in result.content[0].text or "message_count" in result.content[0].text

            # Test search_emails tool
            result = await mcp_client.call_tool("search_emails", {"query": "project", "folder": "all", "limit": 20})
            assert "results" in result.content[0].text or "query" in result.content[0].text



    @pytest.mark.asyncio
    async def test_without_credentials(
        self,
        oauth2_http_server,
    ) -> None:
        """Test OAuth2 server without credentials fails."""
        # Arrange
        transport = StreamableHttpTransport(f"http://localhost:{PORT_OAUTH2_HTTP}/mcp")

        # Act & Assert
        with pytest.raises(Exception):
            async with Client(transport) as client:
                await client.ping()

    @pytest.mark.asyncio
    async def test_with_invalid_credentials(
        self,
        oauth2_provider_server,
        oauth2_http_server,
    ) -> None:
        """Test OAuth2 with invalid credentials fails."""
        # Try to get token with invalid credentials
        import httpx
        async with httpx.AsyncClient() as client:
            token_response = await client.post(
                f"http://localhost:{OAUTH2_PROVIDER_PORT}/oauth/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": "invalid-client",
                    "client_secret": "invalid-secret",
                    "scope": "read write",
                },
            )
            # Should return 401 for invalid credentials
            assert token_response.status_code == 401


class TestNoAuthHTTP:
    """Tests for No Auth HTTP server."""

    @pytest.mark.asyncio
    async def test_without_authentication(self, no_auth_http_server) -> None:
        """Test No Auth HTTP without authentication works."""
        # Arrange & Act & Assert
        async with Client(f"http://localhost:{PORT_NO_AUTH_HTTP}/mcp") as client:
            # Test ping
            await client.ping()

            # Test tool listing
            tools = await client.list_tools()
            assert len(tools) > 0
            tool_names = [tool.name for tool in tools]
            assert "calculate" in tool_names
            assert "convert_units" in tool_names
            assert "generate_random" in tool_names

            # Test calculate tool
            result = await client.call_tool("calculate", {"expression": "2 + 2 * 3"})
            assert "result" in result.content[0].text or "8" in result.content[0].text

            # Test unique tool: convert_units
            result = await client.call_tool("convert_units", {"value": 100, "from_unit": "kg", "to_unit": "lb"})
            assert "converted_value" in result.content[0].text or "220" in result.content[0].text

            # Test unique tool: generate_random
            result = await client.call_tool("generate_random", {"type": "uuid", "count": 2})
            assert "results" in result.content[0].text or "uuid" in result.content[0].text


class TestNoAuthSSE:
    """Tests for No Auth SSE server."""

    @pytest.mark.asyncio
    async def test_without_authentication(self, no_auth_sse_server) -> None:
        """Test No Auth SSE without authentication works."""
        # Arrange & Act & Assert
        async with Client("http://localhost:8007/sse") as client:
            # Test ping
            await client.ping()

            # Test tool listing
            tools = await client.list_tools()
            assert len(tools) > 0

            # Test get_cpu_usage tool
            result = await client.call_tool("get_cpu_usage", {"interval_seconds": 1})
            assert "cpu_count" in result.content[0].text or "overall_usage" in result.content[0].text

            # Test unique tool: get_memory_stats
            result = await client.call_tool("get_memory_stats", {})
            assert "memory" in result.content[0].text or "total_gb" in result.content[0].text

            # Test unique tool: get_disk_usage
            result = await client.call_tool("get_disk_usage", {"path": "/"})
            assert "disk" in result.content[0].text or "free_gb" in result.content[0].text


class TestEndToEnd:
    """End-to-end tests for all authentication methods."""

    @pytest.mark.asyncio
    async def test_all_servers_running(
        self,
        basic_auth_http_server,
        basic_auth_sse_server,
        api_key_http_server,
        api_key_sse_server,
        security_keys_server,
        test_credentials,
    ) -> None:
        """Test that all servers are running and accessible."""
        # Test Basic Auth HTTP
        auth_header = create_basic_auth_header(
            test_credentials["username"],
            test_credentials["password"],
        )
        bearer_token = auth_header.replace("Basic ", "Bearer ")
        transport = StreamableHttpTransport(
            f"http://localhost:{DEFAULT_HTTP_PORT}/mcp",
            headers={"Authorization": bearer_token},
        )
        async with Client(transport) as client:
            await client.ping()

        # Test API Key HTTP
        async with Client(
            "http://localhost:8002/mcp",
            auth=test_credentials["api_key"],
        ) as client:
            await client.ping()

        # Test API Key SSE
        async with Client(
            "http://localhost:8003/sse",
            auth=test_credentials["api_key"],
        ) as client:
            await client.ping()

        # Test Security Keys (uses custom headers, not standard auth)
        security_transport = StreamableHttpTransport(
            "http://localhost:8004/mcp",
            headers={"X-GitHub-Token": test_credentials["github_pat"]},
        )
        async with Client(security_transport) as client:
            await client.ping()

        logger.info("\n✓ All servers are running and accessible!")

class TestOAuth2HTTP:
    """Tests for OAuth2 HTTP server with Client Credentials flow."""

    @pytest.mark.asyncio
    async def test_oauth2_client_credentials_end_to_end(
        self,
        oauth2_http_server,
        oauth2_provider_server,
        test_credentials,
    ) -> None:
        """Complete OAuth2 Client Credentials flow per RFC 6749/8414.
        
        This demonstrates the PROPER OAuth2 Client Credentials flow:
        1. Client makes HTTP request without token → HTTP 401 with WWW-Authenticate header
        2. Client extracts resource_metadata URL from WWW-Authenticate header
        3. Client fetches PRM (Protected Resource Metadata) from that URL (public, no auth)
        4. Client discovers Authorization Server from PRM
        5. Client fetches AS metadata from well-known endpoint
        6. Client requests access token from AS using client_id/client_secret
        7. Client retries HTTP request with Bearer token → HTTP 200 Success
        8. Client successfully calls MCP tools with authenticated session
        """
        import httpx
        import re
        
        mcp_url = f"http://localhost:{PORT_OAUTH2_HTTP}/mcp"
        
        # Step 1: Try to connect without token - should get HTTP 401
        logger.debug("=====================================================")
        logger.info("STEP 1: Initial request WITHOUT token → HTTP 401")
        logger.debug("=====================================================")
        async with httpx.AsyncClient(timeout=10.0) as http_client:
            # Make initial MCP initialize request without auth
            response = await http_client.post(
                mcp_url,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {},
                        "clientInfo": {"name": "test-client", "version": "1.0"}
                    }
                },
                follow_redirects=True,
            )
            
            logger.info(f"Response status: {response.status_code}")
            assert response.status_code == 401, f"Expected 401, got {response.status_code}"
            logger.info("✓ Got HTTP 401 Unauthorized (expected)")
            
            # Step 2: Extract resource_metadata from WWW-Authenticate header
            logger.debug("=====================================================")
            logger.info("STEP 2: Extract PRM URL from WWW-Authenticate header")
            logger.debug("=====================================================")
            www_auth_header = response.headers.get("www-authenticate", "")
            logger.info(f"WWW-Authenticate: {www_auth_header}")
            assert www_auth_header.lower().startswith("bearer "), "Must have Bearer challenge"
            
            # Parse resource_metadata URL from WWW-Authenticate header
            # Format: Bearer error="...", error_description="...", resource_metadata="URL"
            match = re.search(r'resource_metadata="([^"]+)"', www_auth_header)
            assert match, "WWW-Authenticate must contain resource_metadata URL"
            prm_url = match.group(1)
            logger.info(f"✓ Discovered PRM URL: {prm_url}")
            
            # Step 3: Fetch PRM (PUBLIC - no authentication required per RFC 8414)
            logger.debug("=====================================================")
            logger.info("STEP 3: Fetch Protected Resource Metadata (PUBLIC endpoint)")
            logger.debug("=====================================================")
            prm_response = await http_client.get(prm_url)
            assert prm_response.status_code == 200, f"PRM endpoint returned {prm_response.status_code}"
            prm = prm_response.json()
            logger.info(f"PRM Resource: {prm.get('resource')}")
            logger.info(f"Bearer methods: {prm.get('bearer_methods_supported')}")
            logger.info(f"Scopes: {prm.get('scopes_supported')}")
            
            # Step 4: Discover Authorization Server from PRM
            logger.debug("=====================================================")
            logger.info("STEP 4: Discover Authorization Server from PRM")
            logger.debug("=====================================================")
            as_urls = prm.get("authorization_servers", [])
            assert len(as_urls) > 0, "PRM must contain at least one authorization server"
            as_url = as_urls[0]
            logger.info(f"✓ Authorization Server: {as_url}")
            
            # Step 5: Fetch AS metadata
            logger.debug("=====================================================")
            logger.info("STEP 5: Fetch Authorization Server metadata")
            logger.debug("=====================================================")
            as_metadata_url = f"{as_url}.well-known/oauth-authorization-server"
            logger.info(f"Fetching: {as_metadata_url}")
            as_response = await http_client.get(as_metadata_url)
            assert as_response.status_code == 200, f"AS metadata returned {as_response.status_code}"
            as_metadata = as_response.json()
            logger.info(f"✓ Issuer: {as_metadata['issuer']}")
            logger.info(f"✓ Token endpoint: {as_metadata['token_endpoint']}")
            logger.info(f"✓ Grant types: {as_metadata.get('grant_types_supported')}")
            
            token_endpoint = as_metadata["token_endpoint"]
            
            # Step 6: Request access token using client credentials
            logger.debug("=====================================================")
            logger.info("STEP 6: Request access token (Client Credentials grant)")
            logger.debug("=====================================================")
            logger.info(f"Client ID: {test_credentials['oauth2_client_id']}")
            logger.info(f"Requesting scopes: mcp:tools:read mcp:tools:write")
            token_response = await http_client.post(
                token_endpoint,
                data={
                    "grant_type": "client_credentials",
                    "client_id": test_credentials["oauth2_client_id"],
                    "client_secret": test_credentials["oauth2_client_secret"],
                    "scope": "mcp:tools:read mcp:tools:write"
                }
            )
            assert token_response.status_code == 200, f"Token request returned {token_response.status_code}"
            token_data = token_response.json()
            access_token = token_data["access_token"]
            logger.info(f"✓ Got access token: {access_token[:30]}...")
            logger.info(f"✓ Token type: {token_data['token_type']}")
            logger.info(f"✓ Expires in: {token_data.get('expires_in')} seconds")
            assert token_data["token_type"] == "Bearer"
            assert access_token
        
        # Step 7: Use MCP Client with Bearer token to connect and test tools
        logger.debug("=====================================================")
        logger.info("STEP 7: Connect with MCP Client using Bearer token")
        logger.debug("=====================================================")
        transport = StreamableHttpTransport(
            mcp_url,
            headers={"Authorization": f"Bearer {access_token}"}
        )
        
        async with Client(transport) as client:
            # Initialize connection
            logger.info("✓ MCP Client connected successfully with Bearer token!")
            
            # Test ping
            await client.ping()
            logger.info("✓ Ping successful")
            
            # Test tool listing
            tools = await client.list_tools()
            assert len(tools) > 0
            tool_names = [tool.name for tool in tools]
            assert "send_email" in tool_names
            assert "get_inbox" in tool_names
            assert "search_emails" in tool_names
            logger.info(f"✓ Listed {len(tools)} tools: {', '.join(tool_names)}")
            
            # Test send_email tool
            result = await client.call_tool("send_email", {"to": "test@example.com", "subject": "OAuth2 Test", "body": "Hello"})
            assert "message_id" in result.content[0].text or "success" in result.content[0].text
            logger.info(f"✓ send_email: {result.content[0].text}")
            
            # Test get_inbox tool
            result = await client.call_tool("get_inbox", {"folder": "inbox", "limit": 10})
            assert "messages" in result.content[0].text or "message_count" in result.content[0].text
            logger.info(f"✓ get_inbox: {result.content[0].text}")
            
            # Test search_emails tool (3rd domain tool)
            result = await client.call_tool("search_emails", {"query": "important", "folder": "all", "limit": 5})
            assert "results" in result.content[0].text or "query" in result.content[0].text
            logger.info(f"✓ search_emails: {result.content[0].text}")
        
        logger.debug("=====================================================")
        logger.info("✅ OAuth2 Client Credentials flow completed successfully!")
        logger.debug("=====================================================")

    @pytest.mark.asyncio
    async def test_oauth2_invalid_token_rejected(
        self,
        oauth2_http_server,
        oauth2_provider_server,
    ) -> None:
        """Test that invalid/fake tokens are rejected.
        
        This negative test verifies that:
        1. Connection attempt with fake token fails
        2. Connection attempt with malformed token fails
        3. Connection attempt with expired/invalid token fails
        """
        mcp_url = f"http://localhost:{PORT_OAUTH2_HTTP}/mcp"
        
        # Test 1: Fake token
        logger.debug("=====================================================")
        logger.info("TEST: Invalid token should be rejected")
        logger.debug("=====================================================")
        fake_token = "fake_invalid_token_12345"
        transport_fake = StreamableHttpTransport(
            mcp_url,
            headers={"Authorization": f"Bearer {fake_token}"}
        )
        
        with pytest.raises(Exception) as exc_info:
            async with Client(transport_fake) as client:
                await client.ping()
        
        logger.info(f"✓ Fake token rejected: {type(exc_info.value).__name__}")
        
        # Test 2: Malformed token (not even JWT-like)
        malformed_token = "not-a-valid-jwt-at-all"
        transport_malformed = StreamableHttpTransport(
            mcp_url,
            headers={"Authorization": f"Bearer {malformed_token}"}
        )
        
        with pytest.raises(Exception) as exc_info:
            async with Client(transport_malformed) as client:
                await client.ping()
        
        logger.info(f"✓ Malformed token rejected: {type(exc_info.value).__name__}")
        
        # Test 3: Empty token
        transport_empty = StreamableHttpTransport(
            mcp_url,
            headers={"Authorization": "Bearer "}
        )
        
        with pytest.raises(Exception) as exc_info:
            async with Client(transport_empty) as client:
                await client.ping()
        
        logger.info(f"✓ Empty token rejected: {type(exc_info.value).__name__}")
        
        logger.debug("=====================================================")
        logger.info("✅ All invalid tokens correctly rejected!")
        logger.debug("=====================================================")

    @pytest.mark.asyncio
    async def test_oauth2_client_credentials_flow(
        self,
        oauth2_http_server,
        oauth2_provider_server,
        test_credentials,
    ) -> None:
        """Test complete OAuth2 Client Credentials flow.
        
        This test simulates the OAuth2 flow:
        1. Try to connect without token (should fail)
        2. Fetch PRM to discover Authorization Server
        3. Request token from AS with client credentials
        4. Connect with Bearer token (should succeed)
        5. Execute tools with authentication
        """
        import httpx
        
        server_url = f"http://localhost:{PORT_OAUTH2_HTTP}"
        prm_url_base = f"http://localhost:{PORT_OAUTH2_HTTP}"  # PRM and MCP on same server
        mcp_url = f"{server_url}/mcp"
        provider_url = f"http://localhost:{OAUTH2_PROVIDER_PORT}"
        
        # Step 1: Try request without token - should get 401 with WWW-Authenticate
        # This is the REAL production flow - client discovers auth requirements via 401
        async with httpx.AsyncClient(timeout=10.0) as http_client:
            # Initial request without token
            response = await http_client.post(
                mcp_url,
                json={"jsonrpc": "2.0", "id": 1, "method": "ping"},
                headers={"Content-Type": "application/json"}
            )
            
            # Should get 401 Unauthorized
            assert response.status_code == 401, f"Expected 401, got {response.status_code}"
            
            # Should have WWW-Authenticate header pointing to PRM
            www_auth = response.headers.get("WWW-Authenticate", "")
            assert "Bearer" in www_auth, f"WWW-Authenticate missing or invalid: {www_auth}"
            
            logger.info(f"\n✅ Step 1: Got 401 with WWW-Authenticate: {www_auth}")
        
        # Step 2: Fetch PRM from PUBLIC endpoint (no auth required per RFC 8414)
        async with httpx.AsyncClient(timeout=10.0) as http_client:
            prm_url = f"{prm_url_base}/.well-known/oauth-protected-resource/mcp"
            prm_response = await http_client.get(prm_url)
            assert prm_response.status_code == 200, f"PRM endpoint returned {prm_response.status_code}"
            prm = prm_response.json()
            
            logger.info(f"✅ Step 2: Fetched PRM: {prm}")
            
            # Step 3: Extract Authorization Server URL from PRM
            as_urls = prm.get("authorization_servers", [])
            assert len(as_urls) > 0, "PRM must contain at least one authorization server"
            as_url = as_urls[0].rstrip('/')  # Strip trailing slash if present
            
            logger.info(f"✅ Step 3: Authorization Server: {as_url}")
            
            # Step 4: Fetch AS metadata
            as_metadata_url = f"{as_url}/.well-known/oauth-authorization-server"
            as_response = await http_client.get(as_metadata_url)
            assert as_response.status_code == 200
            as_metadata = as_response.json()
            token_endpoint = as_metadata["token_endpoint"]
            
            logger.info(f"✅ Step 4: Token endpoint: {token_endpoint}")
            
            # Step 5: Request access token with client credentials
            token_response = await http_client.post(
                token_endpoint,
                data={
                    "grant_type": "client_credentials",
                    "client_id": test_credentials["oauth2_client_id"],
                    "client_secret": test_credentials["oauth2_client_secret"],
                    "scope": "mcp:tools:read mcp:tools:write"
                }
            )
            assert token_response.status_code == 200
            token_data = token_response.json()
            access_token = token_data["access_token"]
            assert access_token
            assert token_data["token_type"] == "Bearer"
            
            logger.info(f"✅ Step 5: Got access token: {access_token[:20]}...")
        
        # Step 6: Connect with Bearer token and test MCP operations
        transport = StreamableHttpTransport(
            mcp_url,
            headers={"Authorization": f"Bearer {access_token}"}
        )
        
        async with Client(transport) as client:
            # Test ping
            await client.ping()
            logger.info("✅ Step 6: Authenticated ping successful")
            
            # Test tool listing
            tools = await client.list_tools()
            assert len(tools) > 0
            tool_names = [tool.name for tool in tools]
            assert "send_email" in tool_names
            assert "get_inbox" in tool_names
            assert "search_emails" in tool_names
            logger.info(f"✅ Step 6: Listed {len(tools)} tools")
            
            # Test send_email tool
            result = await client.call_tool("send_email", {"to": "test@oauth.com", "subject": "Test", "body": "OAuth2 test"})
            assert "message_id" in result.content[0].text or "success" in result.content[0].text
            logger.info("✅ Step 6: Tool execution successful")
            
            # Test get_inbox tool
            result = await client.call_tool("get_inbox", {"folder": "inbox", "limit": 5})
            assert "messages" in result.content[0].text or "message_count" in result.content[0].text
            
            # Test search_emails tool (3rd domain tool)
            result = await client.call_tool("search_emails", {"query": "test", "folder": "inbox", "limit": 10})
            assert "results" in result.content[0].text or "query" in result.content[0].text
            logger.info("✅ Step 7: All 3 domain tools validated")
        
        logger.debug("=====================================================")
        logger.info("✅ Complete OAuth2 Client Credentials Flow Validated!")
        logger.debug("=====================================================")

    @pytest.mark.asyncio
    async def test_without_token(self, oauth2_http_server) -> None:
        """Test OAuth2 HTTP without token fails."""
        transport = StreamableHttpTransport(f"http://localhost:{PORT_OAUTH2_HTTP}/mcp")
        
        with pytest.raises(Exception):
            async with Client(transport) as client:
                await client.ping()

    @pytest.mark.asyncio
    async def test_with_invalid_token(self, oauth2_http_server) -> None:
        """Test OAuth2 HTTP with invalid token fails."""
        transport = StreamableHttpTransport(
            f"http://localhost:{PORT_OAUTH2_HTTP}/mcp",
            headers={"Authorization": "Bearer invalid-token-123"}
        )
        
        with pytest.raises(Exception):
            async with Client(transport) as client:
                await client.ping()
