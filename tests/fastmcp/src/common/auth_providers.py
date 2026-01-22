"""Custom authentication providers for FastMCP."""

import base64
import hmac
import secrets

import bcrypt
from fastmcp.server.auth.providers.debug import DebugTokenVerifier

from src.common.logging import get_logger

# Get module logger
logger = get_logger(__name__)
logger.debug("auth_providers.py module loaded")


class BasicAuthTokenVerifier(DebugTokenVerifier):
    """Token verifier for HTTP Basic Authentication.

    Validates credentials in the format 'Basic <base64(username:password)>'.
    Supports multiple valid credential pairs.
    """

    def __init__(
        self,
        username: str,
        password: str,
        client_id: str = "basic-auth-client",
        scopes: list[str] | None = None,
        additional_credentials: list[tuple[str, str]] | None = None,
    ) -> None:
        """Initialize the basic auth verifier.

        Args:
            username: Expected username
            password: Expected password (will be hashed)
            client_id: Client identifier for auth context
            scopes: List of scopes granted to authenticated users
            additional_credentials: Optional list of (username, password) tuples for additional valid credentials
        """
        # Store multiple credential pairs
        self.valid_credentials = {
            username: bcrypt.hashpw(password.encode(), bcrypt.gensalt())
        }
        
        # Add any additional credential pairs
        if additional_credentials:
            for user, pwd in additional_credentials:
                self.valid_credentials[user] = bcrypt.hashpw(pwd.encode(), bcrypt.gensalt())

        # Create validation function that checks basic auth format
        # Note: FastMCP's BearerAuthBackend strips "Bearer " prefix before passing token
        # So we receive base64-encoded credentials directly: base64(username:password)
        async def validate(token: str) -> bool:
            """Validate basic auth token.

            Args:
                token: Base64-encoded credentials (username:password)
                      FastMCP strips "Bearer " prefix, so we get the token part only

            Returns:
                True if credentials are valid
            """
            logger.debug("=====================================================")
            logger.debug("Basic Auth validation called")
            logger.debug(f"Received token length: {len(token)}")
            
            try:
                # Decode base64 credentials
                credentials = base64.b64decode(token).decode("utf-8")
                provided_username, provided_password = credentials.split(":", 1)
                logger.debug(f"Provided username: {provided_username}")

                # Check if username exists in valid credentials
                if provided_username not in self.valid_credentials:
                    logger.warning(f"Unknown username: {provided_username}")
                    return False

                # Verify password for this username
                password_hash = self.valid_credentials[provided_username]
                password_match = bcrypt.checkpw(
                    provided_password.encode(),
                    password_hash,
                )
                logger.debug(f"Password match: {password_match}")
                logger.debug("=====================================================")
                return password_match
            except Exception as e:
                logger.error(f"Validation error: {e}")
                logger.debug("=====================================================")
                return False

        super().__init__(
            validate=validate,
            client_id=client_id,
            scopes=scopes or ["read", "write"],
        )


class APIKeyVerifier(DebugTokenVerifier):
    """Token verifier for API Key authentication.

    Validates API keys passed as bearer tokens.
    """

    def __init__(
        self,
        valid_api_keys: set[str],
        client_id: str = "api-key-client",
        scopes: list[str] | None = None,
    ) -> None:
        """Initialize the API key verifier.

        Args:
            valid_api_keys: Set of valid API keys
            client_id: Client identifier for auth context
            scopes: List of scopes granted to authenticated users
        """
        self.valid_api_keys = valid_api_keys

        # Create validation function that checks if API key is valid
        def validate(token: str) -> bool:
            """Validate API key token.

            Args:
                token: API key token

            Returns:
                True if API key is valid
            """
            # Use constant-time comparison to prevent timing attacks
            return any(
                hmac.compare_digest(token, valid_key)
                for valid_key in self.valid_api_keys
            )

        super().__init__(
            validate=validate,
            client_id=client_id,
            scopes=scopes or ["read", "write"],
        )


class SecurityKeyVerifier(DebugTokenVerifier):
    """Token verifier for security keys (like GITHUB_PAT, BRAVE_API_KEY).

    Validates security keys from specific headers.
    """

    def __init__(
        self,
        key_name: str,
        valid_keys: set[str],
        client_id: str = "security-key-client",
        scopes: list[str] | None = None,
    ) -> None:
        """Initialize the security key verifier.

        Args:
            key_name: Name of the key (e.g., 'GITHUB_PAT', 'BRAVE_API_KEY')
            valid_keys: Set of valid security keys
            client_id: Client identifier for auth context
            scopes: List of scopes granted to authenticated users
        """
        self.key_name = key_name
        self.valid_keys = valid_keys

        # Create validation function that checks if security key is valid
        def validate(token: str) -> bool:
            """Validate security key token.

            Args:
                token: Security key token

            Returns:
                True if security key is valid
            """
            # Use constant-time comparison to prevent timing attacks
            return any(
                hmac.compare_digest(token, valid_key)
                for valid_key in self.valid_keys
            )

        super().__init__(
            validate=validate,
            client_id=client_id,
            scopes=scopes or ["read", "write"],
        )


def generate_secure_token(length: int = 32) -> str:
    """Generate a cryptographically secure random token.

    Args:
        length: Length of the token in bytes

    Returns:
        Secure random token as hex string
    """
    return secrets.token_hex(length)


def create_basic_auth_header(username: str, password: str) -> str:
    """Create HTTP Basic Authentication header value.

    Args:
        username: Username
        password: Password

    Returns:
        Basic auth header value (e.g., 'Basic <base64>')
    """
    credentials = f"{username}:{password}"
    encoded = base64.b64encode(credentials.encode()).decode()
    return f"Basic {encoded}"
