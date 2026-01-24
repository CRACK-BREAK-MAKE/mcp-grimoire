import { describe, it, expect } from 'vitest';
import { maskSensitive, maskBase64, maskAuthHeader, maskHeaders } from '../mask-sensitive.js';

describe('mask-sensitive', () => {
  describe('maskSensitive', () => {
    it('should mask long secrets showing first 4 chars by default', () => {
      expect(maskSensitive('my-secret-token-12345')).toBe('my-s***');
    });

    it('should mask with custom visible chars', () => {
      expect(maskSensitive('my-secret-token-12345', 8)).toBe('my-secre***');
    });

    it('should mask short strings completely', () => {
      expect(maskSensitive('abc')).toBe('***');
      expect(maskSensitive('abcd', 4)).toBe('***');
    });

    it('should handle null and undefined', () => {
      expect(maskSensitive(null)).toBe('***');
      expect(maskSensitive(undefined)).toBe('***');
    });

    it('should handle empty strings', () => {
      expect(maskSensitive('')).toBe('***');
    });
  });

  describe('maskBase64', () => {
    it('should mask base64 credentials', () => {
      expect(maskBase64('dXNlcjpwYXNzd29yZA==')).toBe('dXNl***');
    });

    it('should mask short base64 strings', () => {
      expect(maskBase64('abc')).toBe('***');
    });
  });

  describe('maskAuthHeader', () => {
    it('should mask Bearer token headers', () => {
      expect(maskAuthHeader('Bearer my-secret-token-12345')).toBe('Bearer my-s***');
    });

    it('should mask Basic auth headers', () => {
      expect(maskAuthHeader('Basic dXNlcjpwYXNzd29yZA==')).toBe('Basic dXNl***');
    });

    it('should handle custom auth types', () => {
      expect(maskAuthHeader('API-Key some-long-api-key-value')).toBe('API-Key some***');
    });

    it('should handle invalid header formats', () => {
      expect(maskAuthHeader('InvalidFormat')).toBe('***');
      expect(maskAuthHeader('Too Many Parts Here')).toBe('***');
    });

    it('should handle null and undefined', () => {
      expect(maskAuthHeader(null)).toBe('***');
      expect(maskAuthHeader(undefined)).toBe('***');
    });

    it('should handle empty strings', () => {
      expect(maskAuthHeader('')).toBe('***');
    });
  });

  describe('maskHeaders', () => {
    it('should mask Authorization header while preserving auth type', () => {
      const headers = {
        Authorization: 'Bearer my-secret-token-12345',
        'Content-Type': 'application/json',
      };
      const masked = maskHeaders(headers);
      expect(masked['Authorization']).toBe('Bearer my-s***');
      expect(masked['Content-Type']).toBe('application/json');
    });

    it('should mask X-API-Key header', () => {
      const headers = {
        'X-API-Key': 'super-secret-api-key',
        Accept: 'application/json',
      };
      const masked = maskHeaders(headers);
      expect(masked['X-API-Key']).toBe('supe***');
      expect(masked['Accept']).toBe('application/json');
    });

    it('should mask headers containing sensitive keywords', () => {
      const headers = {
        'X-GitHub-Token': 'ghp_mytoken123',
        'X-Secret-Key': 'my-secret',
        'X-Password': 'pass123',
        'X-Credential': 'cred456',
        'Content-Type': 'text/plain',
      };
      const masked = maskHeaders(headers);
      expect(masked['X-GitHub-Token']).toBe('ghp_***');
      expect(masked['X-Secret-Key']).toBe('my-s***');
      expect(masked['X-Password']).toBe('pass***');
      expect(masked['X-Credential']).toBe('cred***');
      expect(masked['Content-Type']).toBe('text/plain');
    });

    it('should handle undefined headers', () => {
      expect(maskHeaders(undefined)).toEqual({});
    });

    it('should handle empty headers object', () => {
      expect(maskHeaders({})).toEqual({});
    });

    it('should be case-insensitive for sensitive header names', () => {
      const headers = {
        authorization: 'Bearer token123',
        AUTHORIZATION: 'Bearer token456',
        'x-api-key': 'key789',
      };
      const masked = maskHeaders(headers);
      expect(masked['authorization']).toBe('Bearer toke***');
      expect(masked['AUTHORIZATION']).toBe('Bearer toke***');
      expect(masked['x-api-key']).toBe('key7***');
    });
  });
});
