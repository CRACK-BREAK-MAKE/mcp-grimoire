"""Database Query Tool v1.0 - HTTP Server with Security Keys Auth.

This server implements security keys authentication via custom headers.
Domain: Database Query Tool - Run SQL queries, inspect schemas, and export results.
Validates X-GitHub-Token and X-Brave-Key headers.
"""

import os

from fastmcp import FastMCP
from fastmcp.server.middleware import Middleware, MiddlewareContext
from fastmcp.server.dependencies import get_http_headers
from starlette.responses import JSONResponse

from src.common.constants import (
    DEFAULT_BRAVE_API_KEY,
    DEFAULT_GITHUB_PAT,
    PORT_SECURITY_KEYS_HTTP,
    SERVER_NAME_SECURITY_KEYS,
)
from src.common.logging import get_logger, log_startup, mask_sensitive_value
from src.common.middleware import add_standard_middleware


# Get module logger
logger = get_logger(__name__)


class SecurityKeysAuthMiddleware(Middleware):
    """Middleware to validate custom security key headers."""
    
    def __init__(self, github_pats: set[str], brave_keys: set[str]):
        self.github_pats = github_pats
        self.brave_keys = brave_keys
    
    async def on_request(self, context: MiddlewareContext, call_next):
        """Validate X-GitHub-Token and X-Brave-Key headers."""
        headers = get_http_headers()
        
        if headers:
            logger.debug("=" * 50)
            logger.debug(f"Request: {context.method}")
            logger.debug("HTTP Headers:")
            
            for header_name, header_value in headers.items():
                if header_name.lower() in ['x-github-token', 'x-brave-key']:
                    masked = mask_sensitive_value(header_value, show_chars=20)
                    logger.debug(f"  {header_name}: {masked}")
                else:
                    logger.debug(f"  {header_name}: {header_value}")
            
            github_token = headers.get('x-github-token')
            brave_key = headers.get('x-brave-key')
            
            github_valid = github_token in self.github_pats if github_token else False
            brave_valid = brave_key in self.brave_keys if brave_key else False
            
            logger.debug(f"GitHub token valid: {github_valid}")
            logger.debug(f"Brave key valid: {brave_valid}")
            logger.debug("=" * 50)
            
            # Accept if EITHER key is valid (simulates different MCP servers)
            if not (github_valid or brave_valid):
                return JSONResponse(
                    status_code=401,
                    content={
                        "error": "invalid_token",
                        "error_description": "Either X-GitHub-Token or X-Brave-Key header required and must be valid"
                    }
                )
        else:
            # No headers = no auth
            return JSONResponse(
                status_code=401,
                content={
                    "error": "invalid_token",
                    "error_description": "X-GitHub-Token and X-Brave-Key headers required"
                }
            )
        
        return await call_next(context)


def create_server() -> FastMCP:
    """Create Security Keys HTTP server.

    Returns:
        Configured FastMCP server with custom header auth via middleware
    """
    # Get valid security keys from environment or use defaults
    github_pats_str = os.environ.get("GITHUB_PATS", DEFAULT_GITHUB_PAT)
    brave_api_keys_str = os.environ.get("BRAVE_API_KEYS", DEFAULT_BRAVE_API_KEY)

    valid_github_pats = {key.strip() for key in github_pats_str.split(",") if key.strip()}
    valid_brave_keys = {key.strip() for key in brave_api_keys_str.split(",") if key.strip()}

    # Create FastMCP server WITHOUT built-in auth (middleware handles it)
    mcp = FastMCP(name=SERVER_NAME_SECURITY_KEYS)
    
    # Add standard middleware stack (structured logging)
    add_standard_middleware(
        mcp,
        server_prefix="SECURITY_KEYS_HTTP",
        enable_structured_logging=True,
        enable_header_logging=False,  # Custom auth middleware logs headers
    )
    
    # Add middleware to validate custom headers (must be after logging)
    mcp.add_middleware(SecurityKeysAuthMiddleware(valid_github_pats, valid_brave_keys))

    # Domain: Database Query Tool
    @mcp.tool()
    def run_sql_query(query: str, database: str = "default", limit: int = 100) -> dict:
        """Execute a SQL query and return the results.

        Args:
            query: SQL query to execute
            database: Target database name
            limit: Maximum number of rows to return (1-1000)

        Returns:
            Dictionary with query results, execution time, and metadata
        """
        from datetime import datetime, timedelta
        import random
        
        if limit < 1 or limit > 1000:
            return {"error": "Limit must be between 1 and 1000", "success": False}
        
        # Simulate query execution
        query_lower = query.lower()
        query_type = "SELECT" if "select" in query_lower else "INSERT" if "insert" in query_lower else "UPDATE" if "update" in query_lower else "DELETE" if "delete" in query_lower else "OTHER"
        
        # Generate sample results for SELECT queries
        results = []
        if query_type == "SELECT":
            num_rows = random.randint(5, min(limit, 50))
            for i in range(num_rows):
                results.append({
                    "id": i + 1,
                    "name": f"Record_{i+1}",
                    "value": round(random.uniform(100, 10000), 2),
                    "status": random.choice(["active", "pending", "completed"]),
                    "created_at": (datetime.utcnow() - timedelta(days=random.randint(1, 365))).isoformat()
                })
        
        execution_time_ms = round(random.uniform(10, 500), 2)
        
        return {
            "success": True,
            "query_type": query_type,
            "database": database,
            "rows_returned": len(results),
            "execution_time_ms": execution_time_ms,
            "executed_at": datetime.utcnow().isoformat(),
            "results": results,
            "truncated": len(results) >= limit
        }

    @mcp.tool()
    def get_table_schema(table_name: str, database: str = "default") -> dict:
        """Get the schema definition of a database table.

        Args:
            table_name: Name of the table to inspect
            database: Database containing the table

        Returns:
            Dictionary with table schema, columns, indexes, and constraints
        """
        from datetime import datetime, timedelta
        import random
        
        # Simulate table schema
        columns = [
            {"name": "id", "type": "INTEGER", "nullable": False, "primary_key": True, "auto_increment": True},
            {"name": "name", "type": "VARCHAR(255)", "nullable": False, "primary_key": False, "default": None},
            {"name": "email", "type": "VARCHAR(255)", "nullable": True, "primary_key": False, "default": None},
            {"name": "created_at", "type": "TIMESTAMP", "nullable": False, "primary_key": False, "default": "CURRENT_TIMESTAMP"},
            {"name": "updated_at", "type": "TIMESTAMP", "nullable": True, "primary_key": False, "default": None},
        ]
        
        indexes = [
            {"name": "PRIMARY", "columns": ["id"], "unique": True, "type": "BTREE"},
            {"name": "idx_email", "columns": ["email"], "unique": True, "type": "BTREE"},
            {"name": "idx_created_at", "columns": ["created_at"], "unique": False, "type": "BTREE"},
        ]
        
        constraints = [
            {"name": "PRIMARY KEY", "type": "PRIMARY KEY", "columns": ["id"]},
            {"name": "UNIQUE_email", "type": "UNIQUE", "columns": ["email"]},
        ]
        
        return {
            "success": True,
            "database": database,
            "table_name": table_name,
            "row_count": random.randint(100, 100000),
            "table_size_mb": round(random.uniform(1, 500), 2),
            "columns": columns,
            "indexes": indexes,
            "constraints": constraints,
            "engine": "InnoDB",
            "collation": "utf8mb4_unicode_ci",
            "created_at": (datetime.utcnow() - timedelta(days=random.randint(30, 1000))).isoformat()
        }

    @mcp.tool()
    def export_query_results(query_id: str, format: str = "csv") -> dict:
        """Export previously executed query results to file.

        Args:
            query_id: Unique identifier of the query to export
            format: Export format (csv, json, xlsx, sql)

        Returns:
            Dictionary with export details and download information
        """
        from datetime import datetime, timedelta
        import random
        
        valid_formats = ["csv", "json", "xlsx", "sql"]
        if format not in valid_formats:
            return {
                "error": f"Invalid format. Must be one of: {', '.join(valid_formats)}",
                "success": False
            }
        
        # Simulate export
        file_size_mb = round(random.uniform(0.1, 100), 2)
        row_count = random.randint(100, 50000)
        
        return {
            "success": True,
            "query_id": query_id,
            "format": format,
            "file_name": f"query_{query_id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.{format}",
            "file_size_mb": file_size_mb,
            "row_count": row_count,
            "download_url": f"https://exports.example.com/downloads/{query_id}.{format}",
            "expires_at": (datetime.utcnow() + timedelta(hours=24)).isoformat(),
            "generated_at": datetime.utcnow().isoformat(),
            "status": "ready"
        }

    return mcp


if __name__ == "__main__":
    port = int(os.environ.get("PORT", PORT_SECURITY_KEYS_HTTP))
    server = create_server()
    
    # Use centralized logging for startup
    log_startup(
        logger,
        SERVER_NAME_SECURITY_KEYS,
        port,
        transport="HTTP",
        auth_type="Security Keys",
        accepted_keys="GITHUB_PAT, BRAVE_API_KEY"
    )
    
    server.run(transport="http", port=port)
