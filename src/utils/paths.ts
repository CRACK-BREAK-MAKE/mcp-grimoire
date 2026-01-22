/**
 * Cross-Platform Path Utilities
 * Uses env-paths for OS-appropriate directory resolution
 * See ADR-0008 for decision rationale
 */

import { join, resolve } from 'path';
import { homedir, tmpdir } from 'os';
import { mkdir, chmod } from 'fs/promises';

// Type definition for env-paths return value
interface EnvPaths {
  config: string;
  cache: string;
  log: string;
  data: string;
  temp: string;
}

// Lazy-load env-paths (ESM-only package) to avoid Jest issues
// env-paths is small (2.4KB) so dynamic import overhead is negligible
let pathsCache: EnvPaths | null = null;

async function getEnvPaths(): Promise<EnvPaths> {
  if (pathsCache == null) {
    // Check for GRIMOIRE_HOME override first (testing/custom installations)
    const overrideDir = process.env.GRIMOIRE_HOME;

    if (overrideDir != null && overrideDir !== '') {
      // Use custom directory instead of env-paths
      const grimoireDir = resolve(overrideDir);
      pathsCache = {
        config: grimoireDir,
        cache: grimoireDir,
        log: grimoireDir,
        data: grimoireDir,
        temp: join(grimoireDir, 'tmp'),
      };
    } else {
      // Use env-paths for OS-appropriate directories
      const envPaths = (await import('env-paths')).default;
      pathsCache = envPaths('grimoire', { suffix: '' });
    }
  }
  return pathsCache;
}

// For synchronous access in tests and initialization
// This will be populated on first async call or can be initialized explicitly
let syncPaths: EnvPaths | null = null;

/**
 * Initialize paths synchronously (call this at app startup)
 * Required because env-paths is ESM-only
 * Respects GRIMOIRE_HOME environment variable if set
 */
export async function initializePaths(): Promise<void> {
  syncPaths = await getEnvPaths();
}

// Helper to get paths (falls back to platform-specific logic if not initialized)
// Following Claude Code convention: use ~/.grimoire on all platforms
// Supports GRIMOIRE_HOME environment variable for testing/custom installations
function getPaths(): EnvPaths {
  // Use cached value if available (either from async init or previous sync call)
  if (syncPaths != null) return syncPaths;
  if (pathsCache != null) return pathsCache;

  // No cache - compute paths and cache for future calls
  // Check for GRIMOIRE_HOME environment variable override (for testing/custom installations)
  const overrideDir = process.env.GRIMOIRE_HOME;

  const grimoireDir =
    overrideDir != null && overrideDir !== ''
      ? resolve(overrideDir) // Use absolute path from override
      : join(homedir(), '.grimoire'); // Default: ~/.grimoire following Claude Code convention

  const paths = {
    config: grimoireDir,
    cache: grimoireDir,
    log: grimoireDir,
    data: grimoireDir,
    temp:
      overrideDir != null && overrideDir !== ''
        ? join(grimoireDir, 'tmp') // Use subdirectory for test isolation
        : join(tmpdir(), 'grimoire'), // Default: system temp directory
  };

  // Cache for future sync calls
  syncPaths = paths;
  return paths;
}

/**
 * Paths for MCP Grimoire
 * Following Claude Code convention: use ~/.grimoire on all platforms
 *
 * All platforms: ~/.grimoire/
 */
export const PATHS = {
  get config() {
    return getPaths().config;
  },
  get cache() {
    return getPaths().cache;
  },
  get log() {
    return getPaths().log;
  },
  get data() {
    return getPaths().data;
  },
  get temp() {
    return getPaths().temp;
  },
} as const;

/**
 * Get directory where .spell.yaml files are stored
 * Returns: ~/.grimoire/ (all files in root, no subdirectory)
 */
export function getSpellDirectory(): string {
  return PATHS.config;
}

/**
 * Get full path to embedding cache file
 * Returns: {cache}/embeddings.msgpack
 */
export function getEmbeddingCachePath(): string {
  return join(PATHS.cache, 'embeddings.msgpack');
}

/**
 * Reset paths cache - Used in tests to pick up GRIMOIRE_HOME changes
 * Call this after setting/unsetting GRIMOIRE_HOME environment variable
 *
 * @example
 * ```typescript
 * process.env.GRIMOIRE_HOME = '/test/dir';
 * resetPathsCache();
 * // Now getSpellDirectory() will return '/test/dir'
 * ```
 */
export function resetPathsCache(): void {
  syncPaths = null;
  pathsCache = null;
}

/**
 * Ensure all required directories exist with proper permissions
 * Safe to call multiple times (idempotent)
 *
 * On Unix systems, sets restrictive permissions:
 * - Directories: 0700 (owner read/write/execute only)
 * - Files: 0600 (owner read/write only)
 *
 * On Windows, inherits ACLs from parent directory
 *
 * Also creates .env template file if it doesn't exist
 * See ADR-0015 for environment variable resolution strategy
 *
 * @throws Error if directory creation fails
 */
export async function ensureDirectories(): Promise<void> {
  const grimoireDir = PATHS.config;

  try {
    // Create grimoire directory
    // Since config/cache/log all point to same dir, just create once
    await mkdir(grimoireDir, { recursive: true });

    // Set restrictive permissions on Unix systems
    // Windows uses ACL inheritance from parent
    if (process.platform !== 'win32') {
      await chmod(grimoireDir, 0o700); // Owner read/write/execute only
    }

    // Create .env template if it doesn't exist (ADR-0015)
    // Lazy load to avoid circular dependency
    const { createEnvTemplate } = await import('../infrastructure/env-manager');
    const envPath = join(grimoireDir, '.env');
    await createEnvTemplate(envPath);

    // Success (no logging here - gateway will log)
  } catch (error) {
    // Re-throw with more context
    throw new Error(
      `Cannot create grimoire directory at ${grimoireDir}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
