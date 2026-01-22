#!/usr/bin/env python3
"""Data Analytics v1.0 - Security Keys Authentication SSE Server.

This server implements security keys authentication via custom headers over SSE.
Domain: Data Analytics - Analyze data, generate reports, and visualize trends.
Validates X-GitHub-Token and X-Brave-Key headers.
"""

import os
from typing import Any

from fastmcp import FastMCP
from fastmcp.server.middleware import Middleware, MiddlewareContext
from fastmcp.server.dependencies import get_http_headers

from src.common.constants import (
    DEFAULT_BRAVE_API_KEY,
    DEFAULT_GITHUB_PAT,
    PORT_SECURITY_KEYS_SSE,
    SERVER_NAME_SECURITY_KEYS_SSE,
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
            logger.debug("=====================================================")
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
            logger.debug("=====================================================")
            
            # Accept if EITHER key is valid (simulates different MCP servers)
            if not (github_valid or brave_valid):
                # For SSE, raise an exception to reject the connection
                raise ValueError("Unauthorized: Either X-GitHub-Token or X-Brave-Key header required and must be valid")
        else:
            # No headers = no auth
            raise ValueError("Unauthorized: X-GitHub-Token or X-Brave-Key header required")
        
        return await call_next(context)


def create_server() -> FastMCP:
    """Create Security Keys SSE server.

    Returns:
        Configured FastMCP server with custom header auth via middleware
    """
    # Get valid security keys from environment or use defaults
    github_pats_str = os.environ.get("GITHUB_PATS", DEFAULT_GITHUB_PAT)
    brave_api_keys_str = os.environ.get("BRAVE_API_KEYS", DEFAULT_BRAVE_API_KEY)

    valid_github_pats = {key.strip() for key in github_pats_str.split(",") if key.strip()}
    valid_brave_keys = {key.strip() for key in brave_api_keys_str.split(",") if key.strip()}

    # Create FastMCP server WITHOUT built-in auth (middleware handles it)
    mcp = FastMCP(name=SERVER_NAME_SECURITY_KEYS_SSE)
    
    # Add standard middleware stack (structured logging)
    add_standard_middleware(
        mcp,
        server_prefix="SECURITY_KEYS_SSE",
        enable_structured_logging=True,
        enable_header_logging=False,  # Custom auth middleware logs headers
    )
    
    # Add middleware to validate custom headers (must be after logging)
    mcp.add_middleware(SecurityKeysAuthMiddleware(valid_github_pats, valid_brave_keys))

    # Domain: Data Analytics
    @mcp.tool()
    def analyze_dataset(dataset_name: str, analysis_type: str = "summary") -> dict:
        """Analyze a dataset and return statistical insights.

        Args:
            dataset_name: Name of the dataset to analyze
            analysis_type: Type of analysis (summary, correlation, distribution)

        Returns:
            Dictionary with analysis results and statistics
        """
        from datetime import datetime
        import random
        
        valid_types = ["summary", "correlation", "distribution", "outliers"]
        if analysis_type not in valid_types:
            return {
                "error": f"Invalid analysis_type. Must be one of: {', '.join(valid_types)}",
                "success": False
            }
        
        # Simulate dataset analysis
        row_count = random.randint(1000, 100000)
        column_count = random.randint(5, 50)
        
        return {
            "success": True,
            "dataset_name": dataset_name,
            "analysis_type": analysis_type,
            "row_count": row_count,
            "column_count": column_count,
            "statistics": {
                "mean": round(random.uniform(50, 150), 2),
                "median": round(random.uniform(45, 155), 2),
                "std_dev": round(random.uniform(10, 30), 2),
                "min": round(random.uniform(0, 30), 2),
                "max": round(random.uniform(180, 250), 2)
            },
            "missing_values": random.randint(0, 100),
            "duplicates": random.randint(0, 50),
            "analyzed_at": datetime.utcnow().isoformat(),
            "processing_time_ms": round(random.uniform(100, 2000), 2)
        }

    @mcp.tool()
    def generate_report(report_type: str, data_source: str, format: str = "pdf") -> dict:
        """Generate analytical report from data source.

        Args:
            report_type: Type of report (sales, performance, usage, trends)
            data_source: Data source identifier
            format: Output format (pdf, xlsx, html, json)

        Returns:
            Dictionary with report generation details and download link
        """
        from datetime import datetime, timedelta
        import random
        
        valid_report_types = ["sales", "performance", "usage", "trends", "financial"]
        valid_formats = ["pdf", "xlsx", "html", "json", "csv"]
        
        if report_type not in valid_report_types:
            return {
                "error": f"Invalid report_type. Must be one of: {', '.join(valid_report_types)}",
                "success": False
            }
        
        if format not in valid_formats:
            return {
                "error": f"Invalid format. Must be one of: {', '.join(valid_formats)}",
                "success": False
            }
        
        report_id = f"rpt_{random.randint(10000, 99999)}"
        file_size_mb = round(random.uniform(0.5, 25), 2)
        
        return {
            "success": True,
            "report_id": report_id,
            "report_type": report_type,
            "data_source": data_source,
            "format": format,
            "file_name": f"{report_type}_report_{datetime.utcnow().strftime('%Y%m%d')}.{format}",
            "file_size_mb": file_size_mb,
            "page_count": random.randint(5, 50) if format == "pdf" else None,
            "download_url": f"https://reports.example.com/downloads/{report_id}.{format}",
            "generated_at": datetime.utcnow().isoformat(),
            "expires_at": (datetime.utcnow() + timedelta(days=7)).isoformat(),
            "status": "ready"
        }

    @mcp.tool()
    def calculate_statistics(data_points: list[float], operations: list[str] = None) -> dict:
        """Calculate statistical measures for a set of data points.

        Args:
            data_points: List of numeric values to analyze
            operations: List of operations to perform (mean, median, mode, stdev, variance)

        Returns:
            Dictionary with calculated statistical measures
        """
        from datetime import datetime
        import statistics as stats
        
        if not data_points:
            return {"error": "data_points cannot be empty", "success": False}
        
        if len(data_points) > 10000:
            return {"error": "Maximum 10,000 data points allowed", "success": False}
        
        if operations is None:
            operations = ["mean", "median", "stdev"]
        
        results = {
            "success": True,
            "data_point_count": len(data_points),
            "calculated_at": datetime.utcnow().isoformat()
        }
        
        try:
            if "mean" in operations:
                results["mean"] = round(stats.mean(data_points), 4)
            if "median" in operations:
                results["median"] = round(stats.median(data_points), 4)
            if "mode" in operations and len(data_points) > 1:
                try:
                    results["mode"] = round(stats.mode(data_points), 4)
                except stats.StatisticsError:
                    results["mode"] = None  # No unique mode
            if "stdev" in operations and len(data_points) > 1:
                results["stdev"] = round(stats.stdev(data_points), 4)
            if "variance" in operations and len(data_points) > 1:
                results["variance"] = round(stats.variance(data_points), 4)
            if "min" in operations:
                results["min"] = min(data_points)
            if "max" in operations:
                results["max"] = max(data_points)
            if "range" in operations:
                results["range"] = max(data_points) - min(data_points)
            
            return results
        except Exception as e:
            return {"error": f"Calculation failed: {str(e)}", "success": False}

    return mcp


if __name__ == "__main__":
    port = int(os.environ.get("PORT", PORT_SECURITY_KEYS_SSE))
    server = create_server()
    
    # Use centralized logging for startup
    log_startup(
        logger,
        SERVER_NAME_SECURITY_KEYS_SSE,
        port,
        transport="SSE",
        auth_type="Security Keys",
        accepted_headers="X-GitHub-Token OR X-Brave-Key (EITHER one)"
    )
    
    server.run(transport="sse", port=port, log_level="debug")
