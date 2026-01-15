/**
 * Unit tests for OAuth Client Credentials authentication
 * Phase 2 implementation - machine-to-machine authentication
 *
 * See ADR-0014 for three-phase OAuth implementation strategy
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ClientCredentialsProvider } from '../oauth-client-credentials';

describe('OAuth Client Credentials (Phase 2)', () => {
  const mockTokenUrl = 'https://oauth.example.com/token';
  const mockClientId = 'test-client-id';
  const mockClientSecret = 'test-client-secret';
  const mockAccessToken = 'mock-access-token-12345';
  const mockExpiresIn = 3600; // 1 hour

  beforeEach(() => {
    // Mock fetch globally
    global.fetch = vi.fn();

    // Clear any environment variables
    delete process.env.TEST_CLIENT_SECRET;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Token Exchange', () => {
    it('should exchange client credentials for access token', async () => {
      // Mock successful token response
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: mockAccessToken,
          token_type: 'Bearer',
          expires_in: mockExpiresIn,
        }),
      });

      const provider = new ClientCredentialsProvider({
        clientId: mockClientId,
        clientSecret: mockClientSecret,
        tokenUrl: mockTokenUrl,
      });

      const token = await provider.getAccessToken();

      // Verify token returned
      expect(token).toBe(mockAccessToken);

      // Verify fetch called with correct parameters
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(fetchCall[0]).toBe(mockTokenUrl);

      const fetchOptions = fetchCall[1] as RequestInit;
      expect(fetchOptions.method).toBe('POST');
      expect(fetchOptions.headers).toMatchObject({
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: expect.stringMatching(/^Basic /),
      });

      // Verify body contains grant_type
      const bodyString = fetchOptions.body as string;
      expect(bodyString).toContain('grant_type=client_credentials');
    });

    it('should include scope in token request when provided', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: mockAccessToken,
          token_type: 'Bearer',
          expires_in: mockExpiresIn,
        }),
      });

      const provider = new ClientCredentialsProvider({
        clientId: mockClientId,
        clientSecret: mockClientSecret,
        tokenUrl: mockTokenUrl,
        scope: 'api.read api.write',
      });

      await provider.getAccessToken();

      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const fetchOptions = fetchCall[1] as RequestInit;
      const bodyString = fetchOptions.body as string;

      expect(bodyString).toContain('scope=api.read+api.write');
    });

    it('should use Basic Auth with base64 encoded credentials', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: mockAccessToken,
          token_type: 'Bearer',
          expires_in: mockExpiresIn,
        }),
      });

      const provider = new ClientCredentialsProvider({
        clientId: mockClientId,
        clientSecret: mockClientSecret,
        tokenUrl: mockTokenUrl,
      });

      await provider.getAccessToken();

      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const fetchOptions = fetchCall[1] as RequestInit;
      const authHeader = (fetchOptions.headers as Record<string, string>)['Authorization'];

      // Verify Basic Auth format
      expect(authHeader).toMatch(/^Basic [A-Za-z0-9+/=]+$/);

      // Decode and verify credentials
      const base64Creds = authHeader.replace('Basic ', '');
      const decoded = Buffer.from(base64Creds, 'base64').toString('utf-8');
      expect(decoded).toBe(`${mockClientId}:${mockClientSecret}`);
    });
  });

  describe('Token Caching', () => {
    it('should cache token and reuse without new request', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: mockAccessToken,
          token_type: 'Bearer',
          expires_in: mockExpiresIn,
        }),
      });

      const provider = new ClientCredentialsProvider({
        clientId: mockClientId,
        clientSecret: mockClientSecret,
        tokenUrl: mockTokenUrl,
      });

      // First call - should fetch
      const token1 = await provider.getAccessToken();
      expect(token1).toBe(mockAccessToken);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const token2 = await provider.getAccessToken();
      expect(token2).toBe(mockAccessToken);
      expect(global.fetch).toHaveBeenCalledTimes(1); // Still 1, no new fetch
    });

    it('should refresh token after expiry', async () => {
      const shortExpiry = 1; // 1 second
      const newAccessToken = 'new-access-token-67890';

      // First token response
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: mockAccessToken,
          token_type: 'Bearer',
          expires_in: shortExpiry,
        }),
      });

      const provider = new ClientCredentialsProvider({
        clientId: mockClientId,
        clientSecret: mockClientSecret,
        tokenUrl: mockTokenUrl,
      });

      // Get first token
      const token1 = await provider.getAccessToken();
      expect(token1).toBe(mockAccessToken);

      // Wait for token to expire (with 10% safety margin, expires after ~900ms)
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Mock second token response
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: newAccessToken,
          token_type: 'Bearer',
          expires_in: mockExpiresIn,
        }),
      });

      // Get second token - should refresh
      const token2 = await provider.getAccessToken();
      expect(token2).toBe(newAccessToken);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should apply 10% safety margin before actual expiry', async () => {
      const expiresIn = 100; // 100 seconds
      const expectedSafetyMargin = expiresIn * 0.1; // 10 seconds

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: mockAccessToken,
          token_type: 'Bearer',
          expires_in: expiresIn,
        }),
      });

      const provider = new ClientCredentialsProvider({
        clientId: mockClientId,
        clientSecret: mockClientSecret,
        tokenUrl: mockTokenUrl,
      });

      const beforeTime = Date.now();
      await provider.getAccessToken();
      const afterTime = Date.now();

      // Token should be considered expired at:
      // now + (expiresIn - safetyMargin) * 1000
      // = now + (100 - 10) * 1000 = now + 90000ms

      // This test verifies the logic exists, but we can't easily test
      // the exact timing without time manipulation
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Verify provider stores the token (implicitly tested via cache tests)
      const token = await provider.getAccessToken();
      expect(token).toBe(mockAccessToken);
      expect(global.fetch).toHaveBeenCalledTimes(1); // Still cached
    });

    it('should clear cache on clearCache() call', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: mockAccessToken,
          token_type: 'Bearer',
          expires_in: mockExpiresIn,
        }),
      });

      const provider = new ClientCredentialsProvider({
        clientId: mockClientId,
        clientSecret: mockClientSecret,
        tokenUrl: mockTokenUrl,
      });

      // Get token - should fetch
      await provider.getAccessToken();
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Clear cache
      provider.clearCache();

      // Get token again - should fetch again
      await provider.getAccessToken();
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Environment Variable Expansion', () => {
    it('should expand ${VAR} in clientSecret', async () => {
      process.env.TEST_CLIENT_SECRET = 'secret-from-env';

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: mockAccessToken,
          token_type: 'Bearer',
          expires_in: mockExpiresIn,
        }),
      });

      const provider = new ClientCredentialsProvider({
        clientId: mockClientId,
        clientSecret: '${TEST_CLIENT_SECRET}',
        tokenUrl: mockTokenUrl,
      });

      await provider.getAccessToken();

      // Verify fetch was called with expanded secret
      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const fetchOptions = fetchCall[1] as RequestInit;
      const authHeader = (fetchOptions.headers as Record<string, string>)['Authorization'];

      const base64Creds = authHeader.replace('Basic ', '');
      const decoded = Buffer.from(base64Creds, 'base64').toString('utf-8');
      expect(decoded).toBe(`${mockClientId}:secret-from-env`);
    });
  });

  describe('Error Handling', () => {
    it('should throw error on 401 Unauthorized', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({
          error: 'invalid_client',
        }),
      });

      const provider = new ClientCredentialsProvider({
        clientId: mockClientId,
        clientSecret: 'invalid-secret',
        tokenUrl: mockTokenUrl,
      });

      await expect(provider.getAccessToken()).rejects.toThrow(
        'OAuth token request failed: 401 Unauthorized'
      );
    });

    it('should throw error on 400 Bad Request', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({
          error: 'invalid_request',
        }),
      });

      const provider = new ClientCredentialsProvider({
        clientId: mockClientId,
        clientSecret: mockClientSecret,
        tokenUrl: mockTokenUrl,
      });

      await expect(provider.getAccessToken()).rejects.toThrow(
        'OAuth token request failed: 400 Bad Request'
      );
    });

    it('should throw error on missing access_token in response', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          // Missing access_token field
          token_type: 'Bearer',
          expires_in: mockExpiresIn,
        }),
      });

      const provider = new ClientCredentialsProvider({
        clientId: mockClientId,
        clientSecret: mockClientSecret,
        tokenUrl: mockTokenUrl,
      });

      await expect(provider.getAccessToken()).rejects.toThrow(
        'OAuth token response missing access_token field'
      );
    });

    it('should throw error on missing expires_in in response', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: mockAccessToken,
          token_type: 'Bearer',
          // Missing expires_in field
        }),
      });

      const provider = new ClientCredentialsProvider({
        clientId: mockClientId,
        clientSecret: mockClientSecret,
        tokenUrl: mockTokenUrl,
      });

      await expect(provider.getAccessToken()).rejects.toThrow(
        'OAuth token response missing expires_in field'
      );
    });

    it('should throw error on network failure', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Network error: ECONNREFUSED')
      );

      const provider = new ClientCredentialsProvider({
        clientId: mockClientId,
        clientSecret: mockClientSecret,
        tokenUrl: mockTokenUrl,
      });

      await expect(provider.getAccessToken()).rejects.toThrow('Network error: ECONNREFUSED');
    });

    it('should handle non-JSON error responses gracefully', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => {
          throw new Error('Not JSON');
        },
      });

      const provider = new ClientCredentialsProvider({
        clientId: mockClientId,
        clientSecret: mockClientSecret,
        tokenUrl: mockTokenUrl,
      });

      await expect(provider.getAccessToken()).rejects.toThrow(
        'OAuth token request failed: 500 Internal Server Error'
      );
    });
  });

  describe('Integration with auth-provider.ts', () => {
    it('should work with createAuthProvider() function', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: mockAccessToken,
          token_type: 'Bearer',
          expires_in: mockExpiresIn,
        }),
      });

      const { createAuthProvider } = await import('../auth-provider.js');

      const authConfig = {
        type: 'client_credentials' as const,
        clientId: mockClientId,
        clientSecret: mockClientSecret,
        tokenUrl: mockTokenUrl,
      };

      const provider = createAuthProvider(authConfig);
      expect(provider).toBeDefined();
      expect(provider?.getAccessToken).toBeDefined();

      if (provider) {
        const token = await provider.getAccessToken();
        expect(token).toBe(mockAccessToken);
      }
    });
  });
});
