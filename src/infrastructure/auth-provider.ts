/**
 * Authentication Provider for HTTP/SSE Transports
 * Handles Bearer token authentication and environment variable expansion
 *
 * See ADR-0012 for Bearer token authentication strategy
 * See ADR-0013 for environment variable expansion
 * See ADR-0014 for OAuth Client Credentials
 *
 * @module infrastructure/auth-provider
 */

import type { AuthConfig } from '../core/types.js';
import { logger } from '../utils/logger.js';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import {
  ClientCredentialsProvider,
  PrivateKeyJwtProvider,
  StaticPrivateKeyJwtProvider,
} from '@modelcontextprotocol/sdk/client/auth-extensions.js';

/**
 * Build authentication headers for HTTP/SSE requests
 *
 * Supports:
 * - Bearer token authentication (Phase 1)
 * - Custom headers
 * - Environment variable expansion via ${VAR} syntax
 *
 * @param customHeaders - Custom HTTP headers to include
 * @param auth - Authentication configuration
 * @returns Headers object with authentication and custom headers
 *
 * @example
 * ```typescript
 * const headers = buildAuthHeaders(
 *   { 'X-Custom': 'value' },
 *   { type: 'bearer', token: '${API_KEY}' }
 * );
 * // Returns: { 'X-Custom': 'value', 'Authorization': 'Bearer <expanded-token>' }
 * ```
 */
export function buildAuthHeaders(
  customHeaders?: Record<string, string>,
  auth?: AuthConfig
): Record<string, string> {
  const headers: Record<string, string> = { ...customHeaders };

  // Bearer token authentication
  if (auth?.type === 'bearer' && auth.token !== undefined) {
    const expandedToken = expandEnvVar(auth.token);
    headers['Authorization'] = `Bearer ${expandedToken}`;
    if (!expandedToken) {
      logger.warn('AUTH', 'Bearer token expanded to empty string - check environment variables');
    }
  }

  // Basic Authentication (username + password)
  if (auth?.type === 'basic') {
    if (
      auth.username == null ||
      auth.username === '' ||
      auth.password == null ||
      auth.password === ''
    ) {
      logger.warn('AUTH', 'Basic Auth requires both username and password');
      return headers;
    }

    const expandedUsername = expandEnvVar(auth.username);
    const expandedPassword = expandEnvVar(auth.password);

    if (!expandedUsername || !expandedPassword) {
      logger.warn(
        'AUTH',
        'Basic Auth credentials expanded to empty string - check environment variables'
      );
      return headers;
    }

    const credentials = Buffer.from(`${expandedUsername}:${expandedPassword}`).toString('base64');

    // WORKAROUND for FastMCP limitation:
    // FastMCP framework only supports Bearer tokens, not standard HTTP Basic Auth
    // So we send the base64-encoded credentials as a Bearer token
    // Real MCP servers should implement proper Basic Auth, but FastMCP can't
    // TODO: Once MCP spec clarifies auth methods, we may need to adjust this
    headers['Authorization'] = `Bearer ${credentials}`;

    logger.info('AUTH', 'Built Basic Auth as Bearer token (FastMCP compatibility)', {
      username: expandedUsername,
      credentialsBase64: credentials,
      note: 'Sending as Bearer token due to FastMCP limitation',
      authorizationHeader: headers['Authorization'],
      decodedForVerification: Buffer.from(credentials, 'base64').toString('utf-8'),
    });
  }

  // Phase 2 & 3: OAuth will be handled by authProvider, not headers
  // (OAuth tokens obtained dynamically, not from config)

  return headers;
}

/**
 * Expand environment variable references in a string
 *
 * Replaces ${VAR_NAME} with process.env.VAR_NAME
 * Returns empty string for undefined variables
 *
 * @param value - String potentially containing ${VAR} references
 * @returns String with all ${VAR} references expanded
 *
 * @example
 * ```typescript
 * process.env.API_KEY = 'secret123';
 * expandEnvVar('token:${API_KEY}'); // Returns: 'token:secret123'
 * expandEnvVar('${UNDEFINED}');     // Returns: ''
 * expandEnvVar('literal');          // Returns: 'literal'
 * ```
 */
export function expandEnvVar(value: string): string {
  // Match ${VAR_NAME} pattern where VAR_NAME contains only alphanumeric and underscore
  // This prevents matching nested braces like ${TEST${INNER}}
  return value.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/gi, (_, varName: string) => {
    const envValue = process.env[varName];
    if (envValue === undefined) {
      logger.warn('AUTH', `Environment variable ${varName} is not defined`);
      return '';
    }
    return envValue;
  });
}

/**
 * Create OAuth authentication provider for MCP SDK
 *
 * Supports:
 * - OAuth 2.1 Client Credentials (machine-to-machine)
 * - Private Key JWT (RFC 7523 Section 2.2)
 * - Static Private Key JWT (pre-built JWT assertion)
 * - Bearer tokens (handled via buildAuthHeaders)
 *
 * @param auth - Authentication configuration
 * @returns MCP SDK OAuthClientProvider instance or undefined
 *
 * @example
 * ```typescript
 * // OAuth Client Credentials
 * const provider = createAuthProvider({
 *   type: 'client_credentials',
 *   clientId: 'my-client',
 *   clientSecret: '${OAUTH_SECRET}',
 *   tokenUrl: 'https://oauth.example.com/token'
 * });
 *
 * // Private Key JWT
 * const provider = createAuthProvider({
 *   type: 'private_key_jwt',
 *   clientId: 'my-client',
 *   privateKey: '${PRIVATE_KEY_PEM}',
 *   algorithm: 'RS256'
 * });
 *
 * // Static Private Key JWT (pre-built assertion)
 * const provider = createAuthProvider({
 *   type: 'static_private_key_jwt',
 *   clientId: 'my-client',
 *   jwtBearerAssertion: '${PRE_BUILT_JWT}'
 * });
 * ```
 */
export function createAuthProvider(auth?: AuthConfig): OAuthClientProvider | undefined {
  // OAuth 2.1 Client Credentials with client_secret_basic
  if (auth?.type === 'client_credentials') {
    if (
      auth.clientId == null ||
      auth.clientId.trim() === '' ||
      auth.clientSecret == null ||
      auth.clientSecret.trim() === ''
    ) {
      logger.error('AUTH', 'client_credentials requires clientId and clientSecret');
      return undefined;
    }

    // Expand environment variables in credentials
    const clientId = expandEnvVar(auth.clientId);
    const clientSecret = expandEnvVar(auth.clientSecret);

    if (!clientId || !clientSecret) {
      logger.error('AUTH', 'client_credentials expanded to empty string - check environment');
      return undefined;
    }

    logger.info('AUTH', 'Creating OAuth Client Credentials Provider', {
      clientId: clientId.substring(0, 8) + '...',
    });

    return new ClientCredentialsProvider({
      clientId,
      clientSecret,
      clientName: 'mcp-grimoire-client',
    });
  }

  // OAuth 2.1 with Private Key JWT (RFC 7523)
  if (auth?.type === 'private_key_jwt') {
    if (
      auth.clientId == null ||
      auth.clientId.trim() === '' ||
      auth.privateKey == null ||
      auth.privateKey.trim() === ''
    ) {
      logger.error('AUTH', 'private_key_jwt requires clientId and privateKey');
      return undefined;
    }

    const clientId = expandEnvVar(auth.clientId);
    const privateKey = expandEnvVar(auth.privateKey);
    const algorithm = auth.algorithm ?? 'RS256';

    if (!clientId || !privateKey) {
      logger.error('AUTH', 'private_key_jwt credentials expanded to empty string');
      return undefined;
    }

    logger.info('AUTH', 'Creating Private Key JWT Provider', {
      clientId: clientId.substring(0, 8) + '...',
      algorithm,
    });

    return new PrivateKeyJwtProvider({
      clientId,
      privateKey,
      algorithm,
      clientName: 'mcp-grimoire-client',
    });
  }

  // OAuth 2.1 with Static Private Key JWT (pre-built JWT assertion)
  if (auth?.type === 'static_private_key_jwt') {
    if (
      auth.clientId == null ||
      auth.clientId.trim() === '' ||
      auth.jwtBearerAssertion == null ||
      auth.jwtBearerAssertion.trim() === ''
    ) {
      logger.error('AUTH', 'static_private_key_jwt requires clientId and jwtBearerAssertion');
      return undefined;
    }

    const clientId = expandEnvVar(auth.clientId);
    const jwtBearerAssertion = expandEnvVar(auth.jwtBearerAssertion);

    if (!clientId || !jwtBearerAssertion) {
      logger.error('AUTH', 'static_private_key_jwt credentials expanded to empty string');
      return undefined;
    }

    logger.info('AUTH', 'Creating Static Private Key JWT Provider', {
      clientId: clientId.substring(0, 8) + '...',
    });

    return new StaticPrivateKeyJwtProvider({
      clientId,
      jwtBearerAssertion,
      clientName: 'mcp-grimoire-client',
    });
  }

  // Phase 3: OAuth Authorization Code + PKCE (future)
  if (auth?.type === 'oauth2') {
    logger.warn('AUTH', 'OAuth Authorization Code not yet implemented (Phase 3)');
  }

  // Bearer tokens, Basic auth, and API keys handled via buildAuthHeaders()
  return undefined;
}
