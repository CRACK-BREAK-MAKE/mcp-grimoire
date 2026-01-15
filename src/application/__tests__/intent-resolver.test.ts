import { KeywordResolver } from '../intent-resolver';
import type { SpellConfig } from '../../core/types';
import { beforeEach, describe, expect, it } from 'vitest';

describe('KeywordResolver', () => {
  let resolver: KeywordResolver;
  let powers: Map<string, SpellConfig>;

  beforeEach(() => {
    resolver = new KeywordResolver();
    powers = new Map([
      [
        'postgres',
        {
          name: 'postgres',
          version: '1.0.0',
          description: 'PostgreSQL',
          keywords: ['database', 'sql', 'query', 'users', 'postgres'],
          server: { command: 'npx', args: [] },
        },
      ],
      [
        'stripe',
        {
          name: 'stripe',
          version: '1.0.0',
          description: 'Stripe payments',
          keywords: ['payment', 'subscription', 'stripe', 'charge'],
          server: { command: 'npx', args: [] },
        },
      ],
    ]);
  });

  describe('Basic Matching', () => {
    it('should match exact keyword', () => {
      // Act
      const result = resolver.resolve('query database', powers);

      // Assert
      expect(result.status).toBe('found');
      if (result.status === 'found') {
        expect(result.spellName).toBe('postgres');
        expect(result.confidence).toBeGreaterThan(0);
      }
    });

    it('should be case-insensitive', () => {
      // Act
      const result = resolver.resolve('QUERY DATABASE', powers);

      // Assert
      expect(result.status).toBe('found');
      if (result.status === 'found') {
        expect(result.spellName).toBe('postgres');
      }
    });

    it('should match multiple keywords', () => {
      // Act
      const result = resolver.resolve('database query users', powers);

      // Assert
      expect(result.status).toBe('found');
      if (result.status === 'found') {
        expect(result.spellName).toBe('postgres');
        expect(result.confidence).toBeGreaterThan(0.5);
      }
    });
  });

  describe('No Matches', () => {
    it('should return not_found for no keyword matches', () => {
      // Act
      const result = resolver.resolve('hello world', powers);

      // Assert
      expect(result.status).toBe('not_found');
      if (result.status === 'not_found') {
        expect(result.query).toBe('hello world');
      }
    });

    it('should handle empty query', () => {
      // Act
      const result = resolver.resolve('', powers);

      // Assert
      expect(result.status).toBe('not_found');
    });

    it('should handle whitespace-only query', () => {
      // Act
      const result = resolver.resolve('   ', powers);

      // Assert
      expect(result.status).toBe('not_found');
    });
  });

  describe('Confidence Calculation', () => {
    it('should have high confidence for clear winner', () => {
      // Act
      const result = resolver.resolve('database sql query', powers);

      // Assert
      expect(result.status).toBe('found');
      if (result.status === 'found') {
        expect(result.confidence).toBeGreaterThan(0.8);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle single power', () => {
      // Arrange
      const singlePower = new Map([['postgres', powers.get('postgres')!]]);

      // Act
      const result = resolver.resolve('database', singlePower);

      // Assert
      expect(result.status).toBe('found');
      if (result.status === 'found') {
        expect(result.confidence).toBe(1.0);
      }
    });

    it('should handle empty power map', () => {
      // Act
      const result = resolver.resolve('database', new Map());

      // Assert
      expect(result.status).toBe('not_found');
    });
  });
});
