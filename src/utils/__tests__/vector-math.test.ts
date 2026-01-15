/**
 * Tests for vector mathematics utilities
 * Used for cosine similarity calculations in semantic search
 * Following TDD: Write tests first, then implement
 */

import { describe, expect, it } from 'vitest';
import { cosineSimilarity, dotProduct, magnitude, normalizeVector } from '../vector-math';

describe('Vector Math Utilities', () => {
  describe('dotProduct', () => {
    it('should calculate dot product of two vectors', () => {
      const v1 = [1, 2, 3];
      const v2 = [4, 5, 6];
      // 1*4 + 2*5 + 3*6 = 4 + 10 + 18 = 32
      expect(dotProduct(v1, v2)).toBe(32);
    });

    it('should handle zero vectors', () => {
      const v1 = [0, 0, 0];
      const v2 = [1, 2, 3];
      expect(dotProduct(v1, v2)).toBe(0);
    });

    it('should handle negative values', () => {
      const v1 = [1, -2, 3];
      const v2 = [-4, 5, -6];
      // 1*-4 + -2*5 + 3*-6 = -4 + -10 + -18 = -32
      expect(dotProduct(v1, v2)).toBe(-32);
    });

    it('should throw error for vectors of different lengths', () => {
      const v1 = [1, 2, 3];
      const v2 = [4, 5];
      expect(() => dotProduct(v1, v2)).toThrow('must have the same length');
    });

    it('should throw error for empty vectors', () => {
      const v1: number[] = [];
      const v2: number[] = [];
      expect(() => dotProduct(v1, v2)).toThrow('cannot be empty');
    });

    it('should work with high-dimensional vectors (384-dim like embeddings)', () => {
      const v1 = new Array(384).fill(0.1);
      const v2 = new Array(384).fill(0.2);
      // 384 * (0.1 * 0.2) = 384 * 0.02 = 7.68
      expect(dotProduct(v1, v2)).toBeCloseTo(7.68, 2);
    });
  });

  describe('magnitude', () => {
    it('should calculate magnitude of a vector', () => {
      const v = [3, 4];
      // sqrt(3^2 + 4^2) = sqrt(9 + 16) = sqrt(25) = 5
      expect(magnitude(v)).toBe(5);
    });

    it('should handle zero vector', () => {
      const v = [0, 0, 0];
      expect(magnitude(v)).toBe(0);
    });

    it('should handle single element vector', () => {
      const v = [5];
      expect(magnitude(v)).toBe(5);
    });

    it('should handle negative values', () => {
      const v = [-3, -4];
      // sqrt(9 + 16) = 5
      expect(magnitude(v)).toBe(5);
    });

    it('should throw error for empty vector', () => {
      const v: number[] = [];
      expect(() => magnitude(v)).toThrow('cannot be empty');
    });

    it('should work with high-dimensional vectors', () => {
      const v = new Array(384).fill(1);
      // sqrt(384 * 1^2) = sqrt(384) ≈ 19.595
      expect(magnitude(v)).toBeCloseTo(19.595, 2);
    });
  });

  describe('cosineSimilarity', () => {
    it('should calculate cosine similarity between identical vectors', () => {
      const v1 = [1, 2, 3];
      const v2 = [1, 2, 3];
      expect(cosineSimilarity(v1, v2)).toBeCloseTo(1.0, 5);
    });

    it('should calculate cosine similarity between orthogonal vectors', () => {
      const v1 = [1, 0, 0];
      const v2 = [0, 1, 0];
      expect(cosineSimilarity(v1, v2)).toBeCloseTo(0.0, 5);
    });

    it('should calculate cosine similarity between opposite vectors', () => {
      const v1 = [1, 2, 3];
      const v2 = [-1, -2, -3];
      expect(cosineSimilarity(v1, v2)).toBeCloseTo(-1.0, 5);
    });

    it('should calculate cosine similarity for partial overlap', () => {
      const v1 = [1, 1, 0];
      const v2 = [1, 0, 1];
      // dot = 1*1 + 1*0 + 0*1 = 1
      // mag1 = sqrt(1 + 1 + 0) = sqrt(2)
      // mag2 = sqrt(1 + 0 + 1) = sqrt(2)
      // cos = 1 / (sqrt(2) * sqrt(2)) = 1/2 = 0.5
      expect(cosineSimilarity(v1, v2)).toBeCloseTo(0.5, 5);
    });

    it('should throw error for vectors of different lengths', () => {
      const v1 = [1, 2, 3];
      const v2 = [4, 5];
      expect(() => cosineSimilarity(v1, v2)).toThrow('must have the same length');
    });

    it('should throw error when one vector is zero', () => {
      const v1 = [0, 0, 0];
      const v2 = [1, 2, 3];
      expect(() => cosineSimilarity(v1, v2)).toThrow('Zero vector has no direction');
    });

    it('should handle normalized vectors efficiently', () => {
      // If vectors are already normalized (magnitude = 1),
      // cosine similarity should equal dot product
      const v1 = [1 / Math.sqrt(2), 1 / Math.sqrt(2), 0];
      const v2 = [1 / Math.sqrt(2), 0, 1 / Math.sqrt(2)];
      const dot = dotProduct(v1, v2);
      const cosine = cosineSimilarity(v1, v2);
      expect(cosine).toBeCloseTo(dot, 5);
    });

    it('should work with 384-dimensional embedding vectors', () => {
      // Simulate two similar embeddings
      const v1 = new Array(384).fill(0).map((_, i) => Math.sin(i * 0.1));
      const v2 = new Array(384).fill(0).map((_, i) => Math.sin(i * 0.1 + 0.1));
      const similarity = cosineSimilarity(v1, v2);
      // Should be high similarity (> 0.9) since they're similar sine waves
      expect(similarity).toBeGreaterThan(0.9);
    });

    it('should return value between -1 and 1', () => {
      const v1 = [1.5, 2.7, -3.2, 4.1];
      const v2 = [-2.1, 5.3, 1.8, -4.5];
      const similarity = cosineSimilarity(v1, v2);
      expect(similarity).toBeGreaterThanOrEqual(-1);
      expect(similarity).toBeLessThanOrEqual(1);
    });
  });

  describe('normalizeVector', () => {
    it('should normalize a vector to unit length', () => {
      const v = [3, 4];
      const normalized = normalizeVector(v);
      // [3/5, 4/5] = [0.6, 0.8]
      expect(normalized).toEqual([0.6, 0.8]);
      expect(magnitude(normalized)).toBeCloseTo(1.0, 5);
    });

    it('should preserve direction', () => {
      const v = [1, 2, 3];
      const normalized = normalizeVector(v);
      const mag = magnitude(v);
      expect(normalized[0]).toBeCloseTo(v[0] / mag, 5);
      expect(normalized[1]).toBeCloseTo(v[1] / mag, 5);
      expect(normalized[2]).toBeCloseTo(v[2] / mag, 5);
    });

    it('should throw error for zero vector', () => {
      const v = [0, 0, 0];
      expect(() => normalizeVector(v)).toThrow('Cannot normalize zero vector');
    });

    it('should throw error for empty vector', () => {
      const v: number[] = [];
      expect(() => normalizeVector(v)).toThrow('cannot be empty');
    });

    it('should not modify original vector', () => {
      const v = [3, 4];
      const original = [...v];
      normalizeVector(v);
      expect(v).toEqual(original);
    });

    it('should work with high-dimensional vectors', () => {
      const v = new Array(384).fill(2);
      const normalized = normalizeVector(v);
      expect(magnitude(normalized)).toBeCloseTo(1.0, 5);
      // All components should be equal (2 / magnitude)
      const expected = 2 / magnitude(v);
      expect(normalized[0]).toBeCloseTo(expected, 5);
      expect(normalized[383]).toBeCloseTo(expected, 5);
    });
  });

  describe('Performance', () => {
    it('should handle 100 similarity calculations in <50ms', () => {
      const v1 = new Array(384).fill(0).map(() => Math.random());
      const vectors = Array.from({ length: 100 }, () =>
        new Array(384).fill(0).map(() => Math.random())
      );

      const start = Date.now();
      for (const v2 of vectors) {
        cosineSimilarity(v1, v2);
      }
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(50);
    });
  });
});
