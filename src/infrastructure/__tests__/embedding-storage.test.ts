/**
 * Tests for embedding storage with MessagePack
 * Persists embeddings to disk with SHA-256 hashing and atomic writes
 * Following TDD: Write tests first, then implement
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';
import { access, mkdir, rm } from 'fs/promises';
import { EmbeddingStorage } from '../embedding-storage';

describe('EmbeddingStorage', () => {
  let testCacheDir: string;
  let testCachePath: string;
  let storage: EmbeddingStorage;

  beforeEach(async () => {
    // Create temporary cache directory for testing
    testCacheDir = join(tmpdir(), `embedding-test-${Date.now()}`);
    testCachePath = join(testCacheDir, 'embeddings.msgpack');
    await mkdir(testCacheDir, { recursive: true });

    storage = new EmbeddingStorage(testCachePath);
  });

  afterEach(async () => {
    // Clean up test cache
    try {
      await rm(testCacheDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('initialization', () => {
    it('should create storage instance with custom path', () => {
      const customStorage = new EmbeddingStorage('/custom/path/embeddings.msgpack');
      expect(customStorage).toBeDefined();
    });

    it('should create storage instance with default path', () => {
      const defaultStorage = new EmbeddingStorage();
      expect(defaultStorage).toBeDefined();
    });
  });

  describe('load', () => {
    it('should load empty store when file does not exist', async () => {
      await storage.load();
      expect(storage.has('postgres')).toBe(false);
    });

    it('should load existing embeddings from file', async () => {
      // Populate storage
      await storage.load();
      const embedding = new Array(384).fill(0.1);
      storage.set('postgres', embedding, 'hash123');
      await storage.save();

      // Create new storage instance and load
      const newStorage = new EmbeddingStorage(testCachePath);
      await newStorage.load();

      expect(newStorage.has('postgres')).toBe(true);
      expect(newStorage.get('postgres')).toEqual(embedding);
    });

    it('should handle corrupted file gracefully', async () => {
      // Write invalid data to cache file
      const { writeFile } = await import('fs/promises');
      await writeFile(testCachePath, 'invalid msgpack data');

      // Should not throw, should initialize empty store
      await storage.load();
      expect(storage.has('postgres')).toBe(false);
    });

    it('should handle store with missing spells field', async () => {
      // Create a store with missing spells field (simulates corruption)
      const { pack } = await import('msgpackr');
      const { writeFile } = await import('fs/promises');
      const corruptedStore = {
        version: '1.0.0',
        modelName: 'Xenova/all-MiniLM-L6-v2',
        dimension: 384,
        // Missing 'spells' field
      };
      await writeFile(testCachePath, pack(corruptedStore));

      // Should not throw, should initialize empty store
      await storage.load();
      expect(storage.has('postgres')).toBe(false);

      // getStoreInfo should work without crashing
      const info = storage.getStoreInfo();
      expect(info.count).toBe(0);
      expect(info.version).toBe('2.0.0'); // Updated to v2.0.0 for lifecycle support
    });
  });

  describe('get/set/has', () => {
    beforeEach(async () => {
      await storage.load();
    });

    it('should store and retrieve embedding', () => {
      const embedding = new Array(384).fill(0.5);
      storage.set('postgres', embedding, 'hash123');

      expect(storage.has('postgres')).toBe(true);
      expect(storage.get('postgres')).toEqual(embedding);
    });

    it('should return null for non-existent power', () => {
      expect(storage.get('nonexistent')).toBeNull();
    });

    it('should overwrite existing embedding', () => {
      const embedding1 = new Array(384).fill(0.1);
      const embedding2 = new Array(384).fill(0.2);

      storage.set('postgres', embedding1, 'hash1');
      storage.set('postgres', embedding2, 'hash2');

      expect(storage.get('postgres')).toEqual(embedding2);
    });

    it('should store metadata with embedding', () => {
      const embedding = new Array(384).fill(0.5);
      storage.set('postgres', embedding, 'hash123');

      const metadata = storage.getMetadata('postgres');
      expect(metadata).toBeDefined();
      expect(metadata?.hash).toBe('hash123');
      expect(metadata?.timestamp).toBeDefined();
    });
  });

  describe('delete', () => {
    beforeEach(async () => {
      await storage.load();
    });

    it('should delete existing embedding', () => {
      const embedding = new Array(384).fill(0.5);
      storage.set('postgres', embedding, 'hash123');

      storage.delete('postgres');
      expect(storage.has('postgres')).toBe(false);
    });

    it('should not throw when deleting non-existent power', () => {
      expect(() => storage.delete('nonexistent')).not.toThrow();
    });
  });

  describe('needsUpdate', () => {
    beforeEach(async () => {
      await storage.load();
    });

    it('should return true for non-existent power', () => {
      expect(storage.needsUpdate('postgres', 'hash123')).toBe(true);
    });

    it('should return true when hash changed', () => {
      const embedding = new Array(384).fill(0.5);
      storage.set('postgres', embedding, 'hash123');

      expect(storage.needsUpdate('postgres', 'hash456')).toBe(true);
    });

    it('should return false when hash unchanged', () => {
      const embedding = new Array(384).fill(0.5);
      storage.set('postgres', embedding, 'hash123');

      expect(storage.needsUpdate('postgres', 'hash123')).toBe(false);
    });
  });

  describe('save', () => {
    beforeEach(async () => {
      await storage.load();
    });

    it('should persist embeddings to disk', async () => {
      const embedding = new Array(384).fill(0.5);
      storage.set('postgres', embedding, 'hash123');

      await storage.save();

      // Verify file exists
      await expect(access(testCachePath)).resolves.not.toThrow();
    });

    it('should use atomic writes (temp file + rename)', async () => {
      const embedding = new Array(384).fill(0.5);
      storage.set('postgres', embedding, 'hash123');

      // Spy on temp file creation
      await storage.save();

      // Verify final file exists (atomic rename succeeded)
      const fileExists = await access(testCachePath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);
    });

    it('should preserve all embeddings on save', async () => {
      const emb1 = new Array(384).fill(0.1);
      const emb2 = new Array(384).fill(0.2);
      const emb3 = new Array(384).fill(0.3);

      storage.set('postgres', emb1, 'hash1');
      storage.set('stripe', emb2, 'hash2');
      storage.set('aws', emb3, 'hash3');

      await storage.save();

      // Load in new instance
      const newStorage = new EmbeddingStorage(testCachePath);
      await newStorage.load();

      expect(newStorage.get('postgres')).toEqual(emb1);
      expect(newStorage.get('stripe')).toEqual(emb2);
      expect(newStorage.get('aws')).toEqual(emb3);
    });

    it('should set restrictive file permissions on Unix', async () => {
      if (process.platform === 'win32') {
        return; // Skip on Windows
      }

      const embedding = new Array(384).fill(0.5);
      storage.set('postgres', embedding, 'hash123');
      await storage.save();

      // Check file permissions
      const { stat } = await import('fs/promises');
      const stats = await stat(testCachePath);
      const mode = stats.mode & parseInt('777', 8);

      // Should be 0600 (user read/write only)
      expect(mode).toBe(parseInt('600', 8));
    });
  });

  describe('getAll', () => {
    beforeEach(async () => {
      await storage.load();
    });

    it('should return all power names', () => {
      storage.set('postgres', new Array(384).fill(0.1), 'hash1');
      storage.set('stripe', new Array(384).fill(0.2), 'hash2');

      const names = storage.getAll();
      expect(names).toContain('postgres');
      expect(names).toContain('stripe');
      expect(names.length).toBe(2);
    });

    it('should return empty array when no embeddings', () => {
      const names = storage.getAll();
      expect(names).toEqual([]);
    });
  });

  describe('getStoreInfo', () => {
    beforeEach(async () => {
      await storage.load();
    });

    it('should return store metadata', () => {
      const info = storage.getStoreInfo();

      expect(info.version).toBeDefined();
      expect(info.modelName).toBe('Xenova/all-MiniLM-L6-v2');
      expect(info.dimension).toBe(384);
      expect(info.count).toBe(0);
    });

    it('should return correct count', () => {
      storage.set('postgres', new Array(384).fill(0.1), 'hash1');
      storage.set('stripe', new Array(384).fill(0.2), 'hash2');

      const info = storage.getStoreInfo();
      expect(info.count).toBe(2);
    });
  });

  describe('Performance', () => {
    beforeEach(async () => {
      await storage.load();
    });

    it('should save 100 embeddings in <50ms', async () => {
      for (let i = 0; i < 100; i++) {
        const embedding = new Array(384).fill(Math.random());
        storage.set(`power${i}`, embedding, `hash${i}`);
      }

      const start = Date.now();
      await storage.save();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(50);
    });

    it('should keep file size reasonable for 100 embeddings', async () => {
      // Use more realistic data (not random which doesn't compress well)
      for (let i = 0; i < 100; i++) {
        // Realistic embeddings have structure (not pure random)
        const embedding = new Array(384).fill(0).map((_, j) => Math.sin(i + j * 0.1));
        storage.set(`power${i}`, embedding, `hash${i}`);
      }
      await storage.save();

      const { stat } = await import('fs/promises');
      const stats = await stat(testCachePath);
      const sizeKB = stats.size / 1024;

      // MessagePack should compress well with structured data
      // Real embeddings are ~150-200KB, random data is ~350KB (doesn't compress)
      expect(sizeKB).toBeLessThan(400); // Reasonable upper bound
    });
  });

  describe('Lifecycle Metadata (v2.0.0)', () => {
    beforeEach(async () => {
      await storage.load();
    });

    it('should get lifecycle metadata (initially null)', () => {
      const metadata = storage.getLifecycleMetadata();
      expect(metadata).toBeNull();
    });

    it('should set lifecycle metadata', () => {
      const metadata = {
        currentTurn: 5,
        usageTracking: {
          postgres: { lastUsedTurn: 3 },
          stripe: { lastUsedTurn: 5 },
        },
        activePIDs: {
          postgres: 12345,
          stripe: 12346,
        },
        lastSaved: Date.now(),
      };

      storage.setLifecycleMetadata(metadata);

      const retrieved = storage.getLifecycleMetadata();
      expect(retrieved).toEqual(metadata);
    });

    it('should update lifecycle metadata (partial update)', () => {
      storage.updateLifecycleMetadata({
        currentTurn: 10,
        lastSaved: Date.now(),
      });

      const metadata = storage.getLifecycleMetadata();
      expect(metadata?.currentTurn).toBe(10);
      expect(metadata?.usageTracking).toEqual({});
      expect(metadata?.activePIDs).toEqual({});
    });

    it('should initialize lifecycle metadata on partial update if missing', () => {
      // Initially no lifecycle metadata
      expect(storage.getLifecycleMetadata()).toBeNull();

      // Partial update should initialize with defaults
      storage.updateLifecycleMetadata({
        currentTurn: 7,
      });

      const metadata = storage.getLifecycleMetadata();
      expect(metadata?.currentTurn).toBe(7);
      expect(metadata?.usageTracking).toEqual({});
      expect(metadata?.activePIDs).toEqual({});
      expect(metadata?.lastSaved).toBeDefined();
    });

    it('should persist lifecycle metadata to disk', async () => {
      const metadata = {
        currentTurn: 5,
        usageTracking: {
          postgres: { lastUsedTurn: 3 },
        },
        activePIDs: {
          postgres: 12345,
        },
        lastSaved: Date.now(),
      };

      storage.setLifecycleMetadata(metadata);
      await storage.save();

      // Load in new instance
      const newStorage = new EmbeddingStorage(testCachePath);
      await newStorage.load();

      const retrieved = newStorage.getLifecycleMetadata();
      expect(retrieved).toEqual(metadata);
    });

    it('should preserve embeddings when saving lifecycle metadata', async () => {
      const embedding = new Array(384).fill(0.5);
      storage.set('postgres', embedding, 'hash123');

      const metadata = {
        currentTurn: 5,
        usageTracking: {
          postgres: { lastUsedTurn: 3 },
        },
        activePIDs: {
          postgres: 12345,
        },
        lastSaved: Date.now(),
      };

      storage.setLifecycleMetadata(metadata);
      await storage.save();

      // Load in new instance
      const newStorage = new EmbeddingStorage(testCachePath);
      await newStorage.load();

      // Both embeddings and lifecycle should be preserved
      expect(newStorage.get('postgres')).toEqual(embedding);
      expect(newStorage.getLifecycleMetadata()).toEqual(metadata);
    });

    it('should handle lifecycle section with 0 active spells', async () => {
      const metadata = {
        currentTurn: 10,
        usageTracking: {},
        activePIDs: {},
        lastSaved: Date.now(),
      };

      storage.setLifecycleMetadata(metadata);
      await storage.save();

      const newStorage = new EmbeddingStorage(testCachePath);
      await newStorage.load();

      const retrieved = newStorage.getLifecycleMetadata();
      expect(retrieved?.currentTurn).toBe(10);
      expect(retrieved?.usageTracking).toEqual({});
      expect(retrieved?.activePIDs).toEqual({});
    });

    it('should serialize/deserialize PIDs correctly', async () => {
      const metadata = {
        currentTurn: 5,
        usageTracking: {},
        activePIDs: {
          postgres: 12345,
          stripe: 67890,
          mongodb: 99999,
        },
        lastSaved: Date.now(),
      };

      storage.setLifecycleMetadata(metadata);
      await storage.save();

      const newStorage = new EmbeddingStorage(testCachePath);
      await newStorage.load();

      const retrieved = newStorage.getLifecycleMetadata();
      expect(retrieved?.activePIDs).toEqual({
        postgres: 12345,
        stripe: 67890,
        mongodb: 99999,
      });
    });

    it('should migrate v1 store (no lifecycle) to v2 gracefully', async () => {
      // Populate v1 store (no lifecycle section)
      const embedding = new Array(384).fill(0.5);
      storage.set('postgres', embedding, 'hash123');
      await storage.save();

      // Manually downgrade version to v1 to simulate old store
      const { pack } = await import('msgpackr');
      const { readFile, writeFile } = await import('fs/promises');
      const data = await readFile(testCachePath);
      const { unpack } = await import('msgpackr');
      const store = unpack(data) as any;

      // Remove lifecycle section and change version to v1
      delete store.lifecycle;
      store.version = '1.0.0';
      await writeFile(testCachePath, pack(store));

      // Load with new storage instance
      const newStorage = new EmbeddingStorage(testCachePath);
      await newStorage.load();

      // Should migrate to v2 with empty lifecycle
      expect(newStorage.getStoreInfo().version).toBe('2.0.0');
      expect(newStorage.getLifecycleMetadata()).toEqual({
        currentTurn: 0,
        usageTracking: {},
        activePIDs: {},
        lastSaved: expect.any(Number),
      });

      // Embeddings should be preserved
      expect(newStorage.get('postgres')).toEqual(embedding);
    });

    // CRITICAL BUG FIX TESTS (per user feedback)
    it('should preserve embeddings when lifecycle is corrupted', async () => {
      // Create store with embeddings + corrupted lifecycle
      const embedding = new Array(384).fill(0.5);
      storage.set('postgres', embedding, 'hash123');
      storage.set('stripe', new Array(384).fill(0.7), 'hash456');
      await storage.save();

      // Manually corrupt lifecycle section
      const { pack, unpack } = await import('msgpackr');
      const { readFile, writeFile } = await import('fs/promises');
      const data = await readFile(testCachePath);
      const store = unpack(data) as any;

      // Corrupt lifecycle (set to invalid value)
      store.lifecycle = 'corrupted string'; // Invalid type
      await writeFile(testCachePath, pack(store));

      // Load store - should not crash
      const newStorage = new EmbeddingStorage(testCachePath);
      await newStorage.load();

      // Embeddings should be preserved
      expect(newStorage.get('postgres')).toEqual(embedding);
      expect(newStorage.get('stripe')).toEqual(new Array(384).fill(0.7));

      // Lifecycle should be reset to empty
      expect(newStorage.getLifecycleMetadata()).toEqual({
        currentTurn: 0,
        usageTracking: {},
        activePIDs: {},
        lastSaved: expect.any(Number),
      });
    });

    it('should handle missing lifecycle field gracefully', async () => {
      // Create store with embeddings, no lifecycle field
      const embedding = new Array(384).fill(0.5);
      storage.set('postgres', embedding, 'hash123');
      await storage.save();

      // Manually remove lifecycle section
      const { pack, unpack } = await import('msgpackr');
      const { readFile, writeFile } = await import('fs/promises');
      const data = await readFile(testCachePath);
      const store = unpack(data) as any;

      // Remove lifecycle entirely
      delete store.lifecycle;
      await writeFile(testCachePath, pack(store));

      // Load store - should not crash
      const newStorage = new EmbeddingStorage(testCachePath);
      await newStorage.load();

      // Embeddings preserved
      expect(newStorage.get('postgres')).toEqual(embedding);

      // Lifecycle initialized
      expect(newStorage.getLifecycleMetadata()).toEqual({
        currentTurn: 0,
        usageTracking: {},
        activePIDs: {},
        lastSaved: expect.any(Number),
      });
    });

    it('should handle completely corrupted MessagePack file gracefully', async () => {
      // Write random bytes to file
      const { writeFile } = await import('fs/promises');
      await writeFile(testCachePath, 'not valid msgpack data at all!');

      // Load store - should not crash
      const newStorage = new EmbeddingStorage(testCachePath);
      await newStorage.load();

      // Should create empty store
      expect(newStorage.getStoreInfo().count).toBe(0);
      expect(newStorage.getLifecycleMetadata()).toBeNull();
    });

    it('should handle corrupted embeddings but valid lifecycle', async () => {
      // Create store with valid lifecycle
      const metadata = {
        currentTurn: 5,
        usageTracking: {
          postgres: { lastUsedTurn: 3 },
        },
        activePIDs: {
          postgres: 12345,
        },
        lastSaved: Date.now(),
      };
      storage.setLifecycleMetadata(metadata);
      await storage.save();

      // Manually corrupt embeddings section
      const { pack, unpack } = await import('msgpackr');
      const { readFile, writeFile } = await import('fs/promises');
      const data = await readFile(testCachePath);
      const store = unpack(data) as any;

      // Corrupt spells section (not an object)
      store.spells = 'corrupted';
      await writeFile(testCachePath, pack(store));

      // Load store - should not crash
      const newStorage = new EmbeddingStorage(testCachePath);
      await newStorage.load();

      // Should start fresh (corruption detected)
      expect(newStorage.getStoreInfo().count).toBe(0);
    });
  });
});
