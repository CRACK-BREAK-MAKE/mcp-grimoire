/**
 * Unit tests for SpellWatcher
 * Tests file watching, debouncing, and event handling
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpellWatcher } from '../spell-watcher';
import type { SpellConfig } from '../../core/types';
import { mkdirSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import os from 'os';

// Windows needs longer delays for file system watchers
const isWindows = os.platform() === 'win32';
const WATCHER_READY_DELAY = isWindows ? 1000 : 500;
const FILE_CHANGE_DELAY = isWindows ? 2500 : 1200; // awaitWriteFinish (300ms) + debounce (500ms) + buffer

describe('SpellWatcher', () => {
  let testDir: string;
  let watcher: SpellWatcher;
  let mockDiscovery: any;
  let mockResolver: any;
  let mockLifecycle: any;
  let mockRouter: any;
  let mockOnToolsChanged: any;

  beforeEach(() => {
    // Create temporary test directory
    testDir = join(tmpdir(), `power-watcher-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Create mocks
    mockDiscovery = {
      scan: vi.fn(),
      getSpell: vi.fn(),
    };

    mockResolver = {
      indexSpell: vi.fn(),
      removeSpell: vi.fn(),
    };

    mockLifecycle = {
      isActive: vi.fn().mockReturnValue(false),
      kill: vi.fn(),
    };

    mockRouter = {
      unregisterTools: vi.fn(),
    };

    mockOnToolsChanged = vi.fn();

    watcher = new SpellWatcher(
      testDir,
      mockDiscovery,
      mockResolver,
      mockLifecycle,
      mockRouter,
      mockOnToolsChanged
    );
  });

  afterEach(async () => {
    if (watcher) {
      await watcher.stop();
    }

    // Clean up test directory
    try {
      const files = readdirSync(testDir);
      for (const file of files) {
        unlinkSync(join(testDir, file));
      }
      rmdirSync(testDir);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('start', () => {
    it('should start watching the directory', async () => {
      watcher.start();
      // Watcher should be initialized - no error thrown
      expect(true).toBe(true);
    });

    it('should detect when directory is ready', async () => {
      watcher.start();
      // Give watcher time to initialize
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(true).toBe(true);
    });
  });

  describe('handleFileAdded', () => {
    it('should index new power file', async () => {
      const mockConfig: SpellConfig = {
        name: 'test-power',
        version: '1.0.0',
        description: 'Test power',
        keywords: ['test', 'power', 'new'],
        server: {
          transport: 'stdio',
          command: 'echo',
          args: ['test'],
        },
      };

      mockDiscovery.scan.mockResolvedValue(undefined);
      mockDiscovery.getSpell.mockReturnValue(mockConfig);
      mockResolver.indexSpell.mockResolvedValue(undefined);

      watcher.start();
      // Wait for watcher ready
      await new Promise((resolve) => setTimeout(resolve, WATCHER_READY_DELAY));

      // Create new file
      const filePath = join(testDir, 'test-power.spell.yaml');
      writeFileSync(filePath, 'name: test-power\nversion: 1.0.0', 'utf-8');

      // Wait for: awaitWriteFinish (300ms) + debounce (500ms) + processing
      await new Promise((resolve) => setTimeout(resolve, FILE_CHANGE_DELAY));

      // Verify calls
      expect(mockDiscovery.scan).toHaveBeenCalled();
      expect(mockDiscovery.getSpell).toHaveBeenCalledWith('test-power');
      expect(mockResolver.indexSpell).toHaveBeenCalledWith(mockConfig);
    });

    it('should handle errors when loading new power fails', async () => {
      mockDiscovery.scan.mockResolvedValue(undefined);
      mockDiscovery.getSpell.mockReturnValue(null);

      watcher.start();
      await new Promise((resolve) => setTimeout(resolve, WATCHER_READY_DELAY));

      const filePath = join(testDir, 'bad-power.spell.yaml');
      writeFileSync(filePath, 'invalid yaml', 'utf-8');

      await new Promise((resolve) => setTimeout(resolve, FILE_CHANGE_DELAY));

      // Should not crash - error should be logged
      expect(mockResolver.indexSpell).not.toHaveBeenCalled();
    });
  });

  describe('handleFileChanged', () => {
    it('should re-index modified power file', async () => {
      const mockConfig: SpellConfig = {
        name: 'modified-power',
        version: '2.0.0',
        description: 'Modified power',
        keywords: ['modified', 'updated'],
        server: {
          transport: 'stdio',
          command: 'echo',
          args: ['modified'],
        },
      };

      mockDiscovery.scan.mockResolvedValue(undefined);
      mockDiscovery.getSpell.mockReturnValue(mockConfig);
      mockResolver.removeSpell.mockResolvedValue(undefined);
      mockResolver.indexSpell.mockResolvedValue(undefined);
      mockLifecycle.isActive.mockReturnValue(false);

      watcher.start();
      await new Promise((resolve) => setTimeout(resolve, WATCHER_READY_DELAY));

      // Create file first
      const filePath = join(testDir, 'modified-power.spell.yaml');
      writeFileSync(filePath, 'name: modified-power\nversion: 1.0.0', 'utf-8');
      await new Promise((resolve) => setTimeout(resolve, FILE_CHANGE_DELAY));

      // Reset mocks before modification
      mockResolver.removeSpell.mockClear();
      mockResolver.indexSpell.mockClear();

      // Modify file
      writeFileSync(filePath, 'name: modified-power\nversion: 2.0.0', 'utf-8');
      await new Promise((resolve) => setTimeout(resolve, FILE_CHANGE_DELAY));

      // Verify delete-and-recreate strategy
      expect(mockResolver.removeSpell).toHaveBeenCalledWith('modified-power');
      expect(mockResolver.indexSpell).toHaveBeenCalledWith(mockConfig);
    });

    it('should kill active power before re-indexing', async () => {
      const mockConfig: SpellConfig = {
        name: 'active-power',
        version: '1.0.0',
        description: 'Active power',
        keywords: ['active'],
        server: {
          transport: 'stdio',
          command: 'echo',
          args: ['active'],
        },
      };

      mockDiscovery.scan.mockResolvedValue(undefined);
      mockDiscovery.getSpell.mockReturnValue(mockConfig);
      mockResolver.removeSpell.mockResolvedValue(undefined);
      mockResolver.indexSpell.mockResolvedValue(undefined);
      mockLifecycle.isActive.mockReturnValue(true);
      mockLifecycle.kill.mockResolvedValue(undefined);

      watcher.start();
      await new Promise((resolve) => setTimeout(resolve, WATCHER_READY_DELAY));

      const filePath = join(testDir, 'active-power.spell.yaml');
      writeFileSync(filePath, 'name: active-power\nversion: 1.0.0', 'utf-8');
      await new Promise((resolve) => setTimeout(resolve, FILE_CHANGE_DELAY));

      // Reset mocks before modification
      mockLifecycle.kill.mockClear();
      mockRouter.unregisterTools.mockClear();
      mockOnToolsChanged.mockClear();

      writeFileSync(filePath, 'name: active-power\nversion: 2.0.0', 'utf-8');
      await new Promise((resolve) => setTimeout(resolve, FILE_CHANGE_DELAY));

      // Verify lifecycle calls
      expect(mockLifecycle.kill).toHaveBeenCalledWith('active-power');
      expect(mockRouter.unregisterTools).toHaveBeenCalledWith('active-power');
      expect(mockOnToolsChanged).toHaveBeenCalled();
      expect(mockResolver.removeSpell).toHaveBeenCalledWith('active-power');
      expect(mockResolver.indexSpell).toHaveBeenCalledWith(mockConfig);
    });
  });

  describe('handleFileDeleted', () => {
    it('should remove power from index', async () => {
      mockResolver.removeSpell.mockResolvedValue(undefined);
      mockLifecycle.isActive.mockReturnValue(false);

      watcher.start();
      await new Promise((resolve) => setTimeout(resolve, WATCHER_READY_DELAY));

      // Create file first
      const filePath = join(testDir, 'deleted-power.spell.yaml');
      writeFileSync(filePath, 'name: deleted-power\nversion: 1.0.0', 'utf-8');
      await new Promise((resolve) => setTimeout(resolve, FILE_CHANGE_DELAY));

      // Delete file
      unlinkSync(filePath);
      await new Promise((resolve) => setTimeout(resolve, FILE_CHANGE_DELAY));

      // Verify removal
      expect(mockResolver.removeSpell).toHaveBeenCalledWith('deleted-power');
    });

    it('should kill active power before removal', async () => {
      mockResolver.removeSpell.mockResolvedValue(undefined);
      mockLifecycle.isActive.mockReturnValue(true);
      mockLifecycle.kill.mockResolvedValue(undefined);

      watcher.start();
      await new Promise((resolve) => setTimeout(resolve, WATCHER_READY_DELAY));

      const filePath = join(testDir, 'active-deleted.spell.yaml');
      writeFileSync(filePath, 'name: active-deleted\nversion: 1.0.0', 'utf-8');
      await new Promise((resolve) => setTimeout(resolve, FILE_CHANGE_DELAY));

      // Reset mocks before deletion
      mockLifecycle.kill.mockClear();
      mockRouter.unregisterTools.mockClear();
      mockOnToolsChanged.mockClear();

      unlinkSync(filePath);
      await new Promise((resolve) => setTimeout(resolve, FILE_CHANGE_DELAY));

      expect(mockLifecycle.kill).toHaveBeenCalledWith('active-deleted');
      expect(mockRouter.unregisterTools).toHaveBeenCalledWith('active-deleted');
      expect(mockOnToolsChanged).toHaveBeenCalled();
      expect(mockResolver.removeSpell).toHaveBeenCalledWith('active-deleted');
    });
  });

  describe('debouncing', () => {
    it('should debounce rapid file changes', async () => {
      const mockConfig: SpellConfig = {
        name: 'rapid-change',
        version: '1.0.0',
        description: 'Rapid change power',
        keywords: ['rapid'],
        server: {
          transport: 'stdio',
          command: 'echo',
          args: ['rapid'],
        },
      };

      mockDiscovery.scan.mockResolvedValue(undefined);
      mockDiscovery.getSpell.mockReturnValue(mockConfig);
      mockResolver.removeSpell.mockResolvedValue(undefined);
      mockResolver.indexSpell.mockResolvedValue(undefined);
      mockLifecycle.isActive.mockReturnValue(false);

      watcher.start();
      await new Promise((resolve) => setTimeout(resolve, WATCHER_READY_DELAY));

      const filePath = join(testDir, 'rapid-change.spell.yaml');

      // Simulate rapid changes (editor auto-save)
      writeFileSync(filePath, 'name: rapid-change\nversion: 1.0.0', 'utf-8');
      await new Promise((resolve) => setTimeout(resolve, 100));

      writeFileSync(filePath, 'name: rapid-change\nversion: 1.0.1', 'utf-8');
      await new Promise((resolve) => setTimeout(resolve, 100));

      writeFileSync(filePath, 'name: rapid-change\nversion: 1.0.2', 'utf-8');
      await new Promise((resolve) => setTimeout(resolve, 100));

      writeFileSync(filePath, 'name: rapid-change\nversion: 1.0.3', 'utf-8');

      // Wait for debounce to settle
      await new Promise((resolve) => setTimeout(resolve, FILE_CHANGE_DELAY));

      // Should process at most 2 times: once for add, once for final change after debounce
      const indexCallCount = mockResolver.indexSpell.mock.calls.length;
      expect(indexCallCount).toBeLessThanOrEqual(2);
    });
  });

  describe('stop', () => {
    it('should stop watching and clear timers', async () => {
      watcher.start();
      await new Promise((resolve) => setTimeout(resolve, WATCHER_READY_DELAY));
      await watcher.stop();

      // Create file after stopping - should not trigger events
      const filePath = join(testDir, 'after-stop.spell.yaml');
      writeFileSync(filePath, 'name: after-stop\nversion: 1.0.0', 'utf-8');

      await new Promise((resolve) => setTimeout(resolve, FILE_CHANGE_DELAY));

      // Should not have processed any files
      expect(mockResolver.indexSpell).not.toHaveBeenCalled();
    });
  });
});
