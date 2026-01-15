/**
 * Tests for embedding service
 * Uses @xenova/transformers with all-MiniLM-L6-v2 model
 * Following TDD: Write tests first, then implement
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { EmbeddingService } from '../embedding-service';

describe('EmbeddingService', () => {
  let service: EmbeddingService;

  beforeAll(async () => {
    // Initialize service (loads model)
    service = await EmbeddingService.getInstance();
  }, 30000); // 30s timeout for model download on first run

  describe('getInstance', () => {
    it('should return singleton instance', async () => {
      const instance1 = await EmbeddingService.getInstance();
      const instance2 = await EmbeddingService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should initialize model on first call', async () => {
      const instance = await EmbeddingService.getInstance();
      expect(instance).toBeDefined();
    });
  });

  describe('embed', () => {
    it('should generate 384-dimensional embedding for text', async () => {
      const text = 'PostgreSQL database operations';
      const embedding = await service.embed(text);

      expect(embedding).toBeDefined();
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBe(384);
      expect(embedding.every((v) => typeof v === 'number')).toBe(true);
    });

    it('should generate different embeddings for different text', async () => {
      const text1 = 'PostgreSQL database operations';
      const text2 = 'Stripe payment processing';

      const embedding1 = await service.embed(text1);
      const embedding2 = await service.embed(text2);

      expect(embedding1).not.toEqual(embedding2);
    });

    it('should generate consistent embeddings for same text', async () => {
      const text = 'PostgreSQL database operations';

      const embedding1 = await service.embed(text);
      const embedding2 = await service.embed(text);

      // Embeddings should be identical (deterministic)
      expect(embedding1).toEqual(embedding2);
    });

    it('should handle empty string', async () => {
      const embedding = await service.embed('');
      expect(embedding).toBeDefined();
      expect(embedding.length).toBe(384);
    });

    it('should handle very long text', async () => {
      const longText = 'database '.repeat(100); // 900 characters
      const embedding = await service.embed(longText);

      expect(embedding).toBeDefined();
      expect(embedding.length).toBe(384);
    });

    it('should handle special characters', async () => {
      const text = 'PostgreSQL: "SELECT * FROM users WHERE id = $1"';
      const embedding = await service.embed(text);

      expect(embedding).toBeDefined();
      expect(embedding.length).toBe(384);
    });

    it('should handle unicode characters', async () => {
      const text = 'データベース操作 🚀 Émojis and ñoñ-ÂSCIÍ';
      const embedding = await service.embed(text);

      expect(embedding).toBeDefined();
      expect(embedding.length).toBe(384);
    });

    it('should generate embeddings in reasonable time', async () => {
      const text = 'PostgreSQL database operations';

      const start = Date.now();
      await service.embed(text);
      const elapsed = Date.now() - start;

      // Should be fast after model is loaded (<100ms)
      expect(elapsed).toBeLessThan(1000);
    });
  });

  describe('embedBatch', () => {
    it('should generate embeddings for multiple texts', async () => {
      const texts = ['PostgreSQL database', 'Stripe payments', 'AWS cloud services'];

      const embeddings = await service.embedBatch(texts);

      expect(embeddings).toBeDefined();
      expect(embeddings.length).toBe(3);
      expect(embeddings.every((emb) => emb.length === 384)).toBe(true);
    });

    it('should handle empty array', async () => {
      const embeddings = await service.embedBatch([]);
      expect(embeddings).toEqual([]);
    });

    it('should handle single text in batch', async () => {
      const embeddings = await service.embedBatch(['PostgreSQL database']);
      expect(embeddings.length).toBe(1);
      expect(embeddings[0].length).toBe(384);
    });
  });

  describe('getModelInfo', () => {
    it('should return model name', () => {
      const info = service.getModelInfo();
      expect(info.name).toBe('Xenova/all-MiniLM-L6-v2');
    });

    it('should return embedding dimension', () => {
      const info = service.getModelInfo();
      expect(info.dimension).toBe(384);
    });

    it('should return model version or identifier', () => {
      const info = service.getModelInfo();
      expect(info.version).toBeDefined();
      expect(typeof info.version).toBe('string');
    });
  });

  describe('Error Handling', () => {
    it('should throw error for null input', async () => {
      await expect(service.embed(null as any)).rejects.toThrow();
    });

    it('should throw error for undefined input', async () => {
      await expect(service.embed(undefined as any)).rejects.toThrow();
    });

    it('should throw error for non-string input', async () => {
      await expect(service.embed(123 as any)).rejects.toThrow();
    });
  });

  describe('Semantic Similarity', () => {
    it('should generate similar embeddings for semantically similar text', async () => {
      const text1 = 'database query execution';
      const text2 = 'executing database queries';

      const emb1 = await service.embed(text1);
      const emb2 = await service.embed(text2);

      // Calculate cosine similarity
      const dotProduct = emb1.reduce((sum, val, i) => sum + val * emb2[i], 0);
      const mag1 = Math.sqrt(emb1.reduce((sum, val) => sum + val * val, 0));
      const mag2 = Math.sqrt(emb2.reduce((sum, val) => sum + val * val, 0));
      const similarity = dotProduct / (mag1 * mag2);

      // Similar texts should have high similarity (> 0.7)
      expect(similarity).toBeGreaterThan(0.7);
    });

    it('should generate dissimilar embeddings for unrelated text', async () => {
      const text1 = 'PostgreSQL database operations';
      const text2 = 'chocolate cake recipe';

      const emb1 = await service.embed(text1);
      const emb2 = await service.embed(text2);

      // Calculate cosine similarity
      const dotProduct = emb1.reduce((sum, val, i) => sum + val * emb2[i], 0);
      const mag1 = Math.sqrt(emb1.reduce((sum, val) => sum + val * val, 0));
      const mag2 = Math.sqrt(emb2.reduce((sum, val) => sum + val * val, 0));
      const similarity = dotProduct / (mag1 * mag2);

      // Unrelated texts should have low similarity (< 0.5)
      expect(similarity).toBeLessThan(0.5);
    });
  });
});
