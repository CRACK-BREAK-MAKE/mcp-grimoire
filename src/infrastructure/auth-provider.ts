/**
 * Authentication Provider for HTTP/SSE Transports
 * Handles Bearer token authentication and environment variable expansion
 *
 * See ADR-0012 for Bearer token authentication strategy
 * See ADR-0013 for environment variable expansion
 *
 * @module infrastructure/auth-provider
 */

import type { AuthConfig } from '../core/types.js';
import { logger } from '../utils/logger.js';
import { ClientCredentialsProvider } from './oauth-client-credentials.js';

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
 * Phase 1: Returns undefined (Bearer tokens handled via headers)
 * Phase 2: Returns ClientCredentialsProvider
 * Phase 3: Returns AuthorizationCodeProvider
 *
 * @param auth - Authentication configuration
 * @returns OAuth provider instance or undefined
 */
export function createAuthProvider(
  auth?: AuthConfig
): { getAccessToken: () => Promise<string> } | undefined {
  // Phase 2: OAuth Client Credentials
  if (auth?.type === 'client_credentials') {
    if (auth.clientId == null || auth.clientId.trim() === '' ||
        auth.clientSecret == null || auth.clientSecret.trim() === '' ||
        auth.tokenUrl == null || auth.tokenUrl.trim() === '') {
      logger.error('AUTH', 'Missing required fields for client_credentials auth');
      return undefined;
    }

    const provider = new ClientCredentialsProvider({
      clientId: auth.clientId,
      clientSecret: auth.clientSecret,
      tokenUrl: auth.tokenUrl,
      scope: auth.scope,
    });

    // Return MCP SDK compatible provider interface
    return {
      getAccessToken: () => provider.getAccessToken(),
    };
  }

  // Phase 3: OAuth Authorization Code + PKCE
  if (auth?.type === 'oauth2') {
    logger.warn('AUTH', 'OAuth Authorization Code not yet implemented (Phase 3)');
  }

  // Phase 1: Bearer tokens handled via buildAuthHeaders()
  return undefined;
}
