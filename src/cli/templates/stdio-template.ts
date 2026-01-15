/**
 * Stdio Transport Spell Template
 * Standard Input/Output transport for MCP servers
 */

export function stdioTemplate(name: string): string {
  const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);
  const today = new Date().toISOString().split('T')[0];

  return `# ${capitalizedName} Spell Configuration
# Generated: ${today}
# Transport: stdio (Standard Input/Output)

name: ${name}
version: 1.0.0
description: |
  Brief description of what this spell does.

  Add details about available tools and capabilities here.

keywords:
  - keyword1
  - keyword2
  - keyword3
  # Add 5-10 relevant keywords for intent matching

server:
  transport: stdio
  command: npx
  args:
    - '-y'
    - '@your-org/mcp-server-package'
  env:
    # Add environment variables here (optional)
    # API_KEY: \${API_KEY}
    # DATABASE_URL: \${DATABASE_URL}

steering: |
  ## ${capitalizedName} - Expert Guidance

  When helping users with this service:

  ### Best Practices:
  - Add important usage guidelines here
  - Security considerations
  - Common patterns and workflows

  ### Tips:
  - Performance optimization tips
  - Error handling guidance
  - User experience recommendations
`;
}
