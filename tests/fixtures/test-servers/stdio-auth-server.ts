#!/usr/bin/env node
/**
 * Simple stdio MCP server for authentication testing
 * Checks environment variables and returns authentication status
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

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

// Register tools
server.setRequestHandler(ListToolsRequestSchema, () => {
  return {
    tools: [
      {
        name: 'check_auth',
        description: 'Checks if API credentials are present in environment',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_env_value',
        description: 'Gets a specific environment variable value (for testing)',
        inputSchema: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'Environment variable key',
            },
          },
          required: ['key'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const params = request.params as { name: string; arguments: Record<string, unknown> };
  const { name: toolName, arguments: args } = params;

  if (toolName === 'check_auth') {
    const hasApiKey = !!process.env.API_KEY;
    const hasApiSecret = !!process.env.API_SECRET;
    const authenticated = hasApiKey && hasApiSecret;

    return {
      content: [
        {
          type: 'text' as const,
          text: `Authenticated: ${authenticated}\nAPI_KEY present: ${hasApiKey}\nAPI_SECRET present: ${hasApiSecret}`,
        },
      ],
    };
  }

  if (toolName === 'get_env_value') {
    const key = args.key as string;
    const value = process.env[key];

    return {
      content: [
        {
          type: 'text' as const,
          text: value ? `${key}: ${value}` : `${key}: not set`,
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${toolName}`);
});

// Connect via stdio
const transport = new StdioServerTransport();
server.connect(transport).catch((error: unknown) => {
  console.error('Failed to start test auth server:', error);
  process.exit(1);
});

console.error('Test auth server ready');
