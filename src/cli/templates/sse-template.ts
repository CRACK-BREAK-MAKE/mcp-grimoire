/**
 * SSE Transport Spell Template
 * Server-Sent Events transport for real-time MCP servers
 */

export function sseTemplate(name: string): string {
  const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);
  const today = new Date().toISOString().split('T')[0];

  return `# ${capitalizedName} Spell Configuration
# Generated: ${today}
# Transport: SSE (Server-Sent Events)

name: ${name}
version: 1.0.0
description: |
  Brief description of what this spell does.

  Connects to an SSE endpoint for real-time updates.

keywords:
  - keyword1
  - keyword2
  - keyword3
  - realtime
  - streaming

server:
  transport: sse
  url: http://127.0.0.1:8000/sse
  # Update the URL to point to your SSE endpoint

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

  SSE transport provides real-time streaming capabilities.

  ### Connection:
  - Ensure the SSE server is running before activating this spell
  - Default URL: http://127.0.0.1:8000/sse

  ### Authentication:
  - Bearer Token: Set auth.type to 'bearer' and provide token
  - Environment Variables: Use \${VAR_NAME} syntax to read from environment
  - Custom Headers: Add headers section for additional HTTP headers

  ### Best Practices:
  - Add service-specific guidance here
  - Handle reconnection logic
  - Monitor connection health
  - Never commit bearer tokens directly - use environment variables
`;
}
