"""File Storage Service v1.0 - SSE Server with Basic Auth.

This server implements HTTP Basic Authentication over SSE transport.
Domain: File Storage - Upload, download, organize, and manage files.
Perfect for file management and cloud storage workflows.
"""

import os

from fastmcp import FastMCP

from src.common.auth_providers import BasicAuthTokenVerifier
from src.common.constants import (
    DEFAULT_PASSWORD,
    DEFAULT_SSE_PORT,
    DEFAULT_USERNAME,
    SERVER_NAME_BASIC_SSE,
)
from src.common.logging import get_logger, log_startup
from src.common.middleware import add_standard_middleware


# Get module logger
logger = get_logger(__name__)


def create_server() -> FastMCP:
    """Create Basic Auth SSE server.

    Returns:
        Configured FastMCP server with basic auth
    """
    username = os.environ.get("AUTH_USERNAME", DEFAULT_USERNAME)
    password = os.environ.get("AUTH_PASSWORD", DEFAULT_PASSWORD)

    # Additional credentials for testing special characters
    additional_creds = [
        ("admin", 'P@$$w0rd!#&*()[]{}|\\/<>?,.:;"\'\'`~+=-%^'),  # Special chars test
    ]

    # Create basic auth verifier with multiple credentials
    auth = BasicAuthTokenVerifier(
        username=username,
        password=password,
        client_id="basic-auth-sse",
        scopes=["read", "write"],
        additional_credentials=additional_creds,
    )

    # Create FastMCP server with authentication
    mcp = FastMCP(name=SERVER_NAME_BASIC_SSE, auth=auth)
    
    # Add standard middleware stack
    add_standard_middleware(
        mcp,
        server_prefix="BASIC_AUTH_SSE",
        enable_structured_logging=True,
        enable_header_logging=False,  # Set to True for debugging
    )

    # Domain: File Storage
    @mcp.tool()
    def upload_file(filename: str, size_mb: float, folder: str = "/") -> dict:
        """Upload a file to cloud storage with metadata.

        Args:
            filename: Name of the file to upload
            size_mb: File size in megabytes
            folder: Destination folder path (default: root "/")

        Returns:
            Dictionary with upload status, file ID, and storage details
        """
        import uuid
        from datetime import datetime
        
        if size_mb <= 0 or size_mb > 5000:  # Max 5GB
            return {"error": "File size must be between 0 and 5000 MB", "success": False}
        
        file_id = str(uuid.uuid4())
        return {
            "success": True,
            "file_id": file_id,
            "filename": filename,
            "size_mb": size_mb,
            "folder": folder,
            "uploaded_at": datetime.utcnow().isoformat(),
            "storage_location": f"s3://my-bucket{folder}{filename}",
            "url": f"https://storage.example.com{folder}{filename}",
            "checksum": f"md5:{uuid.uuid4().hex[:32]}",
            "mime_type": filename.split(".")[-1] if "." in filename else "application/octet-stream"
        }

    @mcp.tool()
    def list_files(folder: str = "/", sort_by: str = "name") -> dict:
        """List all files in a specific folder with sorting options.

        Args:
            folder: Folder path to list files from (default: root "/")
            sort_by: Sort criterion (name, size, date) 

        Returns:
            Dictionary with list of files and folder metadata
        """
        from datetime import datetime, timedelta
        import random
        
        valid_sort = ["name", "size", "date"]
        if sort_by not in valid_sort:
            return {"error": f"sort_by must be one of: {', '.join(valid_sort)}", "success": False}
        
        # Simulate file list
        file_types = ["document.pdf", "image.png", "video.mp4", "data.csv", "report.docx"]
        num_files = random.randint(3, 10)
        
        files = []
        for i in range(num_files):
            files.append({
                "file_id": f"file_{i}_{random.randint(1000, 9999)}",
                "filename": f"{random.choice(['Report', 'Image', 'Video', 'Data'])}_{i}.{random.choice(['pdf', 'png', 'mp4', 'csv'])}",
                "size_mb": round(random.uniform(0.1, 500), 2),
                "uploaded_at": (datetime.utcnow() - timedelta(days=random.randint(1, 90))).isoformat(),
                "folder": folder
            })
        
        return {
            "success": True,
            "folder": folder,
            "file_count": len(files),
            "total_size_mb": round(sum(f["size_mb"] for f in files), 2),
            "sort_by": sort_by,
            "files": files
        }

    @mcp.tool()
    def delete_file(file_id: str, permanent: bool = False) -> dict:
        """Delete or move a file to trash.

        Args:
            file_id: Unique identifier of the file to delete
            permanent: If True, permanently delete; if False, move to trash

        Returns:
            Dictionary with deletion status and details
        """
        from datetime import datetime
        
        return {
            "success": True,
            "file_id": file_id,
            "deleted_at": datetime.utcnow().isoformat(),
            "deletion_type": "permanent" if permanent else "trash",
            "recoverable": not permanent,
            "recovery_window_days": 0 if permanent else 30,
            "message": f"File {'permanently deleted' if permanent else 'moved to trash'}"
        }

    return mcp


if __name__ == "__main__":
    port = int(os.environ.get("PORT", DEFAULT_SSE_PORT))
    server = create_server()
    
    username = os.environ.get("AUTH_USERNAME", DEFAULT_USERNAME)
    
    # Use centralized logging for startup
    log_startup(
        logger,
        SERVER_NAME_BASIC_SSE,
        port,
        username=username,
        transport="SSE",
        auth_type="Basic Auth"
    )
    
    server.run(transport="sse", port=port, log_level="debug")
