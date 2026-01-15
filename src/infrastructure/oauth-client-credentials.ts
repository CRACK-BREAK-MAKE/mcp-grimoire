/**
 * OAuth 2.1 Client Credentials Provider
 * Implements machine-to-machine authentication with token caching
 *
 * See ADR-0014 Phase 2 for OAuth Client Credentials strategy
 *
 * @module infrastructure/oauth-client-credentials
 */

import { logger } from '../utils/logger.js';
import { expandEnvVar } from './auth-provider.js';

/**
 * Configuration for OAuth Client Credentials flow
 */
export interface ClientCredentialsConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly tokenUrl: string;
  readonly scope?: string;
}

/**
 * OAuth token response from token endpoint
 */
interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

/**
 * Cached token with expiry information
 */
interface CachedToken {
  token: string;
  expiresAt: number;
}

/**
 * OAuth 2.1 Client Credentials Provider
 *
 * Implements RFC 6749 Client Credentials Grant with:
 * - Token caching to minimize requests
 * - Automatic refresh on expiry
 * - Safety margin (10%) before actual expiry
 * - Basic Auth for client credentials
 *
 * Usage:
 * ```typescript
 * const provider = new ClientCredentialsProvider({
 *   clientId: 'my-client',
 *   clientSecret: '${OAUTH_SECRET}',
 *   tokenUrl: 'https://oauth.example.com/token',
 *   scope: 'api.read api.write'
 * });
 *
 * const token = await provider.getAccessToken();
 * ```
 */
export class ClientCredentialsProvider {
  private readonly config: ClientCredentialsConfig;
  private tokenCache: CachedToken | null = null;

  constructor(config: ClientCredentialsConfig) {
    // Expand environment variables in credentials
    this.config = {
      ...config,
      clientId: expandEnvVar(config.clientId),
      clientSecret: expandEnvVar(config.clientSecret),
    };

    logger.info('AUTH', 'Client Credentials Provider initialized', {
      clientId: this.config.clientId,
      tokenUrl: this.config.tokenUrl,
      scope: this.config.scope ?? '(none)',
    });
  }

  /**
   * Get access token (from cache or fetch new)
   *
   * Returns cached token if:
   * - Token exists in cache
   * - Token not expired (with 10% safety margin)
   *
   * Otherwise fetches new token from token endpoint
   *
   * @returns Access token string
   * @throws Error if token request fails
   */
  async getAccessToken(): Promise<string> {
    // Check cache first
    if (this.tokenCache && !this.isTokenExpired(this.tokenCache)) {
      logger.debug('AUTH', 'Using cached access token');
      return this.tokenCache.token;
    }

    // Fetch new token
    logger.info('AUTH', 'Fetching new access token', {
      reason: this.tokenCache ? 'expired' : 'no cache',
    });

    const tokenResponse = await this.fetchToken();

    // Cache token with expiry (apply 10% safety margin)
    const safetyMargin = tokenResponse.expires_in * 0.1;
    const expiresAt = Date.now() + (tokenResponse.expires_in - safetyMargin) * 1000;

    this.tokenCache = {
      token: tokenResponse.access_token,
      expiresAt,
    };

    logger.info('AUTH', 'Access token obtained and cached', {
      expiresIn: tokenResponse.expires_in,
      safetyMargin: Math.floor(safetyMargin),
    });

    return tokenResponse.access_token;
  }

  /**
   * Check if cached token is expired (with safety margin)
   */
  private isTokenExpired(cachedToken: CachedToken): boolean {
    return Date.now() >= cachedToken.expiresAt;
  }

  /**
   * Fetch new access token from OAuth token endpoint
   *
   * Uses client_credentials grant type with Basic Auth
   * Per RFC 6749 Section 2.3.1
   */
  private async fetchToken(): Promise<TokenResponse> {
    // Build request body (application/x-www-form-urlencoded)
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      ...(this.config.scope != null &&
        this.config.scope.trim() !== '' && { scope: this.config.scope }),
    });

    // Basic Auth: base64(clientId:clientSecret)
    const credentials = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString(
      'base64'
    );

    try {
      const response = await fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${credentials}`,
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        logger.error('AUTH', 'Token request failed', undefined, {
          status: response.status,
          statusText: response.statusText,
          error: errorBody,
        });

        throw new Error(`OAuth token request failed: ${response.status} ${response.statusText}`);
      }

      const tokenResponse = (await response.json()) as TokenResponse;

      // Validate response
      if (!tokenResponse.access_token) {
        throw new Error('OAuth token response missing access_token field');
      }

      if (!tokenResponse.expires_in) {
        throw new Error('OAuth token response missing expires_in field');
      }

      return tokenResponse;
    } catch (error) {
      logger.error('AUTH', 'Token fetch failed', error instanceof Error ? error : undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Clear cached token (useful for testing or manual refresh)
   */
  clearCache(): void {
    this.tokenCache = null;
    logger.debug('AUTH', 'Token cache cleared');
  }
}
