"""Email Service v1.0 - OAuth2 Authentication HTTP Server.

This server implements proper OAuth2 Client Credentials flow (RFC 6749) using
FastMCP's built-in Bearer authentication system.

Domain: Email Service - Send emails, manage inbox, and search messages.

Flow:
1. Client tries HTTP request without token → HTTP 401 with WWW-Authenticate header
2. Client fetches PRM from public /.well-known/oauth-protected-resource endpoint
3. Client discovers AS from PRM and fetches AS metadata
4. Client requests token from AS with client_id/client_secret  
5. Client retries HTTP request with Bearer token → HTTP 200 Success

This uses FastMCP's native auth system by passing AuthSettings and TokenVerifier.
"""

import os

import httpx
from fastmcp import FastMCP
from fastmcp.server.auth.auth import TokenVerifier, AccessToken, RemoteAuthProvider

from src.common.constants import (SERVER_NAME_OAUTH2, OAUTH2_PROVIDER_PORT, PORT_OAUTH2_HTTP, DEFAULT_OAUTH2_CLIENT_ID, )
from src.common.logging import get_logger

# Global provider URL (set at startup)
PROVIDER_BASE_URL = ""
SERVER_BASE_URL = ""

logger = get_logger(__name__)


class OAuth2TokenVerifier(TokenVerifier):
    """Token verifier that validates Bearer tokens against the OAuth2 provider.
    
    This extends FastMCP's TokenVerifier base class.
    """
    
    def __init__(self, provider_url: str, base_url: str | None = None):
        super().__init__(base_url=base_url, required_scopes=["mcp:tools:read"])
        self.provider_url = provider_url
        self.validate_url = f"{provider_url}/oauth/validate"
    
    async def verify_token(self, token: str) -> AccessToken | None:
        """Verify a bearer token and return access info if valid.
        
        Args:
            token: The bearer token to validate
            
        Returns:
            AccessToken if valid, None otherwise
        """
        try:
            logger.debug("Validating token with provider...")
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.validate_url,
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=5.0
                )
                
                if response.status_code != 200:
                    logger.warning(f"Token validation failed (status {response.status_code})")
                    return None
                
                token_info = response.json()
                
                if not token_info.get("active"):
                    logger.warning("Token is not active")
                    return None
                
                # Extract token information
                client_id = token_info.get("client_id", "unknown")
                scopes = token_info.get("scope", "").split()
                expires_at = token_info.get("exp")
                
                logger.info(f"Token valid - client_id={client_id}, scopes={scopes}")
                
                return AccessToken(
                    token=token,
                    client_id=client_id,
                    scopes=scopes,
                    expires_at=expires_at,
                )
                
        except Exception as e:
            logger.error(f"Token validation error: {e}")
            return None


# Note: PRM endpoint is automatically created by RemoteAuthProvider
# at /.well-known/oauth-protected-resource/mcp


def create_server(port: int = PORT_OAUTH2_HTTP) -> FastMCP:
    """Create and configure the MCP server with OAuth2 Bearer authentication.
    
    This server uses FastMCP's native auth system by providing a TokenVerifier
    wrapped in RemoteAuthProvider to advertise the OAuth2 authorization server.
    
    Args:
        port: Port for the MCP server
    
    Returns:
        FastMCP server configured with Bearer authentication
    """
    # Get provider URL
    provider_port = int(os.environ.get("OAUTH2_PROVIDER_PORT", OAUTH2_PROVIDER_PORT))
    
    global PROVIDER_BASE_URL, SERVER_BASE_URL
    # Ensure no trailing slashes in URLs (OAuth2 spec requirement)
    PROVIDER_BASE_URL = f"http://localhost:{provider_port}".rstrip('/')
    SERVER_BASE_URL = f"http://localhost:{port}".rstrip('/')
    
    # Create OAuth2 token verifier (extends FastMCP's TokenVerifier)
    token_verifier = OAuth2TokenVerifier(
        provider_url=PROVIDER_BASE_URL,
        base_url=SERVER_BASE_URL
    )
    
    # Wrap with RemoteAuthProvider to advertise authorization servers
    # This automatically creates the /.well-known/oauth-protected-resource/mcp endpoint
    auth = RemoteAuthProvider(
        token_verifier=token_verifier,
        authorization_servers=[PROVIDER_BASE_URL],
        base_url=SERVER_BASE_URL,
        resource_name="OAuth2 MCP Server",
    )
    
    # Create MCP server with OAuth2 authentication
    mcp = FastMCP(
        name=SERVER_NAME_OAUTH2,
        auth=auth,
    )
    
    # Domain: Email Service
    @mcp.tool()
    def send_email(to: str, subject: str, body: str, cc: str = None) -> dict:
        """Send an email message.

        Args:
            to: Recipient email address
            subject: Email subject line
            body: Email body content
            cc: Optional CC recipients (comma-separated)

        Returns:
            Dictionary with send status and message details
        """
        from datetime import datetime
        import random
        
        # Basic email validation
        if "@" not in to:
            return {"error": "Invalid recipient email address", "success": False}
        
        message_id = f"<{random.randint(100000, 999999)}.{int(datetime.utcnow().timestamp())}@mail.example.com>"
        
        return {
            "success": True,
            "message_id": message_id,
            "to": to,
            "cc": cc.split(",") if cc else [],
            "subject": subject,
            "body_length": len(body),
            "sent_at": datetime.utcnow().isoformat(),
            "delivery_status": "queued",
            "estimated_delivery": "within 1 minute",
            "size_bytes": len(subject) + len(body)
        }
    
    @mcp.tool()
    def get_inbox(folder: str = "inbox", limit: int = 20) -> dict:
        """Retrieve messages from email inbox.

        Args:
            folder: Folder to retrieve from (inbox, sent, drafts, spam)
            limit: Maximum number of messages to return (1-100)

        Returns:
            Dictionary with list of email messages
        """
        from datetime import datetime, timedelta
        import random
        
        valid_folders = ["inbox", "sent", "drafts", "spam", "trash"]
        if folder not in valid_folders:
            return {"error": f"Invalid folder. Must be one of: {', '.join(valid_folders)}", "success": False}
        
        if limit < 1 or limit > 100:
            return {"error": "Limit must be between 1 and 100", "success": False}
        
        # Generate sample emails
        messages = []
        senders = ["alice@example.com", "bob@company.com", "support@service.com", "news@newsletter.com"]
        subjects = [
            "Meeting reminder", "Project update", "Invoice #12345",
            "Weekly newsletter", "Account notification", "Re: Question about..."
        ]
        
        num_messages = random.randint(5, limit)
        for i in range(num_messages):
            messages.append({
                "id": f"msg_{i}_{random.randint(1000, 9999)}",
                "from": random.choice(senders),
                "subject": random.choice(subjects),
                "preview": "This is a preview of the email content...",
                "received_at": (datetime.utcnow() - timedelta(hours=random.randint(1, 168))).isoformat(),
                "size_kb": round(random.uniform(1, 50), 2),
                "is_read": random.choice([True, False]),
                "has_attachments": random.choice([True, False]),
                "folder": folder
            })
        
        # Sort by date (newest first)
        messages.sort(key=lambda x: x["received_at"], reverse=True)
        
        return {
            "success": True,
            "folder": folder,
            "message_count": len(messages),
            "unread_count": sum(1 for m in messages if not m["is_read"]),
            "fetched_at": datetime.utcnow().isoformat(),
            "messages": messages
        }
    
    @mcp.tool()
    def search_emails(query: str, folder: str = "all", limit: int = 50) -> dict:
        """Search emails by keyword or sender.

        Args:
            query: Search query (keywords, sender, subject)
            folder: Folder to search in (all, inbox, sent, etc.)
            limit: Maximum results to return (1-100)

        Returns:
            Dictionary with matching email messages
        """
        from datetime import datetime, timedelta
        import random
        
        if limit < 1 or limit > 100:
            return {"error": "Limit must be between 1 and 100", "success": False}
        
        # Simulate search results
        num_results = random.randint(2, min(limit, 15))
        results = []
        
        for i in range(num_results):
            results.append({
                "id": f"search_{i}_{random.randint(1000, 9999)}",
                "from": f"sender{i}@example.com",
                "subject": f"Email containing '{query}' - #{i+1}",
                "snippet": f"...{query} appeared in this message context...",
                "received_at": (datetime.utcnow() - timedelta(days=random.randint(0, 90))).isoformat(),
                "relevance_score": round(random.uniform(0.5, 1.0), 2),
                "folder": random.choice(["inbox", "sent", "archives"]),
                "is_read": random.choice([True, False])
            })
        
        # Sort by relevance
        results.sort(key=lambda x: x["relevance_score"], reverse=True)
        
        return {
            "success": True,
            "query": query,
            "folder_searched": folder,
            "results_count": len(results),
            "searched_at": datetime.utcnow().isoformat(),
            "results": results
        }
    
    return mcp


if __name__ == "__main__":
    port = int(os.environ.get("PORT", PORT_OAUTH2_HTTP))
    provider_port = int(os.environ.get("OAUTH2_PROVIDER_PORT", OAUTH2_PROVIDER_PORT))
    
    logger.info(f"Starting {SERVER_NAME_OAUTH2} on port {port}")
    logger.info(f"OAuth2 Provider: http://localhost:{provider_port}")
    logger.info(f"Protected Resource Metadata (PUBLIC): http://localhost:{port}/.well-known/oauth-protected-resource/mcp")
    logger.info(f"Client ID: {os.environ.get('OAUTH2_CLIENT_ID', DEFAULT_OAUTH2_CLIENT_ID)}")
    logger.info("")
    logger.info("Make sure OAuth2 provider is running first!")
    logger.info("")
    logger.info("OAuth2 Client Credentials Flow:")
    logger.info("1. Client tries HTTP request without token → HTTP 401 with WWW-Authenticate header")
    logger.info(f"2. Client fetches PRM from http://localhost:{port}/.well-known/oauth-protected-resource/mcp (PUBLIC)")
    logger.info("3. Client discovers AS from PRM, fetches AS metadata")
    logger.info("4. Client requests token from AS with client_id/client_secret")
    logger.info("5. Client retries HTTP request with Bearer token → HTTP 200 OK")
    
    # Create and run MCP server with OAuth2 authentication
    # RemoteAuthProvider automatically creates the PRM endpoint
    mcp_server = create_server(port)
    mcp_server.run(transport="http", port=port)
