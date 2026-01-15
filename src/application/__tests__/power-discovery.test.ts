import {SpellDiscovery} from '../spell-discovery';
import type {ConfigLoader} from '../../infrastructure/config-loader';
import type {SpellConfig} from '../../core/types';
import {beforeEach, describe, expect, it} from 'vitest';

// Mock ConfigLoader
class MockConfigLoader implements ConfigLoader {
  private mockConfigs = new Map<string, SpellConfig>();

  setMockConfigs(configs: Map<string, SpellConfig>): void {
    this.mockConfigs = configs;
  }

  async loadAll(): Promise<Map<string, SpellConfig>> {
    return this.mockConfigs;
  }

  async loadOne(_filePath: string): Promise<SpellConfig> {
    throw new Error('Not implemented in mock');
  }
}

describe('SpellDiscovery', () => {
  let discovery: SpellDiscovery;
  let mockLoader: MockConfigLoader;

  beforeEach(() => {
    mockLoader = new MockConfigLoader();
  });

  describe('scan', () => {
    it('should load powers from config loader', async () => {
      // Arrange
      const mockConfigs = new Map([
        [
          'postgres',
          {
            name: 'postgres',
            version: '1.0.0',
            description: 'PostgreSQL',
            keywords: ['database', 'sql', 'query'],
            server: { command: 'npx', args: [] },
          },
        ],
      ]);
      mockLoader.setMockConfigs(mockConfigs);
      discovery = new SpellDiscovery(mockLoader, '/mock/path');

      // Act
      const count = await discovery.scan();

      // Assert
      expect(count).toBe(1);
    });

    it('should return number of loaded powers', async () => {
      // Arrange
      mockLoader.setMockConfigs(new Map());
      discovery = new SpellDiscovery(mockLoader, '/mock/path');

      // Act
      const count = await discovery.scan();

      // Assert
      expect(count).toBe(0);
    });
  });

  describe('getPowers', () => {
    it('should return all loaded powers', async () => {
      // Arrange
      const mockConfigs = new Map([
        ['postgres', { name: 'postgres' } as SpellConfig],
        ['stripe', { name: 'stripe' } as SpellConfig],
      ]);
      mockLoader.setMockConfigs(mockConfigs);
      discovery = new SpellDiscovery(mockLoader, '/mock/path');
      await discovery.scan();

      // Act
      const powers = discovery.getSpells();

      // Assert
      expect(powers.size).toBe(2);
      expect(powers.has('postgres')).toBe(true);
      expect(powers.has('stripe')).toBe(true);
    });
  });

  describe('getPower', () => {
    it('should return specific power config', async () => {
      // Arrange
      const mockConfigs = new Map([
        [
          'postgres',
          {
            name: 'postgres',
            version: '1.0.0',
            description: 'PostgreSQL',
            keywords: ['database', 'sql', 'query'],
            server: { command: 'npx', args: [] },
          },
        ],
      ]);
      mockLoader.setMockConfigs(mockConfigs);
      discovery = new SpellDiscovery(mockLoader, '/mock/path');
      await discovery.scan();

      // Act
      const config = discovery.getSpell('postgres');

      // Assert
      expect(config).toBeDefined();
      expect(config?.name).toBe('postgres');
    });

    it('should return undefined for non-existent power', async () => {
      // Arrange
      mockLoader.setMockConfigs(new Map());
      discovery = new SpellDiscovery(mockLoader, '/mock/path');
      await discovery.scan();

      // Act
      const config = discovery.getSpell('nonexistent');

      // Assert
      expect(config).toBeUndefined();
    });
  });

  describe('hasPower', () => {
    it('should return true if power exists', async () => {
      // Arrange
      const mockConfigs = new Map([['postgres', { name: 'postgres' } as SpellConfig]]);
      mockLoader.setMockConfigs(mockConfigs);
      discovery = new SpellDiscovery(mockLoader, '/mock/path');
      await discovery.scan();

      // Act
      const exists = discovery.hasSpell('postgres');

      // Assert
      expect(exists).toBe(true);
    });

    it('should return false if power does not exist', async () => {
      // Arrange
      mockLoader.setMockConfigs(new Map());
      discovery = new SpellDiscovery(mockLoader, '/mock/path');
      await discovery.scan();

      // Act
      const exists = discovery.hasSpell('nonexistent');

      // Assert
      expect(exists).toBe(false);
    });
  });
});
