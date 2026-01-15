/**
 * Embedding Storage with MessagePack
 * Persists embeddings to disk with SHA-256 hashing and atomic writes
 *
 * Features:
 * - Binary MessagePack format (60% smaller than JSON)
 * - SHA-256 hashing for cache invalidation
 * - Atomic writes (temp file + rename)
 * - Restrictive file permissions (0600 on Unix)
 * - Fast load/save (<50ms for 100 embeddings)
 *
 * See ADR-0007 for decision rationale
 */

import { readFile, writeFile, rename, mkdir } from 'fs/promises';
import { pack, unpack } from 'msgpackr';
import { dirname } from 'path';
import { getEmbeddingCachePath } from '../utils/paths';

/**
 * Store format version for compatibility checking
 */
const STORE_VERSION = '2.0.0'; // Bumped from 1.0.0 for lifecycle support

/**
 * Model identifier
 */
const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

/**
 * Embedding dimension
 */
const DIMENSION = 384;

/**
 * Metadata for a single embedding
 */
interface EmbeddingMetadata {
  vector: number[];
  hash: string;
  timestamp: number;
}

/**
 * Lifecycle metadata for turn-based cleanup
 * Stores turn counter, usage tracking, and active process PIDs
 */
export interface LifecycleMetadata {
  currentTurn: number;
  usageTracking: Record<string, { lastUsedTurn: number }>;
  activePIDs: Record<string, number>; // spellName → PID
  lastSaved: number; // Timestamp
}

/**
 * Store structure persisted to disk
 */
interface EmbeddingStore {
  version: string;
  modelName: string;
  dimension: number;
  spells: Record<string, EmbeddingMetadata>;
  lifecycle?: LifecycleMetadata; // Optional for v1 compatibility
}

/**
 * Store information
 */
export interface StoreInfo {
  version: string;
  modelName: string;
  dimension: number;
  count: number;
}

/**
 * Embedding storage with MessagePack persistence
 * Manages embeddings for spell configurations
 */
export class EmbeddingStorage {
  private filePath: string;
  private store: EmbeddingStore;
  private loaded = false;

  /**
   * Create embedding storage
   * @param filePath - Path to cache file (defaults to OS-appropriate location)
   */
  constructor(filePath?: string) {
    this.filePath = filePath ?? getEmbeddingCachePath();
    this.store = this.createEmptyStore();
  }

  /**
   * Create empty store with default values
   */
  private createEmptyStore(): EmbeddingStore {
    return {
      version: STORE_VERSION,
      modelName: MODEL_NAME,
      dimension: DIMENSION,
      spells: {},
    };
  }

  /**
   * Load embeddings from disk
   * Creates empty store if file doesn't exist
   * Handles corrupted files gracefully
   */
  public async load(): Promise<void> {
    try {
      const data = await readFile(this.filePath);
      const loaded = unpack(data) as EmbeddingStore;

      // Validate version compatibility and structure
      if (this.isCompatibleVersion(loaded.version) && this.isValidStore(loaded)) {
        // Migrate v1 → v2 if needed
        if (loaded.version === '1.0.0') {
          loaded.version = '2.0.0';
          loaded.lifecycle = {
            currentTurn: 0,
            usageTracking: {},
            activePIDs: {},
            lastSaved: Date.now(),
          };
          console.warn('[Storage] Migrated v1 → v2 store with lifecycle support');
        }

        // CRITICAL FIX: If lifecycle section is corrupted/missing, initialize it
        // This preserves embeddings while fixing lifecycle data
        if (!loaded.lifecycle || typeof loaded.lifecycle !== 'object') {
          loaded.lifecycle = {
            currentTurn: 0,
            usageTracking: {},
            activePIDs: {},
            lastSaved: Date.now(),
          };
          console.warn('[Storage] Lifecycle section missing/corrupted, initialized empty');
        }

        this.store = loaded;
      } else {
        // Version mismatch or invalid structure - start fresh
        console.warn(
          `[Storage] Incompatible or corrupted store (version ${loaded.version}). Starting fresh.`
        );
        this.store = this.createEmptyStore();
      }

      this.loaded = true;
    } catch (error) {
      // File doesn't exist or is corrupted - start with empty store
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist - this is normal on first run
        this.store = this.createEmptyStore();
      } else {
        // Corrupted file or other error
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`Failed to load embeddings: ${errorMessage}. Starting with empty store.`);
        this.store = this.createEmptyStore();
      }

      this.loaded = true;
    }
  }

  /**
   * Check if store version is compatible
   */
  private isCompatibleVersion(version: string): boolean {
    // Support v1 (1.0.0) and v2 (2.0.0)
    return version === '1.0.0' || version === '2.0.0';
  }

  /**
   * Validate store structure to prevent runtime errors
   */
  private isValidStore(store: unknown): store is EmbeddingStore {
    if (store == null || typeof store !== 'object') {
      return false;
    }

    const s = store as Partial<EmbeddingStore>;
    return (
      typeof s.version === 'string' &&
      typeof s.modelName === 'string' &&
      typeof s.dimension === 'number' &&
      s.spells != null &&
      typeof s.spells === 'object'
    );
  }

  /**
   * Save embeddings to disk with atomic write
   * Uses temp file + rename pattern for crash safety
   * Sets restrictive permissions on Unix (0600)
   */
  public async save(): Promise<void> {
    const tempPath = `${this.filePath}.tmp`;

    try {
      // Ensure directory exists with proper permissions
      const dir = dirname(this.filePath);
      await mkdir(dir, { recursive: true, mode: 0o700 });

      // Encode to MessagePack
      const data = pack(this.store);

      // Write to temp file with restrictive permissions from the start
      if (process.platform !== 'win32') {
        // On Unix, write with restrictive permissions immediately
        await writeFile(tempPath, data, { mode: 0o600 });
      } else {
        // On Windows, just write the file
        await writeFile(tempPath, data);
      }

      // Atomic rename
      await rename(tempPath, this.filePath);
    } catch (error) {
      // Clean up temp file on error
      try {
        const { unlink } = await import('fs/promises');
        await unlink(tempPath);
      } catch {
        // Ignore cleanup errors (file might not exist)
      }

      throw new Error(
        `Failed to save embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get embedding for a spell
   * @param spellName - Name of the spell
   * @returns Embedding vector or null if not found
   */
  public get(spellName: string): number[] | null {
    return this.store.spells[spellName]?.vector ?? null;
  }

  /**
   * Get metadata for a spell
   * @param spellName - Name of the spell
   * @returns Metadata or null if not found
   */
  public getMetadata(spellName: string): EmbeddingMetadata | null {
    return this.store.spells[spellName] ?? null;
  }

  /**
   * Set embedding for a spell
   * @param spellName - Name of the spell
   * @param vector - 384-dimensional embedding vector
   * @param hash - SHA-256 hash of spell config (for cache invalidation)
   */
  public set(spellName: string, vector: number[], hash: string): void {
    this.store.spells[spellName] = {
      vector,
      hash,
      timestamp: Date.now(),
    };
  }

  /**
   * Check if spell has cached embedding
   * @param spellName - Name of the spell
   * @returns True if embedding exists
   */
  public has(spellName: string): boolean {
    return spellName in this.store.spells;
  }

  /**
   * Delete embedding for a spell
   * @param spellName - Name of the spell
   */
  public delete(spellName: string): void {
    delete this.store.spells[spellName];
  }

  /**
   * Check if embedding needs update
   * Returns true if:
   * - spell doesn't have cached embedding
   * - Hash has changed (spell config modified)
   *
   * @param spellName - Name of the spell
   * @param currentHash - Current SHA-256 hash of spell config
   * @returns True if embedding needs regeneration
   */
  public needsUpdate(spellName: string, currentHash: string): boolean {
    const metadata = this.store.spells[spellName];

    if (metadata == null) {
      return true; // No cached embedding
    }

    return metadata.hash !== currentHash; // Hash changed
  }

  /**
   * Get all spell names with cached embeddings
   * @returns Array of spell names
   */
  public getAll(): string[] {
    return Object.keys(this.store.spells);
  }

  /**
   * Get store information
   * @returns Store metadata
   */
  public getStoreInfo(): StoreInfo {
    return {
      version: this.store.version ?? STORE_VERSION,
      modelName: this.store.modelName ?? MODEL_NAME,
      dimension: this.store.dimension ?? DIMENSION,
      count: this.store.spells != null ? Object.keys(this.store.spells).length : 0,
    };
  }

  /**
   * Check if store has been loaded
   */
  public isLoaded(): boolean {
    return this.loaded;
  }

  // ==========================================
  // Lifecycle Metadata Management (ADR-0006)
  // ==========================================

  /**
   * Get lifecycle metadata
   */
  public getLifecycleMetadata(): LifecycleMetadata | null {
    return this.store.lifecycle ?? null;
  }

  /**
   * Set lifecycle metadata
   */
  public setLifecycleMetadata(metadata: LifecycleMetadata): void {
    this.store.lifecycle = metadata;
  }

  /**
   * Update lifecycle metadata (partial update)
   * Initializes with defaults if lifecycle section doesn't exist
   */
  public updateLifecycleMetadata(updates: Partial<LifecycleMetadata>): void {
    if (!this.store.lifecycle) {
      // Initialize with defaults
      this.store.lifecycle = {
        currentTurn: 0,
        usageTracking: {},
        activePIDs: {},
        lastSaved: Date.now(),
      };
    }
    Object.assign(this.store.lifecycle, updates);
  }
}
