#!/usr/bin/env node
/**
 * HTTP Streamable Test Server with OAuth Client Credentials Authentication
 * Requires valid OAuth access token from oauth-token-server
 */

import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as z from 'zod/v4';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { Request, Response, NextFunction } from 'express';

const PORT = parseInt(process.argv[2] || '3400', 10);
const TOKEN_INTROSPECTION_URL = process.env.TOKEN_INTROSPECTION_URL || 'http://localhost:3300/introspect';

// Create MCP server
const getServer = () => {
  const server = new McpServer(
    {
      name: 'http-oauth-test-server',
      version: '1.0.0',
    },
    { capabilities: { tools: {} } }
  );

  server.registerTool(
    'get_oauth_protected_data',
    {
      description: 'Get protected data that requires OAuth access token',
      inputSchema: {
        resource: z.string().describe('Resource to fetch'),
      },
    },
    async ({ resource }) => {
      return {
        content: [
          {
            type: 'text',
            text: `OAuth protected data for resource "${resource}"`,
          },
        ],
      };
    }
  );

  server.registerTool(
    'check_oauth_status',
    {
      description: 'Check if OAuth authentication is working',
      inputSchema: {},
    },
    async () => {
      return {
        content: [
          {
            type: 'text',
            text: 'OAuth Client Credentials authentication successful!',
          },
        ],
      };
    }
  );

  return server;
};

// OAuth token validation middleware
async function validateOAuthToken(req: Request, res: Response, next: NextFunction): Promise<void> {
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

  // Validate token with introspection endpoint
  try {
    const response = await fetch(TOKEN_INTROSPECTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString(),
    });

    const introspection = await response.json();

    if (!introspection.active) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    // Token is valid, continue
    next();
  } catch (error) {
    console.error('Token validation error:', error);
    res.status(503).json({ error: 'Token validation service unavailable' });
  }
}

const app = createMcpExpressApp();

// Store transports by session ID
const transports: Record<string, StreamableHTTPServerTransport> = {};

// Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', auth: 'oauth' });
});

// MCP POST endpoint with OAuth validation
const mcpPostHandler = async (req: Request, res: Response): Promise<void> => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  try {
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      const server = getServer();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          console.log(`OAuth session initialized: ${newSessionId}`);
          transports[newSessionId] = transport;
        },
      });

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

app.post('/mcp', validateOAuthToken, mcpPostHandler);

// GET for SSE streams
const mcpGetHandler = async (req: Request, res: Response): Promise<void> => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }

  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
};

app.get('/mcp', validateOAuthToken, mcpGetHandler);

// DELETE for session termination
const mcpDeleteHandler = async (req: Request, res: Response): Promise<void> => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }

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

app.delete('/mcp', validateOAuthToken, mcpDeleteHandler);

// Start server
const server = app.listen(PORT, () => {
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : PORT;
  console.log(`HTTP OAuth Test Server listening on port ${actualPort}`);
  console.error(`HTTP_OAUTH_SERVER_READY:${actualPort}`);
  console.error(`HTTP endpoint: http://localhost:${actualPort}/mcp`);
  console.error(`Requires OAuth access token from: ${TOKEN_INTROSPECTION_URL}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.error('\nShutting down HTTP OAuth test server...');

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
