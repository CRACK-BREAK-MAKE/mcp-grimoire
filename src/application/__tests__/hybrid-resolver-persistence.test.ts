import {afterEach, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {HybridResolver} from '../hybrid-resolver';
import {EmbeddingService} from '../../infrastructure/embedding-service';
import {EmbeddingStorage} from '../../infrastructure/embedding-storage';
import type {SpellConfig} from '../../core/types';
import {existsSync, unlinkSync} from 'fs';
import {join} from 'path';
import {tmpdir} from 'os';

describe('HybridResolver - Embedding Persistence', () => {
  let resolver: HybridResolver;
  let embeddingService: EmbeddingService;
  let storage: EmbeddingStorage;
  let tempCachePath: string;

  beforeAll(async () => {
    embeddingService = await EmbeddingService.getInstance();
  });

  beforeEach(async () => {
    tempCachePath = join(tmpdir(), `embeddings-test-${Date.now()}.msgpack`);
    storage = new EmbeddingStorage(tempCachePath);
    await storage.load();

    resolver = new HybridResolver(embeddingService, storage);
  });

  afterEach(() => {
    if (existsSync(tempCachePath)) {
      unlinkSync(tempCachePath);
    }
  });

  it('should save embeddings to disk after indexing', async () => {
    const config: SpellConfig = {
      name: 'test-save',
      version: '1.0.0',
      description: 'Test saving embeddings',
      keywords: ['test', 'save', 'disk'],
      server: {
        transport: 'stdio',
        command: 'echo',
        args: ['test'],
      },
    };

    await resolver.indexSpell(config);

    expect(storage.has('test-save')).toBe(true);
    expect(existsSync(tempCachePath)).toBe(true);

    const newStorage = new EmbeddingStorage(tempCachePath);
    await newStorage.load();

    expect(newStorage.has('test-save')).toBe(true);
    const metadata = newStorage.getMetadata('test-save');
    expect(metadata).not.toBeNull();
    expect(metadata!.vector.length).toBe(384);
    expect(metadata!.hash).toBeDefined();
  });

  it('should delete embeddings from disk', async () => {
    const config: SpellConfig = {
      name: 'test-delete',
      version: '1.0.0',
      description: 'Test deleting embeddings',
      keywords: ['test', 'delete'],
      server: {
        transport: 'stdio',
        command: 'echo',
        args: ['test'],
      },
    };

    await resolver.indexSpell(config);
    expect(storage.has('test-delete')).toBe(true);

    await resolver.removeSpell('test-delete');
    expect(storage.has('test-delete')).toBe(false);

    const newStorage = new EmbeddingStorage(tempCachePath);
    await newStorage.load();

    expect(newStorage.has('test-delete')).toBe(false);
  });

  it('should handle create -> modify -> delete workflow', async () => {
    const config1: SpellConfig = {
      name: 'test-lifecycle',
      version: '1.0.0',
      description: 'Initial version',
      keywords: ['test', 'lifecycle', 'initial'],
      server: {
        transport: 'stdio',
        command: 'echo',
        args: ['v1'],
      },
    };

    const config2: SpellConfig = {
      ...config1,
      version: '2.0.0',
      description: 'Modified version',
      keywords: ['test', 'lifecycle', 'modified', 'updated'],
    };

    await resolver.indexSpell(config1);
    let newStorage1 = new EmbeddingStorage(tempCachePath);
    await newStorage1.load();
    expect(newStorage1.has('test-lifecycle')).toBe(true);
    const hash1 = newStorage1.getMetadata('test-lifecycle')!.hash;

    await resolver.removeSpell('test-lifecycle');
    await resolver.indexSpell(config2);

    let newStorage2 = new EmbeddingStorage(tempCachePath);
    await newStorage2.load();
    expect(newStorage2.has('test-lifecycle')).toBe(true);
    const hash2 = newStorage2.getMetadata('test-lifecycle')!.hash;
    expect(hash1).not.toBe(hash2);

    await resolver.removeSpell('test-lifecycle');

    let newStorage3 = new EmbeddingStorage(tempCachePath);
    await newStorage3.load();
    expect(newStorage3.has('test-lifecycle')).toBe(false);
  });
});
