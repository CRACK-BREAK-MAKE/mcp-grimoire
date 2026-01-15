#!/usr/bin/env node
/**
 * OAuth 2.1 Token Server for Testing Client Credentials Flow
 * Provides /token endpoint for exchanging client credentials for access tokens
 */

import express from 'express';

const PORT = parseInt(process.argv[2] || '3300', 10);

// Test credentials
const VALID_CLIENT_ID = 'test-client-id';
const VALID_CLIENT_SECRET = 'test-client-secret';

// In-memory token storage (for testing only)
const issuedTokens = new Map<string, { expiresAt: number; scope?: string }>();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Token endpoint (RFC 6749 Section 3.2)
app.post('/token', (req, res) => {
  console.log('Received token request');

  // Extract client credentials from Authorization header (Basic Auth)
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.status(401).json({
      error: 'invalid_client',
      error_description: 'Client authentication required',
    });
    return;
  }

  // Decode Basic Auth credentials
  const base64Credentials = authHeader.substring(6);
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
  const [clientId, clientSecret] = credentials.split(':');

  // Validate client credentials
  if (clientId !== VALID_CLIENT_ID || clientSecret !== VALID_CLIENT_SECRET) {
    res.status(401).json({
      error: 'invalid_client',
      error_description: 'Invalid client credentials',
    });
    return;
  }

  // Validate grant_type
  const grantType = req.body.grant_type;
  if (grantType !== 'client_credentials') {
    res.status(400).json({
      error: 'unsupported_grant_type',
      error_description: 'Only client_credentials grant type is supported',
    });
    return;
  }

  // Generate access token
  const accessToken = `oauth_token_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const expiresIn = 3600; // 1 hour
  const expiresAt = Date.now() + expiresIn * 1000;

  // Store token
  issuedTokens.set(accessToken, {
    expiresAt,
    scope: req.body.scope,
  });

  // Return token response (RFC 6749 Section 5.1)
  res.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: expiresIn,
    scope: req.body.scope || '',
  });

  console.log(`Issued token: ${accessToken.substring(0, 20)}... (expires in ${expiresIn}s)`);
});

// Token introspection endpoint (RFC 7662) - for validation
app.post('/introspect', (req, res) => {
  const token = req.body.token;

  if (!token) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }

  const tokenInfo = issuedTokens.get(token);

  if (!tokenInfo || Date.now() >= tokenInfo.expiresAt) {
    // Token not found or expired
    res.json({ active: false });
    return;
  }

  // Token is valid
  res.json({
    active: true,
    client_id: VALID_CLIENT_ID,
    token_type: 'Bearer',
    scope: tokenInfo.scope || '',
    exp: Math.floor(tokenInfo.expiresAt / 1000),
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', type: 'oauth-token-server' });
});

// Start server
const server = app.listen(PORT, () => {
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : PORT;
  console.log(`OAuth Token Server listening on port ${actualPort}`);
  console.error(`OAUTH_TOKEN_SERVER_READY:${actualPort}`);
  console.error(`Token endpoint: http://localhost:${actualPort}/token`);
  console.error(`Valid credentials: ${VALID_CLIENT_ID}:${VALID_CLIENT_SECRET}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.error('\nShutting down OAuth token server...');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  server.close(() => {
    process.exit(0);
  });
});
