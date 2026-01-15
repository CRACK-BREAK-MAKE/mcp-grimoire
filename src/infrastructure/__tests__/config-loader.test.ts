import {YAMLConfigLoader} from '../config-loader';
import {ConfigurationError} from '../../core/spell-config';
import {join} from 'path';
import {beforeEach, describe, expect, it} from 'vitest';

describe('YAMLConfigLoader', () => {
  let loader: YAMLConfigLoader;
  const fixturesPath = join(__dirname, '../../../tests/fixtures');

  beforeEach(() => {
    loader = new YAMLConfigLoader();
  });

  describe('loadOne', () => {
    it('should load valid YAML config', async () => {
      // Arrange
      const filePath = join(fixturesPath, 'postgres.spell.yaml');

      // Act
      const config = await loader.loadOne(filePath);

      // Assert
      expect(config.name).toBe('postgres');
      expect(config.keywords).toContain('database');
      // @ts-ignore
      expect(config.server.command).toBe('npx');
    });

    it('should throw ConfigurationError for invalid config', async () => {
      // Arrange
      const filePath = join(fixturesPath, 'invalid.spell.yaml');

      // Act & Assert
      await expect(loader.loadOne(filePath)).rejects.toThrow(ConfigurationError);
    });

    it('should throw error for non-existent file', async () => {
      // Arrange
      const filePath = join(fixturesPath, 'nonexistent.spell.yaml');

      // Act & Assert
      await expect(loader.loadOne(filePath)).rejects.toThrow();
    });
  });

  describe('loadAll', () => {
    it('should load all valid configs from directory', async () => {
      // Arrange - fixturesPath has postgres.spell.yaml and invalid.spell.yaml

      // Act
      const configs = await loader.loadAll(fixturesPath);

      // Assert
      expect(configs.size).toBeGreaterThanOrEqual(1); // At least postgres
      expect(configs.has('postgres')).toBe(true);
    });

    it('should return empty map for non-existent directory', async () => {
      // Arrange
      const nonExistentPath = join(fixturesPath, 'does-not-exist');

      // Act
      const configs = await loader.loadAll(nonExistentPath);

      // Assert
      expect(configs.size).toBe(0);
    });

    it('should skip invalid configs and continue', async () => {
      // Act
      const configs = await loader.loadAll(fixturesPath);

      // Assert - should load valid ones, skip invalid
      expect(configs.has('postgres')).toBe(true);
      expect(configs.has('invalid')).toBe(false); // Invalid should be skipped
    });
  });
});
