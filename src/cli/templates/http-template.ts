/**
 * HTTP Transport Spell Template
 * Streamable HTTP transport for REST-like MCP servers
 */

export function httpTemplate(name: string): string {
  const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);
  const today = new Date().toISOString().split('T')[0];

  return `# ${capitalizedName} Spell Configuration
# Generated: ${today}
# Transport: HTTP (Streamable HTTP)

name: ${name}
version: 1.0.0
description: |
  Brief description of what this spell does.

  Connects to an HTTP/HTTPS endpoint.

keywords:
  - keyword1
  - keyword2
  - keyword3
  - api
  - rest

server:
  transport: http
  url: http://0.0.0.0:7777/mcp
  # Update the URL to point to your HTTP endpoint

  # Authentication (optional)
  # Uncomment and configure if server requires authentication
  # auth:
  #   type: bearer
  #   token: \${API_TOKEN}  # Use \${VAR} to read from environment

  # Custom Headers (optional)
  # headers:
  #   X-Custom-Header: value
  #   X-API-Version: v1

steering: |
  ## ${capitalizedName} - Expert Guidance

  HTTP transport for standard REST-like interactions.

  ### Endpoint:
  - Default URL: http://0.0.0.0:7777/mcp
  - Supports both HTTP and HTTPS

  ### Authentication:
  - Bearer Token: Set auth.type to 'bearer' and provide token
  - Environment Variables: Use \${VAR_NAME} syntax to read from environment
  - Custom Headers: Add headers section for additional HTTP headers

  ### Best Practices:
  - Add service-specific guidance here
  - Handle timeouts appropriately
  - Implement retry logic for failed requests
  - Never commit bearer tokens directly - use environment variables
`;
}
