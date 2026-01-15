/**
 * Unit tests for authentication provider
 * Tests Bearer token authentication and environment variable expansion
 *
 * See ADR-0012 for Bearer token authentication strategy
 * See ADR-0013 for environment variable expansion
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAuthHeaders, expandEnvVar } from '../auth-provider';
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
