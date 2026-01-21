"""Weather API v2.0 - HTTP Server with API Key Auth.

This server implements API Key authentication via bearer tokens.
Domain: Weather Service - Get forecasts, current conditions, and weather alerts.
Perfect for applications needing real-time weather data.
"""

import os

from fastmcp import FastMCP

from src.common.auth_providers import APIKeyVerifier
from src.common.constants import DEFAULT_API_KEY, PORT_API_KEY_HTTP, SERVER_NAME_API_KEY_HTTP
from src.common.logging import get_logger, log_startup
from src.common.middleware import add_standard_middleware


# Get module logger
logger = get_logger(__name__)


def create_server() -> FastMCP:
    """Create API Key HTTP server.

    Returns:
        Configured FastMCP server with API key auth
    """
    # Get valid API keys from environment or use default
    api_keys_str = os.environ.get("API_KEYS", DEFAULT_API_KEY)
    valid_api_keys = {key.strip() for key in api_keys_str.split(",") if key.strip()}

    # Create API key verifier
    auth = APIKeyVerifier(
        valid_api_keys=valid_api_keys,
        client_id="api-key-http",
        scopes=["read", "write"],
    )

    # Create FastMCP server with authentication
    mcp = FastMCP(name=SERVER_NAME_API_KEY_HTTP, auth=auth)
    
    # Add standard middleware stack
    add_standard_middleware(
        mcp,
        server_prefix="API_KEY_HTTP",
        enable_structured_logging=True,
        enable_header_logging=False,  # Set to True for debugging
    )

    # Domain: Weather Service
    @mcp.tool()
    def get_current_weather(city: str, units: str = "metric") -> dict:
        """Get current weather conditions for a specified city.

        Args:
            city: City name (e.g., "London", "New York", "Tokyo")
            units: Temperature units - "metric" (Celsius) or "imperial" (Fahrenheit)

        Returns:
            Dictionary with current weather data including temperature, conditions, and wind
        """
        import random
        from datetime import datetime
        
        if units not in ["metric", "imperial"]:
            return {"error": "Units must be 'metric' or 'imperial'", "success": False}
        
        temp_base = random.randint(15, 30) if units == "metric" else random.randint(60, 85)
        conditions = ["Clear", "Cloudy", "Partly Cloudy", "Rainy", "Sunny"]
        
        return {
            "success": True,
            "city": city,
            "timestamp": datetime.utcnow().isoformat(),
            "temperature": temp_base,
            "feels_like": temp_base + random.randint(-3, 3),
            "units": "°C" if units == "metric" else "°F",
            "condition": random.choice(conditions),
            "humidity": random.randint(30, 90),
            "wind_speed": round(random.uniform(0, 25), 1),
            "wind_direction": random.choice(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]),
            "pressure": random.randint(980, 1030),
            "visibility": round(random.uniform(5, 15), 1)
        }

    @mcp.tool()
    def get_forecast(city: str, days: int = 5) -> dict:
        """Get weather forecast for upcoming days.

        Args:
            city: City name for the forecast
            days: Number of days to forecast (1-7)

        Returns:
            Dictionary with daily forecasts including high/low temps and conditions
        """
        import random
        from datetime import datetime, timedelta
        
        if days < 1 or days > 7:
            return {"error": "Days must be between 1 and 7", "success": False}
        
        forecast = []
        for i in range(days):
            date = datetime.utcnow() + timedelta(days=i)
            temp_high = random.randint(20, 35)
            temp_low = temp_high - random.randint(5, 15)
            
            forecast.append({
                "date": date.strftime("%Y-%m-%d"),
                "day": date.strftime("%A"),
                "temp_high": temp_high,
                "temp_low": temp_low,
                "condition": random.choice(["Sunny", "Cloudy", "Rainy", "Partly Cloudy"]),
                "precipitation_chance": random.randint(0, 100),
                "wind_speed": round(random.uniform(5, 20), 1),
                "uv_index": random.randint(1, 11)
            })
        
        return {
            "success": True,
            "city": city,
            "forecast_days": days,
            "generated_at": datetime.utcnow().isoformat(),
            "forecast": forecast
        }

    @mcp.tool()
    def get_weather_alerts(city: str) -> dict:
        """Check for active weather alerts and warnings.

        Args:
            city: City name to check for alerts

        Returns:
            Dictionary with active alerts, severity levels, and recommendations
        """
        import random
        from datetime import datetime, timedelta
        
        # Simulate weather alerts (80% chance of no alerts)
        has_alert = random.random() < 0.2
        
        if not has_alert:
            return {
                "success": True,
                "city": city,
                "alerts_count": 0,
                "status": "all_clear",
                "message": "No active weather alerts for this location"
            }
        
        alert_types = ["Thunderstorm Warning", "Heat Advisory", "Wind Advisory", "Flood Watch"]
        severity_levels = ["Minor", "Moderate", "Severe"]
        
        alerts = []
        num_alerts = random.randint(1, 2)
        
        for i in range(num_alerts):
            alerts.append({
                "alert_id": f"alert_{random.randint(10000, 99999)}",
                "type": random.choice(alert_types),
                "severity": random.choice(severity_levels),
                "issued_at": (datetime.utcnow() - timedelta(hours=random.randint(1, 6))).isoformat(),
                "expires_at": (datetime.utcnow() + timedelta(hours=random.randint(6, 24))).isoformat(),
                "description": "Monitor weather conditions and take appropriate precautions"
            })
        
        return {
            "success": True,
            "city": city,
            "alerts_count": len(alerts),
            "status": "active_alerts",
            "alerts": alerts,
            "checked_at": datetime.utcnow().isoformat()
        }

    return mcp


if __name__ == "__main__":
    port = int(os.environ.get("PORT", PORT_API_KEY_HTTP))
    server = create_server()
    
    # Get API keys count for logging
    api_keys_str = os.environ.get("API_KEYS", DEFAULT_API_KEY)
    api_keys_count = len([k for k in api_keys_str.split(",") if k.strip()])
    
    # Use centralized logging for startup
    log_startup(
        logger,
        SERVER_NAME_API_KEY_HTTP,
        port,
        api_keys_count=api_keys_count,
        transport="HTTP"
    )
    
    server.run(transport="http", port=port)
