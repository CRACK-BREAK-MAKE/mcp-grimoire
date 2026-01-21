"""Calculator & Utilities v1.0 - No Authentication HTTP Server.

This server has NO authentication requirements and logs all incoming HTTP headers.
Domain: Calculator & Utilities - Perform calculations, unit conversions, and random generation.
Useful for testing and utility operations.
"""

import json
import os
from typing import Any

from fastmcp import FastMCP

from src.common.constants import SERVER_NAME_NO_AUTH_HTTP, PORT_NO_AUTH_HTTP
from src.common.logging import get_logger, log_startup
from src.common.middleware import add_standard_middleware


# Get module logger
logger = get_logger(__name__)
logger.info("Module loaded! Starting server setup...")


def create_server() -> FastMCP:
    """Create No-Auth HTTP server with header logging.

    Returns:
        Configured FastMCP server without authentication
    """
    # Create FastMCP server WITHOUT authentication
    mcp = FastMCP(name="No Auth HTTP Server")
    
    # Add standard middleware stack with header logging
    add_standard_middleware(
        mcp,
        server_prefix="NO_AUTH_HTTP",
        enable_structured_logging=True,
        enable_header_logging=True,  # Enable for debugging
    )

    # Domain: Calculator & Utilities
    @mcp.tool()
    def calculate(expression: str) -> dict:
        """Evaluate a mathematical expression safely.

        Args:
            expression: Mathematical expression (e.g., "2 + 2", "sqrt(16)", "sin(pi/2)")

        Returns:
            Dictionary with calculation result and details
        """
        import math
        import re
        
        try:
            # Security: Only allow safe math operations
            allowed_names = {
                k: v for k, v in math.__dict__.items() if not k.startswith("__")
            }
            allowed_names.update({"abs": abs, "round": round})
            
            # Remove any potentially dangerous characters
            if re.search(r'[^0-9+\-*/().\s,a-z_]', expression, re.IGNORECASE):
                return {
                    "error": "Expression contains invalid characters",
                    "success": False
                }
            
            # Evaluate the expression
            result = eval(expression, {"__builtins__": {}}, allowed_names)
            
            return {
                "success": True,
                "expression": expression,
                "result": result,
                "result_type": type(result).__name__,
                "formatted": f"{result:,.6f}" if isinstance(result, float) else str(result)
            }
        except Exception as e:
            return {
                "error": str(e),
                "expression": expression,
                "success": False
            }

    @mcp.tool()
    def convert_units(value: float, from_unit: str, to_unit: str) -> dict:
        """Convert between different units of measurement.

        Args:
            value: Numeric value to convert
            from_unit: Source unit (m, km, mi, kg, lb, c, f, etc.)
            to_unit: Target unit

        Returns:
            Dictionary with converted value and conversion details
        """
        # Define conversion factors (all to base unit)
        conversions = {
            # Length (meters)
            "m": 1.0, "km": 1000.0, "mi": 1609.34, "ft": 0.3048, "in": 0.0254,
            # Weight (kilograms)
            "kg": 1.0, "g": 0.001, "lb": 0.453592, "oz": 0.0283495,
            # Temperature (special handling)
            "c": None, "f": None, "k": None,
        }
        
        from_unit = from_unit.lower()
        to_unit = to_unit.lower()
        
        # Temperature conversions (special case)
        if from_unit in ["c", "f", "k"] or to_unit in ["c", "f", "k"]:
            # Convert to Celsius first
            if from_unit == "f":
                celsius = (value - 32) * 5/9
            elif from_unit == "k":
                celsius = value - 273.15
            else:
                celsius = value
            
            # Convert from Celsius to target
            if to_unit == "f":
                result = (celsius * 9/5) + 32
            elif to_unit == "k":
                result = celsius + 273.15
            else:
                result = celsius
        else:
            # Check if units are valid and in same category
            if from_unit not in conversions or to_unit not in conversions:
                return {"error": f"Unknown unit: {from_unit} or {to_unit}", "success": False}
            
            # Convert: value → base unit → target unit
            base_value = value * conversions[from_unit]
            result = base_value / conversions[to_unit]
        
        return {
            "success": True,
            "original_value": value,
            "original_unit": from_unit,
            "converted_value": round(result, 6),
            "converted_unit": to_unit,
            "formatted": f"{value} {from_unit} = {round(result, 4)} {to_unit}"
        }

    @mcp.tool()
    def generate_random(type: str = "number", count: int = 1, min: int = 0, max: int = 100) -> dict:
        """Generate random data (numbers, UUIDs, passwords).

        Args:
            type: Type of random data (number, uuid, password, hex)
            count: Number of items to generate (1-100)
            min: Minimum value for numbers (default: 0)
            max: Maximum value for numbers (default: 100)

        Returns:
            Dictionary with generated random data
        """
        import random
        import uuid
        import string
        
        if count < 1 or count > 100:
            return {"error": "Count must be between 1 and 100", "success": False}
        
        results = []
        
        if type == "number":
            results = [random.randint(min, max) for _ in range(count)]
        elif type == "uuid":
            results = [str(uuid.uuid4()) for _ in range(count)]
        elif type == "password":
            chars = string.ascii_letters + string.digits + "!@#$%^&*"
            results = [''.join(random.choices(chars, k=16)) for _ in range(count)]
        elif type == "hex":
            results = [uuid.uuid4().hex for _ in range(count)]
        else:
            return {"error": f"Invalid type. Must be: number, uuid, password, hex", "success": False}
        
        return {
            "success": True,
            "type": type,
            "count": count,
            "results": results
        }

    return mcp


if __name__ == "__main__":
    port = int(os.environ.get("PORT", PORT_NO_AUTH_HTTP))
    server = create_server()
    
    # Use centralized logging for startup
    log_startup(
        logger,
        "No Auth HTTP Server",
        port,
        authentication="NONE",
        transport="HTTP",
        warning="⚠️  This server has NO authentication!"
    )
    logger.info("🔍 All HTTP headers will be logged for debugging")
    
    server.run(transport="http", port=port, log_level="debug")
