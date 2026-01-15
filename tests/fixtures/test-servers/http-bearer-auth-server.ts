#!/usr/bin/env node
/**
 * HTTP Streamable Test Server with Bearer Token Authentication
 * Based on SDK simpleStreamableHttp.js example
 *
 * Requires Authorization: Bearer <token> header
 * Returns 401 Unauthorized without valid token
 */

import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as z from 'zod/v4';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { Request, Response, NextFunction } from 'express';

const PORT = parseInt(process.argv[2] || '3200', 10);
const REQUIRED_TOKEN = process.env.TEST_AUTH_TOKEN || 'test-bearer-token-123';

// Create MCP server
const getServer = () => {
  const server = new McpServer(
    {
      name: 'http-bearer-auth-test-server',
      version: '1.0.0',
    },
    { capabilities: { tools: {} } }
  );

  server.registerTool(
    'get_protected_data',
    {
      description: 'Get protected data that requires Bearer token authentication',
      inputSchema: {
        resource: z.string().describe('Resource to fetch'),
      },
    },
    async ({ resource }) => {
      return {
        content: [
          {
            type: 'text',
            text: `Protected data for resource "${resource}" (authenticated via HTTP with Bearer token)`,
          },
        ],
      };
    }
  );

  server.registerTool(
    'check_auth_status',
    {
      description: 'Check if authentication is working',
      inputSchema: {},
    },
    async () => {
      return {
        content: [
          {
            type: 'text',
            text: 'HTTP Authentication successful! Bearer token validated.',
          },
        ],
      };
    }
  );

  server.registerTool(
    'echo',
    {
      description: 'Echo back a message',
      inputSchema: {
        message: z.string().describe('Message to echo back'),
      },
    },
    async ({ message }) => {
      return {
        content: [
          {
            type: 'text',
            text: `Echo: ${message}`,
          },
        ],
      };
    }
  );

  return server;
};

// Authentication middleware
function authenticateBearer(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }

  const [type, token] = authHeader.split(' ');

  if (type !== 'Bearer') {
    res.status(401).json({ error: 'Invalid authorization type. Expected Bearer token' });
    return;
  }

  if (token !== REQUIRED_TOKEN) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  next();
}

const app = createMcpExpressApp();

// Store transports by session ID
const transports: Record<string, StreamableHTTPServerTransport> = {};

// Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', auth: 'required' });
});

// MCP POST endpoint with authentication
const mcpPostHandler = async (req: Request, res: Response): Promise<void> => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (sessionId) {
    console.log(`Received MCP request for session: ${sessionId}`);
  } else {
    console.log('Request body:', req.body);
    console.log('Is initialize request:', isInitializeRequest(req.body));
  }

  try {
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      // Reuse existing transport
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // New initialization request
      const server = getServer();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          console.log(`Session initialized with ID: ${newSessionId}`);
          transports[newSessionId] = transport;
        },
      });

      // Connect server to transport
      await server.connect(transport);

      transport.onclose = () => {
        if (transport.sessionId) {
          delete transports[transport.sessionId];
        }
      };

      // Handle the initialization request
      await transport.handleRequest(req, res, req.body);
      return; // Already handled
    } else {
      res.status(400).json({ error: 'Invalid request' });
      return;
    }

    // Handle the request with existing transport
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling request:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

// Apply auth middleware to MCP endpoint
app.post('/mcp', authenticateBearer, mcpPostHandler);

// Handle GET requests for SSE streams (with auth)
const mcpGetHandler = async (req: Request, res: Response): Promise<void> => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }

  console.log(`Establishing SSE stream for session ${sessionId}`);

  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
};

app.get('/mcp', authenticateBearer, mcpGetHandler);

// Handle DELETE requests for session termination (with auth)
const mcpDeleteHandler = async (req: Request, res: Response): Promise<void> => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }

  console.log(`Received session termination request for session ${sessionId}`);

  try {
    const transport = transports[sessionId];
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling session termination:', error);
    if (!res.headersSent) {
      res.status(500).send('Error processing session termination');
    }
  }
};

app.delete('/mcp', authenticateBearer, mcpDeleteHandler);

// Start server
const server = app.listen(PORT, () => {
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : PORT;
  console.log(`HTTP Bearer Auth Test Server listening on port ${actualPort}`);
  console.error(`HTTP_BEARER_SERVER_READY:${actualPort}`);
  console.error(`HTTP endpoint: http://localhost:${actualPort}/mcp`);
  console.error(`Required header: Authorization: Bearer ${REQUIRED_TOKEN}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.error('\nShutting down HTTP auth test server...');

  // Close all transports
  for (const sessionId in transports) {
    try {
      await transports[sessionId].close();
      delete transports[sessionId];
    } catch (error) {
      console.error(`Error closing transport ${sessionId}:`, error);
    }
  }

  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  server.close(() => {
    process.exit(0);
  });
});
