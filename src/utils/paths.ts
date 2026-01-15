/**
 * Cross-Platform Path Utilities
 * Uses env-paths for OS-appropriate directory resolution
 * See ADR-0008 for decision rationale
 */

import { join } from 'path';
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
    const envPaths = (await import('env-paths')).default;
    pathsCache = envPaths('grimoire', { suffix: '' });
  }
  return pathsCache;
}

// For synchronous access in tests and initialization
// This will be populated on first async call or can be initialized explicitly
let syncPaths: EnvPaths | null = null;

/**
 * Initialize paths synchronously (call this at app startup)
 * Required because env-paths is ESM-only
 */
export async function initializePaths(): Promise<void> {
  syncPaths = await getEnvPaths();
}

// Helper to get paths (falls back to platform-specific logic if not initialized)
// Following Claude Code convention: use ~/.grimoire on all platforms
function getPaths(): EnvPaths {
  if (syncPaths != null) return syncPaths;

  // Fallback: use ~/.grimoire following Claude Code convention
  // Claude Code uses ~/.claude, we use ~/.grimoire
  const home = homedir();
  const grimoireDir = join(home, '.grimoire');

  return {
    config: grimoireDir,
    cache: grimoireDir,
    log: grimoireDir,
    data: grimoireDir,
    temp: join(tmpdir(), 'grimoire'),
  };
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
 * Ensure all required directories exist with proper permissions
 * Safe to call multiple times (idempotent)
 *
 * On Unix systems, sets restrictive permissions:
 * - Directories: 0700 (owner read/write/execute only)
 * - Files: 0600 (owner read/write only)
 *
 * On Windows, inherits ACLs from parent directory
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

    // Success (no logging here - gateway will log)
  } catch (error) {
    // Re-throw with more context
    throw new Error(
      `Cannot create grimoire directory at ${grimoireDir}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
