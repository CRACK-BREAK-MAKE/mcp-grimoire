#!/usr/bin/env node
/**
 * Simple HTTP (Streamable HTTP) MCP server for integration testing
 * Implements MCP protocol over HTTP with 2 test tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';

const app = express();
const PORT = parseInt(process.env.TEST_HTTP_PORT || '3002', 10);

// Create server with tools
const server = new Server(
  {
    name: 'test-http-server',
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
        name: 'test_multiply',
        description: 'Multiplies two numbers',
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
      {
        name: 'test_greet',
        description: 'Greets a person by name',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the person',
            },
          },
          required: ['name'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const params = request.params as { name: string; arguments: Record<string, unknown> };
  const { name: toolName, arguments: args } = params;

  if (toolName === 'test_multiply') {
    const a = args.a as number;
    const b = args.b as number;
    const product = a * b;
    return {
      content: [
        {
          type: 'text' as const,
          text: `Product: ${product}`,
        },
      ],
    };
  }

  if (toolName === 'test_greet') {
    const name = args.name as string;
    return {
      content: [
        {
          type: 'text' as const,
          text: `Hello, ${name}!`,
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${toolName}`);
});

// HTTP/MCP endpoint
app.post('/mcp', express.json(), async (req, res) => {
  // @ts-ignore
  const transport = new StreamableHTTPServerTransport(req, res);
  await server.connect(transport);
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', server: 'test-http-server' });
});

// Start server
app.listen(PORT, () => {
  console.error(`Test HTTP server listening on port ${PORT}`);
  console.log(`HTTP_SERVER_READY:${PORT}`);
});
