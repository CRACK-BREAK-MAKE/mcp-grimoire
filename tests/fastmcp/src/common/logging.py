"""Centralized logging utilities for FastMCP servers and clients.

This module provides structured logging capabilities using Python's built-in
logging module, following FastMCP best practices.
"""

import logging
from typing import Any

# Configure the root logger for the application
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)


def get_logger(name: str) -> logging.Logger:
    """Get a logger instance with the specified name.
    
    This centralizes logger creation and ensures consistent configuration
    across all servers and clients. Use this instead of print statements.
    
    Args:
        name: Logger name, typically __name__ from the calling module
        
    Returns:
        Configured Logger instance
        
    Example:
        >>> logger = get_logger(__name__)
        >>> logger.info("Server started")
        >>> logger.debug("Request details: %s", details)
        >>> logger.error("Failed to process: %s", error)
    """
    return logging.getLogger(name)


def setup_logging(level: int = logging.INFO, format_string: str | None = None) -> None:
    """Configure global logging settings.
    
    Call this at application startup to customize logging behavior.
    
    Args:
        level: Logging level (e.g., logging.DEBUG, logging.INFO)
        format_string: Custom format string for log messages
        
    Example:
        >>> setup_logging(level=logging.DEBUG)
        >>> setup_logging(
        ...     level=logging.INFO,
        ...     format_string='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
        ... )
    """
    if format_string:
        logging.basicConfig(
            level=level,
            format=format_string,
            datefmt='%Y-%m-%d %H:%M:%S',
            force=True  # Override existing configuration
        )
    else:
        logging.basicConfig(level=level, force=True)


def log_startup(logger: logging.Logger, server_name: str, port: int, **kwargs: Any) -> None:
    """Log server startup information in a consistent format.
    
    Args:
        logger: Logger instance
        server_name: Name of the server
        port: Port number the server is running on
        **kwargs: Additional server configuration to log
        
    Example:
        >>> logger = get_logger(__name__)
        >>> log_startup(logger, "API Key SSE Server", 8003, api_keys_count=5)
    """
    logger.debug("=====================================================")
    logger.info(f"Starting {server_name}")
    logger.info(f"Port: {port}")
    
    for key, value in kwargs.items():
        # Format key name nicely (e.g., api_keys_count -> API Keys Count)
        formatted_key = key.replace('_', ' ').title()
        logger.info(f"{formatted_key}: {value}")
    
    logger.debug("=====================================================")


def log_request(logger: logging.Logger, method: str, **details: Any) -> None:
    """Log incoming request details.
    
    Args:
        logger: Logger instance
        method: MCP method name (e.g., "tools/call")
        **details: Additional request details to log
        
    Example:
        >>> log_request(logger, "tools/call", tool_name="greet", args={"name": "Alice"})
    """
    logger.debug(f"Request: {method}")
    if details:
        for key, value in details.items():
            logger.debug(f"  {key}: {value}")


def log_response(logger: logging.Logger, method: str, success: bool, **details: Any) -> None:
    """Log response details.
    
    Args:
        logger: Logger instance
        method: MCP method name
        success: Whether the request succeeded
        **details: Additional response details to log
        
    Example:
        >>> log_response(logger, "tools/call", True, result="Hello, Alice!")
    """
    status = "Success" if success else "Failed"
    logger.debug(f"Response: {method} - {status}")
    if details:
        for key, value in details.items():
            logger.debug(f"  {key}: {value}")


def mask_sensitive_value(value: str, show_chars: int = 30) -> str:
    """Mask sensitive values for safe logging.
    
    Args:
        value: The sensitive value to mask
        show_chars: Number of characters to show before masking
        
    Returns:
        Masked value showing only first few characters
        
    Example:
        >>> mask_sensitive_value("secret-api-key-12345678", 10)
        'secret-api... (len=22)'
    """
    if len(value) <= show_chars:
        return f"{'*' * len(value)} (len={len(value)})"
    return f"{value[:show_chars]}... (len={len(value)})"
