#!/usr/bin/env node
/**
 * Test HTTP MCP Server with Bearer Token Authentication
 * Used for testing HTTP transport authentication
 *
 * Requires Authorization: Bearer test-token-123 header
 * Returns 401 Unauthorized without valid token
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';

const PORT = parseInt(process.argv[2] || '3333', 10);
const REQUIRED_TOKEN = process.env.TEST_AUTH_TOKEN || 'test-secret-key-123';

// Create MCP server
const mcpServer = new Server(
  {
    name: 'test-http-auth-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List tools handler
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_protected_data',
        description: 'Get protected data that requires Bearer token authentication',
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
      {
        name: 'echo',
        description: 'Echo back a message',
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Message to echo back',
            },
          },
          required: ['message'],
        },
      },
    ],
  };
});

// Call tool handler
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'get_protected_data') {
    const resource = (args as { resource?: string }).resource;
    return {
      content: [
        {
          type: 'text',
          text: `Protected data for resource "${resource}" (authenticated with Bearer token)`,
        },
      ],
    };
  }

  if (name === 'check_auth_status') {
    return {
      content: [
        {
          type: 'text',
          text: 'Authentication successful! Bearer token validated.',
        },
      ],
    };
  }

  if (name === 'echo') {
    const message = (args as { message?: string }).message || '';
    return {
      content: [
        {
          type: 'text',
          text: `Echo: ${message}`,
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

// Authentication middleware
function authenticate(req: IncomingMessage): { ok: boolean; error?: string } {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return { ok: false, error: 'Missing Authorization header' };
  }

  const [type, token] = authHeader.split(' ');

  if (type !== 'Bearer') {
    return { ok: false, error: 'Invalid authorization type. Expected Bearer token' };
  }

  if (token !== REQUIRED_TOKEN) {
    return { ok: false, error: 'Invalid token' };
  }

  return { ok: true };
}

// Create HTTP server
const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  // Health check endpoint (no auth required)
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', auth: 'required' }));
    return;
  }

  // MCP HTTP endpoint (with authentication)
  if (req.url === '/mcp') {
    // Check authentication
    const authResult = authenticate(req);
    if (!authResult.ok) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: authResult.error }));
      return;
    }

    // Handle MCP request
    try {
      const transport = new StreamableHTTPServerTransport('/mcp', req, res);
      await mcpServer.connect(transport);
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
    }
    return;
  }

  // MCP SSE endpoint (with authentication)
  if (req.url === '/sse' || req.url?.startsWith('/sse')) {
    // Check authentication
    const authResult = authenticate(req);
    if (!authResult.ok) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: authResult.error }));
      return;
    }

    // Handle SSE connection
    try {
      const transport = new SSEServerTransport('/sse', res);
      await mcpServer.connect(transport);
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
    }
    return;
  }

  // 404 for other paths
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Start server
server.listen(PORT, () => {
  console.log(`HTTP Auth MCP Server listening on port ${PORT}`);
  console.error(`Test HTTP authenticated MCP server running on http://localhost:${PORT}`);
  console.error(`MCP endpoint: http://localhost:${PORT}/mcp`);
  console.error(`SSE endpoint: http://localhost:${PORT}/sse`);
  console.error(`Required header: Authorization: Bearer ${REQUIRED_TOKEN}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.error('\nShutting down HTTP auth test server...');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  server.close(() => {
    process.exit(0);
  });
});
