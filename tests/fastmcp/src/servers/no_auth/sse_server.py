"""System Monitor v1.0 - No Authentication SSE Server.

This server has NO authentication requirements and logs all incoming HTTP headers.
Domain: System Monitor - Track CPU usage, memory stats, and disk space.
Useful for monitoring system resources over SSE transport.
"""

import json
import os
from typing import Any

from fastmcp import FastMCP

from src.common.constants import PORT_NO_AUTH_SSE
from src.common.logging import get_logger, log_startup
from src.common.middleware import add_standard_middleware


# Get module logger
logger = get_logger(__name__)
logger.info("Module loaded! Starting server setup...")


def create_server() -> FastMCP:
    """Create No-Auth SSE server with header logging.

    Returns:
        Configured FastMCP server without authentication
    """
    # Create FastMCP server WITHOUT authentication
    mcp = FastMCP(name="No Auth SSE Server")
    
    # Add standard middleware stack with header logging for debugging
    add_standard_middleware(
        mcp,
        server_prefix="NO_AUTH_SSE",
        enable_structured_logging=True,
        enable_header_logging=True,  # Enable for debugging
        include_payloads=False,
    )

    # Domain: System Monitor
    @mcp.tool()
    def get_cpu_usage(interval_seconds: int = 1) -> dict:
        """Get current CPU usage statistics.

        Args:
            interval_seconds: Measurement interval in seconds (1-60)

        Returns:
            Dictionary with CPU usage percentages and core details
        """
        import random
        from datetime import datetime
        
        if interval_seconds < 1 or interval_seconds > 60:
            return {"error": "Interval must be between 1 and 60 seconds", "success": False}
        
        # Simulate CPU usage
        num_cores = random.choice([4, 6, 8, 12, 16])
        overall_usage = round(random.uniform(10, 85), 2)
        
        core_usage = [round(random.uniform(5, 95), 2) for _ in range(num_cores)]
        
        return {
            "success": True,
            "timestamp": datetime.utcnow().isoformat(),
            "interval_seconds": interval_seconds,
            "cpu_count": num_cores,
            "overall_usage_percent": overall_usage,
            "per_core_usage_percent": core_usage,
            "load_average": {
                "1min": round(random.uniform(1, 8), 2),
                "5min": round(random.uniform(1, 8), 2),
                "15min": round(random.uniform(1, 8), 2)
            },
            "status": "healthy" if overall_usage < 80 else "warning" if overall_usage < 90 else "critical"
        }

    @mcp.tool()
    def get_memory_stats() -> dict:
        """Get current memory (RAM) usage statistics.

        Returns:
            Dictionary with memory usage, available RAM, and swap details
        """
        import random
        from datetime import datetime
        
        # Simulate memory stats (in GB)
        total_gb = random.choice([8, 16, 32, 64])
        used_gb = round(random.uniform(total_gb * 0.3, total_gb * 0.85), 2)
        available_gb = round(total_gb - used_gb, 2)
        percent_used = round((used_gb / total_gb) * 100, 2)
        
        # Swap memory
        swap_total_gb = random.choice([0, 2, 4, 8])
        swap_used_gb = round(random.uniform(0, swap_total_gb * 0.5), 2) if swap_total_gb > 0 else 0
        
        return {
            "success": True,
            "timestamp": datetime.utcnow().isoformat(),
            "memory": {
                "total_gb": total_gb,
                "used_gb": used_gb,
                "available_gb": available_gb,
                "percent_used": percent_used,
                "cached_gb": round(random.uniform(1, 5), 2),
                "buffers_gb": round(random.uniform(0.1, 1), 2)
            },
            "swap": {
                "total_gb": swap_total_gb,
                "used_gb": swap_used_gb,
                "free_gb": round(swap_total_gb - swap_used_gb, 2),
                "percent_used": round((swap_used_gb / swap_total_gb * 100), 2) if swap_total_gb > 0 else 0
            },
            "status": "healthy" if percent_used < 80 else "warning" if percent_used < 90 else "critical"
        }

    @mcp.tool()
    def get_disk_usage(path: str = "/") -> dict:
        """Get disk space usage for a filesystem path.

        Args:
            path: Filesystem path to check (default: root)

        Returns:
            Dictionary with disk space usage and availability
        """
        import random
        from datetime import datetime
        
        # Simulate disk stats (in GB)
        total_gb = random.choice([250, 500, 1000, 2000])
        used_gb = round(random.uniform(total_gb * 0.4, total_gb * 0.85), 2)
        free_gb = round(total_gb - used_gb, 2)
        percent_used = round((used_gb / total_gb) * 100, 2)
        
        return {
            "success": True,
            "timestamp": datetime.utcnow().isoformat(),
            "path": path,
            "filesystem": random.choice(["ext4", "NTFS", "APFS", "btrfs"]),
            "disk": {
                "total_gb": total_gb,
                "used_gb": used_gb,
                "free_gb": free_gb,
                "percent_used": percent_used
            },
            "inodes": {
                "total": random.randint(1000000, 10000000),
                "used": random.randint(100000, 500000),
                "free": random.randint(500000, 9500000)
            },
            "mount_point": path,
            "status": "healthy" if percent_used < 80 else "warning" if percent_used < 90 else "critical",
            "read_only": False
        }

    return mcp


if __name__ == "__main__":
    port = int(os.environ.get("PORT", PORT_NO_AUTH_SSE))
    server = create_server()
    
    # Use centralized logging for startup
    log_startup(
        logger,
        "No Auth SSE Server",
        port,
        authentication="NONE",
        transport="SSE",
        warning="⚠️  This server has NO authentication!"
    )
    logger.info("🔍 All HTTP headers will be logged for debugging")
    
    server.run(transport="sse", port=port, log_level="debug")
