#!/usr/bin/env node
/**
 * Test MCP Server with Authentication
 * Requires TEST_API_KEY environment variable to work
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const API_KEY = process.env.TEST_API_KEY;

// Validate API key on startup
if (!API_KEY) {
  console.error('ERROR: TEST_API_KEY environment variable is required');
  process.exit(1);
}

if (API_KEY !== 'test-secret-key-123') {
  console.error('ERROR: Invalid TEST_API_KEY');
  process.exit(1);
}

const server = new Server(
  {
    name: 'test-auth-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_protected_data',
        description: 'Get protected data that requires authentication',
        inputSchema: {
          type: 'object',
          properties: {
            resource: {
              type: 'string',
              description: 'Resource to fetch',
            },
          },
          required: ['resource'],
        },
      },
      {
        name: 'check_auth_status',
        description: 'Check if authentication is working',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'get_protected_data') {
    const resource = (args as { resource?: string }).resource;
    return {
      content: [
        {
          type: 'text',
          text: `Protected data for resource "${resource}" (authenticated with key: ${API_KEY.substring(0, 8)}...)`,
        },
      ],
    };
  }

  if (name === 'check_auth_status') {
    return {
      content: [
        {
          type: 'text',
          text: `Authentication successful! API_KEY is set to: ${API_KEY.substring(0, 8)}...`,
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Test authenticated MCP server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
