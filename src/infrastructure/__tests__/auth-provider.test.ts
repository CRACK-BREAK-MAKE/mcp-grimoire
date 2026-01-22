/**
 * Unit tests for authentication provider
 * Tests Bearer token authentication and environment variable expansion
 *
 * See ADR-0012 for Bearer token authentication strategy
 * See ADR-0013 for environment variable expansion
 * See ADR-0014 for OAuth Client Credentials
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAuthHeaders, expandEnvVar, createAuthProvider } from '../auth-provider';
import type { AuthConfig } from '../../core/types';

describe('buildAuthHeaders', () => {
  it('should return empty headers when no auth config', () => {
    const headers = buildAuthHeaders();
    expect(headers).toEqual({});
  });

  it('should return empty headers when auth type is none', () => {
    const auth: AuthConfig = { type: 'none' };
    const headers = buildAuthHeaders(undefined, auth);
    expect(headers).toEqual({});
  });

  it('should add Bearer token to Authorization header', () => {
    const auth: AuthConfig = {
      type: 'bearer',
      token: 'test-token-123',
    };
    const headers = buildAuthHeaders(undefined, auth);
    expect(headers).toEqual({
      Authorization: 'Bearer test-token-123',
    });
  });

  it('should expand environment variables in token', () => {
    process.env.TEST_TOKEN = 'secret-value';
    const auth: AuthConfig = {
      type: 'bearer',
      token: '${TEST_TOKEN}',
    };
    const headers = buildAuthHeaders(undefined, auth);
    expect(headers).toEqual({
      Authorization: 'Bearer secret-value',
    });
    delete process.env.TEST_TOKEN;
  });

  it('should merge custom headers with auth headers', () => {
    const customHeaders = {
      'X-Custom-Header': 'custom-value',
      'Content-Type': 'application/json',
    };
    const auth: AuthConfig = {
      type: 'bearer',
      token: 'test-token',
    };
    const headers = buildAuthHeaders(customHeaders, auth);
    expect(headers).toEqual({
      'X-Custom-Header': 'custom-value',
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-token',
    });
  });

  it('should handle Basic Auth', () => {
    const auth: AuthConfig = {
      type: 'bearer',
      token: 'dXNlcjpwYXNz', // base64(user:pass)
    };
    const headers = buildAuthHeaders(undefined, auth);
    // Note: In future we may add explicit Basic Auth type
    // For now, Bearer token can be base64 for Basic Auth
    expect(headers).toEqual({
      Authorization: 'Bearer dXNlcjpwYXNz',
    });
  });

  it('should not add auth headers when token is undefined', () => {
    const auth: AuthConfig = {
      type: 'bearer',
      // token is undefined
    };
    const headers = buildAuthHeaders(undefined, auth);
    expect(headers).toEqual({});
  });

  it('should handle empty token after env var expansion', () => {
    const auth: AuthConfig = {
      type: 'bearer',
      token: '${NONEXISTENT_VAR}',
    };
    const headers = buildAuthHeaders(undefined, auth);
    // expandEnvVar returns empty string for undefined vars
    expect(headers).toEqual({
      Authorization: 'Bearer ',
    });
  });

  it('should handle Basic Auth username and password', () => {
    const auth: AuthConfig = {
      type: 'basic',
      username: 'testuser',
      password: 'testpass',
    };
    const headers = buildAuthHeaders(undefined, auth);
    const expectedBase64 = Buffer.from('testuser:testpass').toString('base64');
    // Basic Auth uses Bearer prefix for FastMCP compatibility
    expect(headers).toEqual({
      Authorization: `Bearer ${expectedBase64}`,
    });
  });

  it('should expand env vars in Basic Auth', () => {
    process.env.TEST_USERNAME = 'envuser';
    process.env.TEST_PASSWORD = 'envpass';
    const auth: AuthConfig = {
      type: 'basic',
      username: '${TEST_USERNAME}',
      password: '${TEST_PASSWORD}',
    };
    const headers = buildAuthHeaders(undefined, auth);
    const expectedBase64 = Buffer.from('envuser:envpass').toString('base64');
    // Basic Auth uses Bearer prefix for FastMCP compatibility
    expect(headers).toEqual({
      Authorization: `Bearer ${expectedBase64}`,
    });
    delete process.env.TEST_USERNAME;
    delete process.env.TEST_PASSWORD;
  });

  it('should handle undefined environment variable in password', () => {
    const auth: AuthConfig = {
      type: 'basic',
      username: 'user',
      password: '${UNDEFINED_PASSWORD}',
    };
    const headers = buildAuthHeaders(undefined, auth);
    // Should not add auth header when password expands to empty
    expect(headers).toEqual({});
  });
});

describe('createAuthProvider', () => {
  beforeEach(() => {
    delete process.env.TEST_CLIENT_ID;
    delete process.env.TEST_CLIENT_SECRET;
    delete process.env.TEST_PRIVATE_KEY;
    delete process.env.TEST_JWT_ASSERTION;
  });

  afterEach(() => {
    delete process.env.TEST_CLIENT_ID;
    delete process.env.TEST_CLIENT_SECRET;
    delete process.env.TEST_PRIVATE_KEY;
    delete process.env.TEST_JWT_ASSERTION;
  });

  it('should return undefined for bearer auth', () => {
    const auth: AuthConfig = {
      type: 'bearer',
      token: 'test-token',
    };
    const provider = createAuthProvider(auth);
    expect(provider).toBeUndefined();
  });

  it('should return undefined for basic auth', () => {
    const auth: AuthConfig = {
      type: 'basic',
      username: 'user',
      password: 'pass',
    };
    const provider = createAuthProvider(auth);
    expect(provider).toBeUndefined();
  });

  it('should create ClientCredentialsProvider for client_credentials', () => {
    const auth: AuthConfig = {
      type: 'client_credentials',
      clientId: 'test-client',
      clientSecret: 'test-secret',
    };
    const provider = createAuthProvider(auth);
    expect(provider).toBeDefined();
    expect(provider?.clientMetadata).toBeDefined();
  });

  it('should expand env vars in client_credentials', () => {
    process.env.TEST_CLIENT_ID = 'env-client-id';
    process.env.TEST_CLIENT_SECRET = 'env-secret';
    const auth: AuthConfig = {
      type: 'client_credentials',
      clientId: '${TEST_CLIENT_ID}',
      clientSecret: '${TEST_CLIENT_SECRET}',
    };
    const provider = createAuthProvider(auth);
    expect(provider).toBeDefined();
    expect(provider?.clientInformation()?.client_id).toBe('env-client-id');
  });

  it('should create PrivateKeyJwtProvider for private_key_jwt', () => {
    const auth: AuthConfig = {
      type: 'private_key_jwt',
      clientId: 'test-client',
      privateKey: '-----BEGIN PRIVATE KEY-----\\ntest\\n-----END PRIVATE KEY-----',
      algorithm: 'RS256',
    };
    const provider = createAuthProvider(auth);
    expect(provider).toBeDefined();
    expect(provider?.clientMetadata).toBeDefined();
  });

  it('should expand env vars in private_key_jwt', () => {
    process.env.TEST_CLIENT_ID = 'jwt-client-id';
    process.env.TEST_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\ntest\\n-----END PRIVATE KEY-----';
    const auth: AuthConfig = {
      type: 'private_key_jwt',
      clientId: '${TEST_CLIENT_ID}',
      privateKey: '${TEST_PRIVATE_KEY}',
      algorithm: 'RS256',
    };
    const provider = createAuthProvider(auth);
    expect(provider).toBeDefined();
    expect(provider?.clientInformation()?.client_id).toBe('jwt-client-id');
  });

  it('should use default algorithm RS256 for private_key_jwt', () => {
    const auth: AuthConfig = {
      type: 'private_key_jwt',
      clientId: 'test-client',
      privateKey: '-----BEGIN PRIVATE KEY-----\\ntest\\n-----END PRIVATE KEY-----',
    };
    const provider = createAuthProvider(auth);
    expect(provider).toBeDefined();
  });

  it('should create StaticPrivateKeyJwtProvider for static_private_key_jwt', () => {
    const auth: AuthConfig = {
      type: 'static_private_key_jwt',
      clientId: 'test-client',
      jwtBearerAssertion: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.test.signature',
    };
    const provider = createAuthProvider(auth);
    expect(provider).toBeDefined();
    expect(provider?.clientMetadata).toBeDefined();
  });

  it('should expand env vars in static_private_key_jwt', () => {
    process.env.TEST_CLIENT_ID = 'static-client-id';
    process.env.TEST_JWT_ASSERTION = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.test.signature';
    const auth: AuthConfig = {
      type: 'static_private_key_jwt',
      clientId: '${TEST_CLIENT_ID}',
      jwtBearerAssertion: '${TEST_JWT_ASSERTION}',
    };
    const provider = createAuthProvider(auth);
    expect(provider).toBeDefined();
    expect(provider?.clientInformation()?.client_id).toBe('static-client-id');
  });

  it('should return undefined for missing client_credentials config', () => {
    const auth: AuthConfig = {
      type: 'client_credentials',
      clientId: '',
      clientSecret: 'secret',
    };
    const provider = createAuthProvider(auth);
    expect(provider).toBeUndefined();
  });

  it('should return undefined for missing private_key_jwt config', () => {
    const auth: AuthConfig = {
      type: 'private_key_jwt',
      clientId: 'client',
      privateKey: '',
    };
    const provider = createAuthProvider(auth);
    expect(provider).toBeUndefined();
  });

  it('should return undefined for missing static_private_key_jwt config', () => {
    const auth: AuthConfig = {
      type: 'static_private_key_jwt',
      clientId: 'client',
      jwtBearerAssertion: '',
    };
    const provider = createAuthProvider(auth);
    expect(provider).toBeUndefined();
  });
});

describe('expandEnvVar', () => {
  beforeEach(() => {
    // Clean up env vars before each test
    delete process.env.TEST_VAR;
    delete process.env.ANOTHER_VAR;
  });

  afterEach(() => {
    // Clean up after each test
    delete process.env.TEST_VAR;
    delete process.env.ANOTHER_VAR;
  });

  it('should expand ${VAR} to process.env.VAR', () => {
    process.env.TEST_VAR = 'test-value';
    const result = expandEnvVar('${TEST_VAR}');
    expect(result).toBe('test-value');
  });

  it('should handle multiple ${VAR} in same string', () => {
    process.env.TEST_VAR = 'hello';
    process.env.ANOTHER_VAR = 'world';
    const result = expandEnvVar('${TEST_VAR} ${ANOTHER_VAR}!');
    expect(result).toBe('hello world!');
  });

  it('should return empty string for undefined vars', () => {
    const result = expandEnvVar('${UNDEFINED_VAR}');
    expect(result).toBe('');
  });

  it('should handle literal text without variables', () => {
    const result = expandEnvVar('literal text');
    expect(result).toBe('literal text');
  });

  it('should handle mixed literal and variables', () => {
    process.env.TEST_VAR = 'value';
    const result = expandEnvVar('prefix ${TEST_VAR} suffix');
    expect(result).toBe('prefix value suffix');
  });

  it('should handle empty string', () => {
    const result = expandEnvVar('');
    expect(result).toBe('');
  });

  it('should handle nested braces (partial expansion)', () => {
    // ${VAR} with nested braces - inner ${INNER} gets expanded, outer stays malformed
    const result = expandEnvVar('${TEST${INNER}}');
    // Regex matches valid ${VAR_NAME} patterns, so ${INNER} is expanded (to empty string)
    // leaving the malformed '${TEST}' behind
    expect(result).toBe('${TEST}');
  });

  it('should handle variable at start of string', () => {
    process.env.TEST_VAR = 'start';
    const result = expandEnvVar('${TEST_VAR} end');
    expect(result).toBe('start end');
  });

  it('should handle variable at end of string', () => {
    process.env.TEST_VAR = 'end';
    const result = expandEnvVar('start ${TEST_VAR}');
    expect(result).toBe('start end');
  });

  it('should handle underscore in variable names', () => {
    process.env.MY_TEST_VAR = 'value';
    const result = expandEnvVar('${MY_TEST_VAR}');
    expect(result).toBe('value');
  });

  it('should handle numbers in variable names', () => {
    process.env.VAR123 = 'value';
    const result = expandEnvVar('${VAR123}');
    expect(result).toBe('value');
  });

  it('should not expand escaped variables (future feature)', () => {
    // For now, we don't support escaping
    // This test documents current behavior
    const result = expandEnvVar('\\${TEST_VAR}');
    expect(result).toBe('\\'); // Backslash remains, var expands to empty
  });
});
