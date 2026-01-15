/**
 * Tests for semantic intent resolver
 * Uses embeddings and cosine similarity to find most relevant powers
 * Following TDD: Write tests first, then implement
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { SemanticResolver } from '../semantic-resolver';
import { EmbeddingService } from '../../infrastructure/embedding-service';
import { EmbeddingStorage } from '../../infrastructure/embedding-storage';
import type { SpellConfig } from '../../core/types';
import { tmpdir } from 'os';
import { join } from 'path';
import { rm, mkdir } from 'fs/promises';

describe('SemanticResolver', () => {
  let resolver: SemanticResolver;
  let embeddingService: EmbeddingService;
  let storage: EmbeddingStorage;
  let testCacheDir: string;
  let testCachePath: string;

  // Sample power configurations
  const postgresConfig: SpellConfig = {
    name: 'postgres',
    description: 'PostgreSQL database operations and queries',
    keywords: ['database', 'sql', 'postgres', 'query'],
    version: '1.0.0',
    server: {
      command: 'postgres-mcp',
      args: [],
    },
  };

  const stripeConfig: SpellConfig = {
    name: 'stripe',
    description: 'Stripe payment processing and billing',
    keywords: ['payment', 'stripe', 'billing', 'charge'],
    version: '1.0.0',
    server: {
      command: 'stripe-mcp',
      args: [],
    },
  };

  const awsConfig: SpellConfig = {
    name: 'aws',
    description: 'AWS cloud services and infrastructure',
    keywords: ['cloud', 'aws', 's3', 'ec2'],
    version: '1.0.0',
    server: {
      command: 'aws-mcp',
      args: [],
    },
  };

  beforeAll(async () => {
    // Initialize embedding service (singleton)
    embeddingService = await EmbeddingService.getInstance();
  }, 30000); // 30s timeout for model download

  beforeEach(async () => {
    // Create temporary cache directory
    testCacheDir = join(tmpdir(), `semantic-test-${Date.now()}`);
    testCachePath = join(testCacheDir, 'embeddings.msgpack');
    await mkdir(testCacheDir, { recursive: true });

    // Create fresh storage and resolver
    storage = new EmbeddingStorage(testCachePath);
    await storage.load();

    resolver = new SemanticResolver(embeddingService, storage);
  });

  afterEach(async () => {
    // Clean up
    try {
      await rm(testCacheDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('initialization', () => {
    it('should create resolver instance', () => {
      expect(resolver).toBeDefined();
    });

    it('should accept embedding service and storage', () => {
      const customStorage = new EmbeddingStorage(testCachePath);
      const customResolver = new SemanticResolver(embeddingService, customStorage);
      expect(customResolver).toBeDefined();
    });
  });

  describe('indexPower', () => {
    it('should index a single power configuration', async () => {
      await resolver.indexSpell(postgresConfig);

      // Verify embedding was generated and stored
      expect(storage.has('postgres')).toBe(true);
      const embedding = storage.get('postgres');
      expect(embedding).toBeDefined();
      expect(embedding?.length).toBe(384);
    });

    it('should index multiple power configurations', async () => {
      await resolver.indexSpell(postgresConfig);
      await resolver.indexSpell(stripeConfig);
      await resolver.indexSpell(awsConfig);

      expect(storage.has('postgres')).toBe(true);
      expect(storage.has('stripe')).toBe(true);
      expect(storage.has('aws')).toBe(true);
    });

    it('should skip re-indexing if hash unchanged', async () => {
      await resolver.indexSpell(postgresConfig);
      const firstEmbedding = storage.get('postgres');

      // Index again - should skip
      await resolver.indexSpell(postgresConfig);
      const secondEmbedding = storage.get('postgres');

      expect(firstEmbedding).toEqual(secondEmbedding);
    });

    it('should re-index if power config changed', async () => {
      await resolver.indexSpell(postgresConfig);
      const metadata1 = storage.getMetadata('postgres');

      // Modify config
      const modifiedConfig = {
        ...postgresConfig,
        description: 'PostgreSQL database operations, queries, and migrations',
      };
      await resolver.indexSpell(modifiedConfig);
      const metadata2 = storage.getMetadata('postgres');

      // Hash should be different
      expect(metadata1?.hash).not.toBe(metadata2?.hash);
    });

    it('should persist embeddings to storage', async () => {
      await resolver.indexSpell(postgresConfig);
      await storage.save();

      // Create new storage and load
      const newStorage = new EmbeddingStorage(testCachePath);
      await newStorage.load();

      expect(newStorage.has('postgres')).toBe(true);
      const embedding = newStorage.get('postgres');
      expect(embedding?.length).toBe(384);
    });
  });

  describe('resolve', () => {
    beforeEach(async () => {
      // Index test powers
      await resolver.indexSpell(postgresConfig);
      await resolver.indexSpell(stripeConfig);
      await resolver.indexSpell(awsConfig);
    });

    it('should find exact match with high similarity', async () => {
      const result = await resolver.resolve('PostgreSQL database operations');

      expect(result).not.toBeNull();
      expect(result?.spellName).toBe('postgres');
      expect(result?.similarity).toBeGreaterThan(0.8); // Very high similarity
    });

    it('should find semantically similar power', async () => {
      // Note: Semantic similarity often yields 0.4-0.5 for good matches
      // This is why the Hybrid Resolver combines keyword + semantic matching
      const result = await resolver.resolve('I need to query my SQL database');

      expect(result).not.toBeNull();
      expect(result?.spellName).toBe('postgres');
      expect(result?.similarity).toBeGreaterThan(0.4); // Above default threshold
      expect(result?.similarity).toBeLessThan(0.7); // Realistic expectation for semantic-only
    });

    it('should distinguish between different powers', async () => {
      const result1 = await resolver.resolve('process payment with credit card');
      const result2 = await resolver.resolve('deploy to cloud infrastructure');

      expect(result1?.spellName).toBe('stripe');
      expect(result2?.spellName).toBe('aws');
    });

    it('should return null if no power meets confidence threshold', async () => {
      // Very unrelated query
      const result = await resolver.resolve('recipe for chocolate cake');

      // Should be null with default 0.4 threshold (or very low similarity if returned)
      if (result !== null) {
        expect(result.similarity).toBeLessThan(0.4);
      }
    });

    it('should handle empty query', async () => {
      await expect(resolver.resolve('')).rejects.toThrow();
    });

    it('should return top result when multiple matches', async () => {
      // Single-word queries may have lower similarity - use explicit lower threshold
      const result = await resolver.resolve('database operations and queries', 0.3);

      expect(result).not.toBeNull();
      expect(result?.spellName).toBe('postgres'); // Most relevant
    });
  });

  describe('resolveTopN', () => {
    beforeEach(async () => {
      await resolver.indexSpell(postgresConfig);
      await resolver.indexSpell(stripeConfig);
      await resolver.indexSpell(awsConfig);
    });

    it('should return top N matches with similarities', async () => {
      const results = await resolver.resolveTopN('database operations', 3);

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(3);

      // Should be sorted by similarity (descending)
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].similarity).toBeGreaterThanOrEqual(results[i].similarity);
      }
    });

    it('should limit results to N', async () => {
      const results = await resolver.resolveTopN('cloud services', 2);

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should include similarity scores', async () => {
      const results = await resolver.resolveTopN('payment processing', 3);

      results.forEach((result) => {
        expect(result.spellName).toBeDefined();
        expect(result.similarity).toBeGreaterThanOrEqual(0);
        expect(result.similarity).toBeLessThanOrEqual(1);
      });
    });

    it('should filter by minimum confidence threshold', async () => {
      // Use lower threshold for unrelated query test
      const results = await resolver.resolveTopN('chocolate cake recipe', 3, 0.2);

      // All results should meet threshold
      results.forEach((result) => {
        expect(result.similarity).toBeGreaterThanOrEqual(0.2);
      });
    });
  });

  describe('removePower', () => {
    it('should remove power from index', async () => {
      await resolver.indexSpell(postgresConfig);
      expect(storage.has('postgres')).toBe(true);

      await resolver.removeSpell('postgres');
      expect(storage.has('postgres')).toBe(false);
    });

    it('should not throw when removing non-existent power', async () => {
      await expect(resolver.removeSpell('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('getIndexedPowers', () => {
    it('should return list of indexed power names', async () => {
      await resolver.indexSpell(postgresConfig);
      await resolver.indexSpell(stripeConfig);

      const powers = resolver.getIndexedSpells();
      expect(powers).toContain('postgres');
      expect(powers).toContain('stripe');
      expect(powers.length).toBe(2);
    });

    it('should return empty array when no powers indexed', () => {
      const powers = resolver.getIndexedSpells();
      expect(powers).toEqual([]);
    });
  });

  describe('performance', () => {
    beforeEach(async () => {
      // Index 10 powers
      for (let i = 0; i < 10; i++) {
        await resolver.indexSpell({
          name: `power${i}`,
          description: `Power ${i} for testing performance`,
          keywords: [`test${i}`, 'performance'],
          version: '1.0.0',
          server: { command: 'test', args: [] },
        });
      }
    });

    it('should resolve query in < 100ms', async () => {
      const start = Date.now();
      await resolver.resolve('test query for performance');
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100);
    });

    it('should compute top 5 in < 100ms', async () => {
      const start = Date.now();
      await resolver.resolveTopN('test query', 5);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100);
    });
  });
});
