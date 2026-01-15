import { isSpellConfig } from '../types';
import { describe, expect, it } from 'vitest';

describe('Type Guards', () => {
  describe('isSpellConfig', () => {
    it('should return true for valid config', () => {
      // Arrange
      const config = {
        name: 'postgres',
        version: '1.0.0',
        description: 'PostgreSQL operations',
        keywords: ['database', 'sql', 'postgres'],
        server: {
          command: 'npx',
          args: ['-y', 'postgres-mcp'],
        },
      };

      // Act
      const result = isSpellConfig(config);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for missing name', () => {
      // Arrange
      const config = {
        version: '1.0.0',
        description: 'Test',
        keywords: ['test', 'keyword', 'another'],
        server: { command: 'echo', args: [] },
      };

      // Act
      const result = isSpellConfig(config);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for insufficient keywords', () => {
      // Arrange
      const config = {
        name: 'test',
        version: '1.0.0',
        description: 'Test',
        keywords: ['one', 'two'], // Only 2, need at least 3
        server: { command: 'echo', args: [] },
      };

      // Act
      const result = isSpellConfig(config);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for null input', () => {
      // Act
      const result = isSpellConfig(null);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for non-object input', () => {
      // Assert
      expect(isSpellConfig('string')).toBe(false);
      expect(isSpellConfig(123)).toBe(false);
      expect(isSpellConfig(undefined)).toBe(false);
    });
  });
});
