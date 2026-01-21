"""OAuth2 Provider with JWT Token Support.

This is an OAuth2 authorization server implementing:
- Client Credentials flow (RFC 6749)
- JWT access tokens (RFC 7519)
- Token introspection (RFC 7662)
- Authorization Server Metadata (RFC 8414)
"""

import os
import secrets
import time
import jwt  # PyJWT
from urllib.parse import urlencode

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, RedirectResponse
from starlette.routing import Route

from src.common.constants import (
    DEFAULT_OAUTH2_CLIENT_ID,
    DEFAULT_OAUTH2_CLIENT_SECRET,
    DEFAULT_OAUTH2_TOKEN_EXPIRY,
    OAUTH2_PROVIDER_PORT,
    PORT_OAUTH2_HTTP,
)

# JWT signing key (in production, use proper key management)
JWT_SECRET_KEY = os.environ.get("OAUTH2_JWT_SECRET", "mcp-oauth2-test-secret-key-do-not-use-in-production")
JWT_ALGORITHM = "HS256"

# In-memory storage for OAuth2 state
AUTHORIZATION_CODES: dict[str, dict] = {}
ACCESS_TOKENS: dict[str, dict] = {}  # Maps JWT token ID (jti) to token data
CLIENTS: dict[str, dict] = {}


def initialize_clients() -> None:
    """Initialize default OAuth2 clients."""
    client_id = os.environ.get("OAUTH2_CLIENT_ID", DEFAULT_OAUTH2_CLIENT_ID)
    client_secret = os.environ.get("OAUTH2_CLIENT_SECRET", DEFAULT_OAUTH2_CLIENT_SECRET)

    CLIENTS[client_id] = {
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uris": ["*"],  # Accept any redirect URI for testing
    }


async def oauth_authorize(request: Request) -> HTMLResponse | RedirectResponse:
    """Handle OAuth2 authorization requests.

    Args:
        request: HTTP request

    Returns:
        HTML consent page or redirect response
    """
    # Parse query parameters
    client_id = request.query_params.get("client_id")
    redirect_uri = request.query_params.get("redirect_uri")
    state = request.query_params.get("state")
    scope = request.query_params.get("scope", "read write")
    code_challenge = request.query_params.get("code_challenge")
    code_challenge_method = request.query_params.get("code_challenge_method")

    # Validate client_id
    if not client_id or client_id not in CLIENTS:
        return JSONResponse({"error": "invalid_client"}, status_code=400)

    if not redirect_uri:
        return JSONResponse({"error": "invalid_request"}, status_code=400)

    # Auto-approve for testing (in production, show consent page)
    # Generate authorization code
    code = secrets.token_urlsafe(32)
    AUTHORIZATION_CODES[code] = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": scope,
        "code_challenge": code_challenge,
        "code_challenge_method": code_challenge_method,
        "created_at": time.time(),
    }

    # Build redirect URL
    params = {"code": code}
    if state:
        params["state"] = state

    redirect_url = f"{redirect_uri}?{urlencode(params)}"
    return RedirectResponse(url=redirect_url, status_code=302)


async def oauth_token(request: Request) -> JSONResponse:
    """Handle OAuth2 token requests.

    Args:
        request: HTTP request

    Returns:
        JSON response with access token or error
    """
    # Parse form data
    form = await request.form()
    grant_type = form.get("grant_type")

    if grant_type == "authorization_code":
        return await handle_authorization_code(request, form)
    elif grant_type == "refresh_token":
        return await handle_refresh_token(request, form)
    elif grant_type == "client_credentials":
        return await handle_client_credentials(request, form)
    else:
        return JSONResponse({"error": "unsupported_grant_type"}, status_code=400)


async def handle_authorization_code(request: Request, form: dict) -> JSONResponse:
    """Handle authorization code grant.

    Args:
        request: HTTP request
        form: Form data

    Returns:
        JSON response with tokens
    """
    code = form.get("code")
    client_id = form.get("client_id")
    client_secret = form.get("client_secret")
    redirect_uri = form.get("redirect_uri")
    code_verifier = form.get("code_verifier")

    # Validate client credentials
    if not client_id or client_id not in CLIENTS:
        return JSONResponse({"error": "invalid_client"}, status_code=401)

    client = CLIENTS[client_id]
    if client_secret and client["client_secret"] != client_secret:
        return JSONResponse({"error": "invalid_client"}, status_code=401)

    # Validate authorization code
    if not code or code not in AUTHORIZATION_CODES:
        return JSONResponse({"error": "invalid_grant"}, status_code=400)

    auth_code = AUTHORIZATION_CODES[code]

    # Validate redirect URI
    if auth_code["redirect_uri"] != redirect_uri:
        return JSONResponse({"error": "invalid_grant"}, status_code=400)

    # Validate PKCE if present
    if auth_code.get("code_challenge") and not code_verifier:
        return JSONResponse({"error": "invalid_grant"}, status_code=400)
        # In production, validate PKCE challenge here

    # Delete used authorization code
    del AUTHORIZATION_CODES[code]

    # Generate access token
    access_token = secrets.token_urlsafe(32)
    refresh_token = secrets.token_urlsafe(32)

    ACCESS_TOKENS[access_token] = {
        "client_id": client_id,
        "scope": auth_code["scope"],
        "created_at": time.time(),
        "expires_in": DEFAULT_OAUTH2_TOKEN_EXPIRY,
        "refresh_token": refresh_token,
    }

    return JSONResponse({
        "access_token": access_token,
        "token_type": "Bearer",
        "expires_in": DEFAULT_OAUTH2_TOKEN_EXPIRY,
        "refresh_token": refresh_token,
        "scope": auth_code["scope"],
    })


async def handle_refresh_token(request: Request, form: dict) -> JSONResponse:
    """Handle refresh token grant.

    Args:
        request: HTTP request
        form: Form data

    Returns:
        JSON response with new tokens
    """
    refresh_token = form.get("refresh_token")
    client_id = form.get("client_id")

    # Find access token by refresh token
    old_access_token = None
    for token, data in ACCESS_TOKENS.items():
        if data.get("refresh_token") == refresh_token and data["client_id"] == client_id:
            old_access_token = token
            break

    if not old_access_token:
        return JSONResponse({"error": "invalid_grant"}, status_code=400)

    # Generate new tokens
    access_token = secrets.token_urlsafe(32)
    new_refresh_token = secrets.token_urlsafe(32)

    old_data = ACCESS_TOKENS[old_access_token]
    ACCESS_TOKENS[access_token] = {
        "client_id": client_id,
        "scope": old_data["scope"],
        "created_at": time.time(),
        "expires_in": DEFAULT_OAUTH2_TOKEN_EXPIRY,
        "refresh_token": new_refresh_token,
    }

    # Delete old token
    del ACCESS_TOKENS[old_access_token]

    return JSONResponse({
        "access_token": access_token,
        "token_type": "Bearer",
        "expires_in": DEFAULT_OAUTH2_TOKEN_EXPIRY,
        "refresh_token": new_refresh_token,
        "scope": old_data["scope"],
    })


async def handle_client_credentials(request: Request, form: dict) -> JSONResponse:
    """Handle client credentials grant.

    Args:
        request: HTTP request
        form: Form data

    Returns:
        JSON response with JWT access token
    """
    # Extract client credentials from form or Authorization header
    client_id = form.get("client_id")
    client_secret = form.get("client_secret")
    
    # If not in form, check Authorization header (Basic Auth)
    if not client_id or not client_secret:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Basic "):
            import base64
            try:
                credentials = base64.b64decode(auth_header[6:]).decode("utf-8")
                client_id, client_secret = credentials.split(":", 1)
            except Exception:
                return JSONResponse({"error": "invalid_client"}, status_code=401)
        else:
            return JSONResponse({"error": "invalid_client"}, status_code=401)
    
    # Validate client credentials
    if not client_id or client_id not in CLIENTS:
        return JSONResponse({"error": "invalid_client"}, status_code=401)
    
    client = CLIENTS[client_id]
    if client["client_secret"] != client_secret:
        return JSONResponse({"error": "invalid_client"}, status_code=401)
    
    # Get requested scope (default to MCP scopes)
    scope = form.get("scope", "mcp:tools:read mcp:tools:write")
    
    # Get token expiry
    token_expiry = int(os.environ.get("OAUTH2_TOKEN_EXPIRY", DEFAULT_OAUTH2_TOKEN_EXPIRY))
    
    # Generate JWT access token
    now = int(time.time())
    exp = now + token_expiry
    jti = secrets.token_urlsafe(16)  # Token ID for revocation
    
    # Get provider URL for issuer claim
    provider_port = int(os.environ.get("PORT", OAUTH2_PROVIDER_PORT))
    issuer = f"http://localhost:{provider_port}"
    
    # Get audience (resource server) from environment or use default
    audience = os.environ.get("OAUTH2_AUDIENCE", f"http://localhost:{PORT_OAUTH2_HTTP}")
    
    # JWT payload with standard claims
    payload = {
        "iss": issuer,  # Issuer
        "sub": client_id,  # Subject (client_id for client credentials)
        "aud": audience,  # Audience (resource server)
        "exp": exp,  # Expiration time
        "iat": now,  # Issued at
        "jti": jti,  # JWT ID (for revocation)
        "scope": scope,  # OAuth2 scopes
        "client_id": client_id,  # Client identifier
        "grant_type": "client_credentials",
    }
    
    # Generate JWT
    access_token = jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    
    # Store token metadata for introspection (keyed by jti)
    ACCESS_TOKENS[jti] = {
        "client_id": client_id,
        "scope": scope,
        "created_at": now,
        "expires_at": exp,
        "grant_type": "client_credentials",
        "active": True,
    }
    
    return JSONResponse({
        "access_token": access_token,
        "token_type": "Bearer",
        "expires_in": token_expiry,
        "scope": scope,
    })


async def oauth_metadata(request: Request) -> JSONResponse:
    """Provide OAuth2 Authorization Server Metadata (RFC 8414).

    Args:
        request: HTTP request

    Returns:
        JSON response with AS metadata
    """
    base_url = str(request.base_url).rstrip("/")

    return JSONResponse({
        "issuer": base_url,
        "authorization_endpoint": f"{base_url}/oauth/authorize",
        "token_endpoint": f"{base_url}/oauth/token",
        "introspection_endpoint": f"{base_url}/oauth/validate",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token", "client_credentials"],
        "token_endpoint_auth_methods_supported": ["client_secret_post", "client_secret_basic"],
        "code_challenge_methods_supported": ["S256", "plain"],
        "scopes_supported": ["mcp:tools:read", "mcp:tools:write", "mcp:tools:call"],
        "token_signing_alg_values_supported": [JWT_ALGORITHM],
        "introspection_endpoint_auth_methods_supported": ["bearer"],
    })


async def validate_token(request: Request) -> JSONResponse:
    """Validate JWT access token (RFC 7662 Token Introspection).

    Args:
        request: HTTP request with Bearer token

    Returns:
        JSON response with token introspection result
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return JSONResponse({"error": "invalid_request", "error_description": "Missing Bearer token"}, status_code=401)

    token = auth_header[7:]
    
    try:
        # Decode and verify JWT (without audience validation - introspection should work for any audience)
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
            options={
                "verify_signature": True,
                "verify_exp": True,
                "verify_iat": True,
                "verify_aud": False,  # Don't validate audience during introspection
            }
        )
        
        # Extract jti to check if token was revoked
        jti = payload.get("jti")
        if not jti or jti not in ACCESS_TOKENS:
            return JSONResponse({
                "active": False,
                "error": "token_revoked",
                "error_description": "Token has been revoked"
            }, status_code=401)
        
        token_data = ACCESS_TOKENS[jti]
        
        # Check if token is still active
        if not token_data.get("active", False):
            return JSONResponse({
                "active": False,
                "error": "token_inactive",
                "error_description": "Token is not active"
            }, status_code=401)
        
        # Return introspection response (RFC 7662)
        return JSONResponse({
            "active": True,
            "scope": payload.get("scope", ""),
            "client_id": payload.get("client_id", ""),
            "token_type": "Bearer",
            "exp": payload.get("exp"),
            "iat": payload.get("iat"),
            "sub": payload.get("sub"),
            "aud": payload.get("aud"),
            "iss": payload.get("iss"),
            "jti": jti,
        })
        
    except jwt.ExpiredSignatureError:
        return JSONResponse({
            "active": False,
            "error": "token_expired",
            "error_description": "Token has expired"
        }, status_code=401)
    except jwt.InvalidTokenError as e:
        return JSONResponse({
            "active": False,
            "error": "invalid_token",
            "error_description": str(e)
        }, status_code=401)


def create_app() -> Starlette:
    """Create OAuth2 provider application.

    Returns:
        Starlette application
    """
    initialize_clients()

    routes = [
        Route("/oauth/authorize", oauth_authorize),
        Route("/oauth/token", oauth_token, methods=["POST"]),
        Route("/.well-known/oauth-authorization-server", oauth_metadata),
        Route("/oauth/validate", validate_token, methods=["POST"]),
    ]

    return Starlette(debug=True, routes=routes)


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", OAUTH2_PROVIDER_PORT))
    logger.info(f"Starting OAuth2 Provider on port {port}")
    logger.info(f"Client ID: {os.environ.get('OAUTH2_CLIENT_ID', DEFAULT_OAUTH2_CLIENT_ID)}")
    logger.info(f"Authorization endpoint: http://localhost:{port}/oauth/authorize")
    logger.info(f"Token endpoint: http://localhost:{port}/oauth/token")

    app = create_app()
    uvicorn.run(app, host="127.0.0.1", port=port)
