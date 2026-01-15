#!/usr/bin/env node
/**
 * Simple SSE MCP server for integration testing
 * Implements MCP protocol over Server-Sent Events with 2 test tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';

const app = express();
const PORT = parseInt(process.env.TEST_SSE_PORT || '3001', 10);

// Store active sessions
const sessions = new Map<string, SSEServerTransport>();

// Register tools
function createServer(): Server {
  const server = new Server(
    {
      name: 'test-sse-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, () => {
    return {
      tools: [
        {
          name: 'test_reverse',
          description: 'Reverses a string',
          inputSchema: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: 'Text to reverse',
              },
            },
            required: ['text'],
          },
        },
        {
          name: 'test_uppercase',
          description: 'Converts text to uppercase',
          inputSchema: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: 'Text to convert',
              },
            },
            required: ['text'],
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const params = request.params as { name: string; arguments: Record<string, unknown> };
    const { name: toolName, arguments: args } = params;

    if (toolName === 'test_reverse') {
      const text = args.text as string;
      const reversed = text.split('').reverse().join('');
      return {
        content: [
          {
            type: 'text' as const,
            text: `Reversed: ${reversed}`,
          },
        ],
      };
    }

    if (toolName === 'test_uppercase') {
      const text = args.text as string;
      return {
        content: [
          {
            type: 'text' as const,
            text: `Uppercase: ${text.toUpperCase()}`,
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${toolName}`);
  });

  return server;
}

// SSE endpoint
app.get('/sse', async (req, res) => {
  console.error('SSE connection established');

  const sessionId = Math.random().toString(36).substring(2);
  const transport = new SSEServerTransport('/messages', res);
  sessions.set(sessionId, transport);

  res.setHeader('X-Session-Id', sessionId);

  const server = createServer();
  await server.connect(transport);

  req.on('close', () => {
    sessions.delete(sessionId);
  });
});

// Messages endpoint for client requests
app.post('/messages', express.json(), async (req, res) => {
  const sessionId = req.get('X-Session-Id');
  if (!sessionId) {
    res.status(400).json({ error: 'Missing X-Session-Id header' });
    return;
  }

  const transport = sessions.get(sessionId);
  if (!transport) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  await transport.handlePostMessage(req, res);
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', server: 'test-sse-server' });
});

// Start server
app.listen(PORT, () => {
  console.error(`Test SSE server listening on port ${PORT}`);
  console.log(`SSE_SERVER_READY:${PORT}`);
});
