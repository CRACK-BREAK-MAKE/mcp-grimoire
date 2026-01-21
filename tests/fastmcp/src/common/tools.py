"""Common MCP tools shared across different servers."""

from typing import Any


def get_greeting_tool() -> tuple[str, str, dict[str, Any], str]:
    """Get greeting tool definition.

    Returns:
        Tuple of (name, description, params_schema, return_annotation)
    """
    name = "greet"
    description = "Greet a user by name"
    params_schema = {"name": "string"}
    return_annotation = "string"
    return name, description, params_schema, return_annotation


def greet(name: str) -> str:
    """Greet a user by name.

    Args:
        name: Name of the person to greet

    Returns:
        Greeting message
    """
    return f"Hello, {name}! Welcome to the authenticated MCP server."


def get_echo_tool() -> tuple[str, str, dict[str, Any], str]:
    """Get echo tool definition.

    Returns:
        Tuple of (name, description, params_schema, return_annotation)
    """
    name = "echo"
    description = "Echo back the provided message"
    params_schema = {"message": "string"}
    return_annotation = "string"
    return name, description, params_schema, return_annotation


def echo(message: str) -> str:
    """Echo back the provided message.

    Args:
        message: Message to echo

    Returns:
        The same message
    """
    return f"Echo: {message}"


def get_add_tool() -> tuple[str, str, dict[str, Any], str]:
    """Get add tool definition.

    Returns:
        Tuple of (name, description, params_schema, return_annotation)
    """
    name = "add"
    description = "Add two numbers together"
    params_schema = {"a": "number", "b": "number"}
    return_annotation = "number"
    return name, description, params_schema, return_annotation


def add(a: float, b: float) -> float:
    """Add two numbers together.

    Args:
        a: First number
        b: Second number

    Returns:
        Sum of a and b
    """
    return a + b
