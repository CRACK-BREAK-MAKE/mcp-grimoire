"""Common logging handlers for FastMCP clients.

This module provides reusable logging handlers for MCP clients following
FastMCP best practices for server log handling.
"""

import logging
from fastmcp.client.logging import LogMessage

from src.common.logging import get_logger


# Get module logger
logger = get_logger(__name__)

# Logging level mapping from MCP to Python
LOGGING_LEVEL_MAP = {
    "debug": logging.DEBUG,
    "info": logging.INFO,
    "notice": logging.INFO,  # MCP notice -> Python INFO
    "warning": logging.WARNING,
    "error": logging.ERROR,
    "critical": logging.CRITICAL,
    "alert": logging.CRITICAL,  # MCP alert -> Python CRITICAL
    "emergency": logging.CRITICAL,  # MCP emergency -> Python CRITICAL
}


async def default_log_handler(message: LogMessage) -> None:
    """Default log handler for MCP clients.
    
    This handler forwards MCP server logs to Python's logging system
    at the appropriate severity level. The MCP levels map as follows:
    - notice -> INFO
    - alert, emergency -> CRITICAL
    
    Args:
        message: LogMessage from MCP server containing log data
        
    Example:
        >>> from fastmcp import Client
        >>> from src.common.client_logging import default_log_handler
        >>> 
        >>> client = Client(
        ...     "http://localhost:8002/mcp",
        ...     log_handler=default_log_handler
        ... )
    """
    msg = message.data.get('msg', '')
    extra = message.data.get('extra')
    logger_name = message.logger or 'mcp.server'
    
    # Get appropriate log level
    level = LOGGING_LEVEL_MAP.get(message.level.lower(), logging.INFO)
    
    # Get or create logger for this source
    server_logger = logging.getLogger(logger_name)
    
    # Log with extra data if present
    if extra:
        server_logger.log(level, f"{msg} | Extra: {extra}")
    else:
        server_logger.log(level, msg)


async def detailed_log_handler(message: LogMessage) -> None:
    """Detailed log handler for debugging MCP client-server communication.
    
    This handler provides more verbose output including the message level,
    logger name, and structured data.
    
    Args:
        message: LogMessage from MCP server
        
    Example:
        >>> client = Client(
        ...     "http://localhost:8002/mcp",
        ...     log_handler=detailed_log_handler
        ... )
    """
    msg = message.data.get('msg', '')
    extra = message.data.get('extra')
    
    level_upper = message.level.upper()
    
    if message.logger:
        prefix = f"[{message.logger}] [{level_upper}]"
    else:
        prefix = f"[{level_upper}]"
    
    if extra:
        logger.info(f"{prefix} {msg}")
        logger.info(f"  Extra data: {extra}")
    else:
        logger.info(f"{prefix} {msg}")


async def error_only_log_handler(message: LogMessage) -> None:
    """Log handler that only logs errors and warnings.
    
    Useful for production environments where you only want to capture
    error and warning messages from the server.
    
    Args:
        message: LogMessage from MCP server
        
    Example:
        >>> client = Client(
        ...     "http://localhost:8002/mcp",
        ...     log_handler=error_only_log_handler
        ... )
    """
    if message.level.lower() in ['error', 'critical', 'alert', 'emergency', 'warning']:
        msg = message.data.get('msg', '')
        extra = message.data.get('extra')
        
        level = LOGGING_LEVEL_MAP.get(message.level.lower(), logging.ERROR)
        server_logger = logging.getLogger(f'mcp.server.{message.logger or "unknown"}')
        
        if extra:
            server_logger.log(level, f"{msg} | Extra: {extra}")
        else:
            server_logger.log(level, msg)
