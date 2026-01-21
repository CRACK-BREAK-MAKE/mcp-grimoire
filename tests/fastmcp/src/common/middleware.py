"""Common middleware for FastMCP servers.

This module provides reusable middleware components following FastMCP best practices.
Uses structured logging for production-ready request/response logging.
"""

from typing import Any

from fastmcp.server.middleware import Middleware, MiddlewareContext
from fastmcp.server.middleware.logging import StructuredLoggingMiddleware
from fastmcp.server.dependencies import get_http_headers

from src.common.logging import get_logger, mask_sensitive_value


# Get module logger
logger = get_logger(__name__)


class RequestHeaderLoggingMiddleware(Middleware):
    """Custom middleware to log HTTP headers for debugging.
    
    This middleware logs incoming HTTP headers, masking sensitive values
    like Authorization headers. Useful for debugging authentication and
    transport issues.
    
    Example:
        >>> mcp = FastMCP("MyServer")
        >>> mcp.add_middleware(RequestHeaderLoggingMiddleware(server_prefix="MY_SERVER"))
    """
    
    def __init__(self, server_prefix: str = "SERVER", mask_auth: bool = True):
        """Initialize the middleware.
        
        Args:
            server_prefix: Prefix for log messages to identify the server
            mask_auth: Whether to mask Authorization headers (recommended: True)
        """
        self.server_prefix = server_prefix
        self.mask_auth = mask_auth
    
    async def on_request(self, context: MiddlewareContext, call_next):
        """Log HTTP headers when available."""
        headers = get_http_headers()
        if headers:
            logger.debug("=" * 50)
            logger.debug(f"[{self.server_prefix}] Request: {context.method}")
            logger.debug(f"[{self.server_prefix}] HTTP Headers:")
            
            for header_name, header_value in headers.items():
                if self.mask_auth and 'authorization' in header_name.lower():
                    # Mask auth header for security
                    masked_value = mask_sensitive_value(header_value, show_chars=20)
                    logger.debug(f"[{self.server_prefix}]   {header_name}: {masked_value}")
                else:
                    logger.debug(f"[{self.server_prefix}]   {header_name}: {header_value}")
            
            logger.debug("=" * 50)
        
        return await call_next(context)


def get_default_logging_middleware(
    include_payloads: bool = True,
    include_payload_length: bool = True
) -> StructuredLoggingMiddleware:
    """Get a configured StructuredLoggingMiddleware instance.
    
    This is the recommended logging middleware for FastMCP servers,
    providing structured JSON logging for production environments.
    
    Args:
        include_payloads: Whether to include request/response payloads
        include_payload_length: Whether to include payload length in logs
        
    Returns:
        Configured StructuredLoggingMiddleware instance
        
    Example:
        >>> from src.common.middleware import get_default_logging_middleware
        >>> mcp = FastMCP("MyServer")
        >>> mcp.add_middleware(get_default_logging_middleware())
    """
    return StructuredLoggingMiddleware(
        include_payloads=include_payloads,
        include_payload_length=include_payload_length
    )


def add_standard_middleware(
    mcp: Any,
    server_prefix: str = "SERVER",
    enable_structured_logging: bool = True,
    enable_header_logging: bool = False,
    include_payloads: bool = False,
    include_payload_length: bool = True
) -> None:
    """Add standard middleware stack to an MCP server.
    
    This is a convenience function that adds the recommended middleware
    in the correct order for FastMCP servers.
    
    Middleware order (as per FastMCP docs):
    1. Error handling (first in, last out)
    2. Rate limiting (if needed)
    3. Timing (if needed)
    4. Logging (last in, first out)
    
    Args:
        mcp: FastMCP server instance
        server_prefix: Prefix for log messages
        enable_structured_logging: Use StructuredLoggingMiddleware
        enable_header_logging: Add custom header logging middleware (debug)
        include_payloads: Include request/response payloads in logs
        include_payload_length: Include payload length in logs
        
    Example:
        >>> from fastmcp import FastMCP
        >>> from src.common.middleware import add_standard_middleware
        >>> 
        >>> mcp = FastMCP("MyServer")
        >>> add_standard_middleware(
        ...     mcp,
        ...     server_prefix="MY_SERVER",
        ...     enable_structured_logging=True,
        ...     enable_header_logging=True  # For debugging
        ... )
    """
    # Add structured logging (recommended for production)
    if enable_structured_logging:
        logger.info(f"[{server_prefix}] Adding StructuredLoggingMiddleware")
        mcp.add_middleware(get_default_logging_middleware(
            include_payloads=include_payloads,
            include_payload_length=include_payload_length
        ))
    
    # Add header logging for debugging (optional)
    if enable_header_logging:
        logger.info(f"[{server_prefix}] Adding RequestHeaderLoggingMiddleware")
        mcp.add_middleware(RequestHeaderLoggingMiddleware(server_prefix=server_prefix))
