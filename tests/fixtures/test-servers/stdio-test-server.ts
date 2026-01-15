#!/usr/bin/env node
/**
 * Simple stdio MCP server for integration testing
 * Implements MCP protocol with 2 test tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  {
    name: 'test-stdio-server',
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
        name: 'test_echo',
        description: 'Echoes back the input message',
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Message to echo',
            },
          },
          required: ['message'],
        },
      },
      {
        name: 'test_add',
        description: 'Adds two numbers together',
        inputSchema: {
          type: 'object',
          properties: {
            a: {
              type: 'number',
              description: 'First number',
            },
            b: {
              type: 'number',
              description: 'Second number',
            },
          },
          required: ['a', 'b'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const params = request.params as { name: string; arguments: any };
  const { name: toolName, arguments: args } = params;

  if (toolName === 'test_echo') {
    return {
      content: [
        {
          type: 'text',
          text: `Echo: ${args.message}`,
        },
      ],
    };
  }

  if (toolName === 'test_add') {
    const sum = args.a + args.b;
    return {
      content: [
        {
          type: 'text',
          text: `Sum: ${sum}`,
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${toolName}`);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Test stdio server ready');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
