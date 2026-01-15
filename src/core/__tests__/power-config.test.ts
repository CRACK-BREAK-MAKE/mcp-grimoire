import {ConfigurationError, validateSpellConfig} from '../spell-config';
import type {SpellConfig} from '../types';
import {describe, expect, it} from 'vitest';

describe('SpellConfig Validation', () => {
  describe('validateSpellConfig', () => {
    it('should accept valid configuration', () => {
      // Arrange
      const validConfig: SpellConfig = {
        name: 'postgres',
        version: '1.0.0',
        description: 'PostgreSQL operations',
        keywords: ['database', 'sql', 'query'],
        server: {
          command: 'npx',
          args: ['-y', 'postgres-mcp'],
        },
      };

      // Act & Assert
      expect(() => validateSpellConfig(validConfig)).not.toThrow();
    });

    it('should throw when name is empty', () => {
      // Arrange
      const config = {
        name: '',
        version: '1.0.0',
        description: 'Test',
        keywords: ['one', 'two', 'three'],
        server: { command: 'echo', args: [] },
      } as SpellConfig;

      // Act & Assert
      expect(() => validateSpellConfig(config)).toThrow(ConfigurationError);
      expect(() => validateSpellConfig(config)).toThrow('Name is required');
    });

    it('should throw when name has invalid characters', () => {
      // Arrange
      const config = {
        name: 'Invalid Name!',
        version: '1.0.0',
        description: 'Test',
        keywords: ['one', 'two', 'three'],
        server: { command: 'echo', args: [] },
      } as SpellConfig;

      // Act & Assert
      expect(() => validateSpellConfig(config)).toThrow(ConfigurationError);
      expect(() => validateSpellConfig(config)).toThrow('alphanumeric with hyphens');
    });

    it('should throw when keywords array has less than 3 items', () => {
      // Arrange
      const config = {
        name: 'test',
        version: '1.0.0',
        description: 'Test',
        keywords: ['one', 'two'],
        server: { command: 'echo', args: [] },
      } as SpellConfig;

      // Act & Assert
      expect(() => validateSpellConfig(config)).toThrow(ConfigurationError);
      expect(() => validateSpellConfig(config)).toThrow('At least 3 keywords required');
    });

    it('should throw when keywords array has more than 20 items', () => {
      // Arrange
      const keywords = Array.from({ length: 21 }, (_, i) => `keyword${i}`);
      const config = {
        name: 'test',
        version: '1.0.0',
        description: 'Test',
        keywords,
        server: { command: 'echo', args: [] },
      } as SpellConfig;

      // Act & Assert
      expect(() => validateSpellConfig(config)).toThrow(ConfigurationError);
      expect(() => validateSpellConfig(config)).toThrow('Maximum 20 keywords');
    });

    it('should accept SSE transport configuration', () => {
      // Arrange
      const sseConfig: SpellConfig = {
        name: 'test-sse',
        version: '1.0.0',
        description: 'SSE transport test',
        keywords: ['test', 'sse', 'remote'],
        server: {
          transport: 'sse',
          url: 'http://127.0.0.1:8000/sse',
        },
      };

      // Act & Assert
      expect(() => validateSpellConfig(sseConfig)).not.toThrow();
    });

    it('should accept HTTP transport configuration', () => {
      // Arrange
      const httpConfig: SpellConfig = {
        name: 'test-http',
        version: '1.0.0',
        description: 'HTTP transport test',
        keywords: ['test', 'http', 'remote'],
        server: {
          transport: 'http',
          url: 'http://0.0.0.0:7777/mcp',
        },
      };

      // Act & Assert
      expect(() => validateSpellConfig(httpConfig)).not.toThrow();
    });

    it('should throw when SSE transport missing url', () => {
      // Arrange
      // @ts-ignore
      const config = {
        name: 'test',
        version: '1.0.0',
        description: 'Test',
        keywords: ['one', 'two', 'three'],
        server: { transport: 'sse' },
      } as SpellConfig;

      // Act & Assert
      expect(() => validateSpellConfig(config)).toThrow(ConfigurationError);
      expect(() => validateSpellConfig(config)).toThrow('Server url required for sse transport');
    });

    it('should throw when HTTP transport missing url', () => {
      // Arrange
      // @ts-ignore
      const config = {
        name: 'test',
        version: '1.0.0',
        description: 'Test',
        keywords: ['one', 'two', 'three'],
        server: { transport: 'http' },
      } as SpellConfig;

      // Act & Assert
      expect(() => validateSpellConfig(config)).toThrow(ConfigurationError);
      expect(() => validateSpellConfig(config)).toThrow('Server url required for http transport');
    });

    it('should throw when transport type is invalid', () => {
      // Arrange
      // @ts-ignore
      const config = {
        name: 'test',
        version: '1.0.0',
        description: 'Test',
        keywords: ['one', 'two', 'three'],
        server: { transport: 'websocket', url: 'ws://localhost' },
      } as SpellConfig;

      // Act & Assert
      expect(() => validateSpellConfig(config)).toThrow(ConfigurationError);
      expect(() => validateSpellConfig(config)).toThrow('Invalid transport type');
    });

    it('should throw when SSE/HTTP url format is invalid', () => {
      // Arrange
      const config = {
        name: 'test',
        version: '1.0.0',
        description: 'Test',
        keywords: ['one', 'two', 'three'],
        server: { transport: 'sse', url: 'not-a-valid-url' },
      } as SpellConfig;

      // Act & Assert
      expect(() => validateSpellConfig(config)).toThrow(ConfigurationError);
      expect(() => validateSpellConfig(config)).toThrow('Invalid URL format');
    });

    it('should default to stdio transport when not specified', () => {
      // Arrange
      const config: SpellConfig = {
        name: 'test',
        version: '1.0.0',
        description: 'Test',
        keywords: ['one', 'two', 'three'],
        server: {
          command: 'npx',
          args: ['-y', 'test-server'],
        },
      };

      // Act & Assert - should not throw (stdio is default)
      expect(() => validateSpellConfig(config)).not.toThrow();
    });
  });
});
