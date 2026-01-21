"""Project Manager v1.0 - HTTP Server with Basic Auth.

This server implements HTTP Basic Authentication using username/password.
Domain: Project Management - Create tasks, manage projects, track deadlines.
Perfect for team collaboration and project tracking workflows.
"""

import os

from fastmcp import FastMCP

from src.common.auth_providers import BasicAuthTokenVerifier
from src.common.constants import (
    DEFAULT_HTTP_PORT,
    DEFAULT_PASSWORD,
    DEFAULT_USERNAME,
    SERVER_NAME_BASIC_HTTP,
)
from src.common.logging import get_logger, log_startup
from src.common.middleware import add_standard_middleware


# Get module logger
logger = get_logger(__name__)
logger.info("Module loaded! Starting server setup...")


def create_server() -> FastMCP:
    """Create Basic Auth HTTP server.

    Returns:
        Configured FastMCP server with basic auth
    """
    username = os.environ.get("AUTH_USERNAME", DEFAULT_USERNAME)
    password = os.environ.get("AUTH_PASSWORD", DEFAULT_PASSWORD)

    # Create basic auth verifier
    auth = BasicAuthTokenVerifier(
        username=username,
        password=password,
        client_id="basic-auth-http",
        scopes=["read", "write"],
    )

    # Create FastMCP server with authentication
    mcp = FastMCP(name=SERVER_NAME_BASIC_HTTP, auth=auth)
    
    # Add standard middleware stack
    add_standard_middleware(
        mcp,
        server_prefix="BASIC_AUTH_HTTP",
        enable_structured_logging=True,
        enable_header_logging=False,  # Set to True for debugging
    )

    # Domain: Project Management
    @mcp.tool()
    def create_project(name: str, description: str, deadline: str, priority: str = "medium") -> dict:
        """Create a new project with tasks and milestones.

        Args:
            name: Project name
            description: Detailed project description
            deadline: Deadline in YYYY-MM-DD format
            priority: Priority level (low, medium, high, critical)

        Returns:
            Dictionary with created project details and ID
        """
        import uuid
        from datetime import datetime
        
        valid_priorities = ["low", "medium", "high", "critical"]
        if priority not in valid_priorities:
            return {"error": f"Priority must be one of: {', '.join(valid_priorities)}", "success": False}
        
        try:
            datetime.strptime(deadline, "%Y-%m-%d")
        except ValueError:
            return {"error": "Invalid deadline format. Use YYYY-MM-DD", "success": False}
        
        project_id = str(uuid.uuid4())
        return {
            "success": True,
            "project_id": project_id,
            "name": name,
            "description": description,
            "deadline": deadline,
            "priority": priority,
            "status": "active",
            "created_at": datetime.utcnow().isoformat(),
            "team_members": [],
            "completion_percentage": 0,
            "estimated_hours": 0
        }

    @mcp.tool()
    def add_task(project_id: str, title: str, assignee: str, due_date: str) -> dict:
        """Add a new task to an existing project.

        Args:
            project_id: ID of the project to add task to
            title: Task title/description
            assignee: Person assigned to the task
            due_date: Task due date in YYYY-MM-DD format

        Returns:
            Dictionary with task details and status
        """
        import uuid
        from datetime import datetime
        
        try:
            datetime.strptime(due_date, "%Y-%m-%d")
        except ValueError:
            return {"error": "Invalid due_date format. Use YYYY-MM-DD", "success": False}
        
        task_id = str(uuid.uuid4())
        return {
            "success": True,
            "task_id": task_id,
            "project_id": project_id,
            "title": title,
            "assignee": assignee,
            "due_date": due_date,
            "status": "todo",
            "created_at": datetime.utcnow().isoformat(),
            "priority": "medium",
            "estimated_hours": 0,
            "comments": []
        }

    @mcp.tool()
    def get_project_status(project_id: str) -> dict:
        """Get comprehensive status report for a project including tasks and progress.

        Args:
            project_id: ID of the project to check

        Returns:
            Dictionary with project status, tasks, and completion metrics
        """
        from datetime import datetime, timedelta
        import random
        
        # Simulate project status
        total_tasks = random.randint(5, 20)
        completed = random.randint(0, total_tasks)
        in_progress = random.randint(0, total_tasks - completed)
        todo = total_tasks - completed - in_progress
        
        return {
            "project_id": project_id,
            "name": f"Project {project_id[:8]}",
            "status": "active",
            "deadline": (datetime.utcnow() + timedelta(days=random.randint(7, 90))).strftime("%Y-%m-%d"),
            "completion_percentage": round((completed / total_tasks) * 100, 1) if total_tasks > 0 else 0,
            "tasks": {
                "total": total_tasks,
                "completed": completed,
                "in_progress": in_progress,
                "todo": todo
            },
            "team_members": random.randint(2, 10),
            "recent_activity": "Task 'Implement login' completed 2 hours ago",
            "next_milestone": (datetime.utcnow() + timedelta(days=random.randint(1, 30))).strftime("%Y-%m-%d")
        }

    return mcp


if __name__ == "__main__":
    port = int(os.environ.get("PORT", DEFAULT_HTTP_PORT))
    server = create_server()
    
    username = os.environ.get("AUTH_USERNAME", DEFAULT_USERNAME)
    
    # Use centralized logging for startup
    log_startup(
        logger,
        SERVER_NAME_BASIC_HTTP,
        port,
        username=username,
        transport="HTTP",
        auth_type="Basic Auth"
    )
    
    server.run(transport="http", port=port)
