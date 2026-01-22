/**
 * Environment Variable Manager
 *
 * Manages environment variables from ~/.grimoire/.env file with:
 * - Memory caching for performance (~0ms per lookup)
 * - File watching for live reloading
 * - Resolution priority: .env file > process.env > empty string
 * - Validation for missing required variables
 *
 * Security: Relies on file system permissions (0600) like ~/.ssh/id_rsa
 * No encryption/compression for simplicity and performance
 *
 * See ADR-0014 for decision rationale
 */

import { readFile, writeFile, mkdir, rm } from 'fs/promises';
import { watch, type FSWatcher } from 'chokidar';
import { join } from 'path';
import { getSpellDirectory } from '../utils/paths';
import { logger } from '../utils/logger';

/**
 * Environment variable manager with caching and live reloading
 * Follows SRP: Single responsibility is managing env vars
 */
export class EnvManager {
  private cache = new Map<string, string>();
  private watcher: FSWatcher | null = null;
  private envPath: string;
  private loadDebounceTimer?: NodeJS.Timeout;

  // Static write queue shared across all instances to prevent race conditions
  // This ensures all file writes are serialized, even from different EnvManager instances
  private static writeQueues = new Map<string, Promise<void>>();

  /**
   * Create env manager
   * @param envPath - Path to .env file (defaults to ~/.grimoire/.env)
   */
  constructor(envPath?: string) {
    this.envPath = envPath ?? join(getSpellDirectory(), '.env');
  }

  /**
   * Load .env file and start watching for changes
   * Called once at startup
   */
  async load(): Promise<void> {
    await this.reloadCache();
    this.watchForChanges();
  }

  /**
   * Reload .env file into memory cache
   * Private method following SRP
   */
  private async reloadCache(): Promise<void> {
    try {
      const content = await readFile(this.envPath, 'utf-8');
      const parsed = this.parse(content);

      this.cache = parsed;

      logger.debug('ENV', 'Loaded .env file', {
        path: this.envPath,
        count: this.cache.size,
      });
    } catch (err) {
      const error = err as NodeJS.ErrnoException;

      if (error.code === 'ENOENT') {
        // No .env file is OK - cache stays empty, will use process.env
        logger.debug('ENV', 'No .env file found, using process.env only');
        this.cache.clear();
      } else {
        // Other errors (permissions, etc) - warn but don't crash
        logger.warn('ENV', 'Failed to load .env file', {
          message: error.message,
          code: error.code,
        });
        this.cache.clear();
      }
    }
  }

  /**
   * Parse .env file content into key-value map
   * Supports:
   * - KEY=value
   * - # comments
   * - Empty lines
   * - Values with = sign (KEY=val=ue)
   * - Quoted values (KEY="value with spaces")
   *
   * Following DRY: Single parsing logic
   */
  private parse(content: string): Map<string, string> {
    const map = new Map<string, string>();

    for (const line of content.split('\n')) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Split on first = only (allows = in values)
      const equalIndex = trimmed.indexOf('=');
      if (equalIndex === -1) {
        continue; // Invalid line, skip
      }

      const key = trimmed.slice(0, equalIndex).trim();
      let value = trimmed.slice(equalIndex + 1).trim();

      // Remove surrounding quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (key) {
        map.set(key, value);
      }
    }

    return map;
  }

  /**
   * Watch .env file for changes and reload on modification
   * Uses chokidar for reliable cross-platform file watching
   *
   * Following Open/Closed Principle: Can add more watch strategies without modifying this
   */
  private watchForChanges(): void {
    try {
      // Use chokidar for consistent behavior across platforms (same as spell-watcher)
      this.watcher = watch(this.envPath, {
        persistent: true,
        ignoreInitial: true, // Don't trigger on startup
        awaitWriteFinish: {
          stabilityThreshold: 100, // Wait 100ms for file to stabilize
          pollInterval: 50,
        },
      });

      this.watcher
        .on('change', () => {
          logger.debug('ENV', '.env file changed, reloading cache');
          void this.reloadCache();
        })
        .on('error', (error) => {
          logger.error(
            'ENV',
            '.env watcher error',
            error instanceof Error ? error : new Error(String(error))
          );
        });

      logger.debug('ENV', 'Watching .env file for changes', { path: this.envPath });
    } catch {
      // Watch failed (file doesn't exist or permissions) - not critical
      logger.debug('ENV', 'Could not watch .env file (file may not exist yet)');
    }
  }

  /**
   * Get environment variable value
   * Resolution priority: .env file > process.env > empty string
   *
   * @param key - Environment variable name
   * @returns Value or empty string if not found
   */
  get(key: string): string {
    // 1. Check .env file cache (highest priority)
    const envValue = this.cache.get(key);
    if (envValue !== undefined) {
      return envValue;
    }

    // 2. Check process.env (inherited from parent process)
    const processValue = process.env[key];
    if (processValue !== undefined) {
      return processValue;
    }

    // 3. Not found anywhere
    return '';
  }

  /**
   * Check if environment variable exists (in .env or process.env)
   */
  has(key: string): boolean {
    return this.cache.has(key) || key in process.env;
  }

  /**
   * Set environment variable in .env file
   * Updates memory cache immediately and appends/updates file
   *
   * Thread-safe: Uses a static write queue per file path to serialize all file operations,
   * preventing race conditions even when multiple EnvManager instances access the same file
   *
   * @param key - Variable name
   * @param value - Variable value
   */
  async set(key: string, value: string): Promise<void> {
    // Update cache immediately (for performance)
    this.cache.set(key, value);

    // Get or create queue for this file path
    if (!EnvManager.writeQueues.has(this.envPath)) {
      EnvManager.writeQueues.set(this.envPath, Promise.resolve());
    }

    // Serialize all file writes through a queue to prevent race conditions
    // The queue chain ensures only one write happens at a time for each file
    const currentQueue = EnvManager.writeQueues.get(this.envPath)!;

    const newQueue = currentQueue
      .then(() => this.performWrite(key, value))
      .catch((err) => {
        logger.error(
          'ENV',
          'Failed to write .env file',
          err instanceof Error ? err : new Error(String(err))
        );
        // Don't re-throw - keep the queue alive for subsequent writes
      });

    EnvManager.writeQueues.set(this.envPath, newQueue);

    // Wait for this write to complete
    await newQueue;
  }

  /**
   * Acquire a file system lock using atomic mkdir operation
   * Retries with exponential backoff if lock is held by another process
   */
  private async acquireLock(maxWaitMs = 5000): Promise<() => Promise<void>> {
    const lockPath = `${this.envPath}.lock`;
    const startTime = Date.now();
    let attempt = 0;

    while (Date.now() - startTime < maxWaitMs) {
      try {
        // mkdir is atomic - only one process can create it
        await mkdir(lockPath, { recursive: false });

        // Return cleanup function
        return async () => {
          try {
            await rm(lockPath, { recursive: true, force: true });
          } catch {
            // Ignore cleanup errors - lock will be broken if stale
          }
        };
      } catch {
        // Lock exists, wait and retry
        attempt++;
        const backoffMs = Math.min(50 * Math.pow(1.5, attempt), 500);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    // Timeout - try to break stale lock
    try {
      await rm(lockPath, { recursive: true, force: true });
      await mkdir(lockPath, { recursive: false });
      return async () => {
        try {
          await rm(lockPath, { recursive: true, force: true });
        } catch {}
      };
    } catch {
      throw new Error(`Failed to acquire lock after ${maxWaitMs}ms`);
    }
  }

  /**
   * Perform the actual file write operation
   * Private method - should only be called through the write queue
   */
  private async performWrite(key: string, value: string): Promise<void> {
    // Acquire cross-process file lock
    const releaseLock = await this.acquireLock();

    try {
      // Read existing content
      let content = '';
      try {
        content = await readFile(this.envPath, 'utf-8');
      } catch {
        // File doesn't exist, will create
      }

      const lines = content.split('\n');
      let found = false;

      // Update existing key
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // Only match lines that start with "KEY=" (enforce proper .env format)
        if (line.startsWith(`${key}=`)) {
          lines[i] = `${key}=${value}`;
          found = true;
          break;
        }
      }

      // Append if not found
      if (!found) {
        if (content && !content.endsWith('\n')) {
          lines.push(''); // Add blank line before new entry
        }
        lines.push(`${key}=${value}`);
      }

      // Write with restrictive permissions
      const newContent = lines.join('\n');
      if (process.platform !== 'win32') {
        await writeFile(this.envPath, newContent, { mode: 0o600, encoding: 'utf-8' });
      } else {
        await writeFile(this.envPath, newContent, { encoding: 'utf-8' });
      }

      logger.info('ENV', `✓ Wrote ${key} to .env file`, { key, totalLines: lines.length });
    } catch (err) {
      throw new Error(
        `Failed to update .env file: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    } finally {
      // Always release lock, even if write failed
      await releaseLock();
    }
  }

  /**
   * Validate that all placeholders in a string can be resolved
   * Returns array of missing variable names
   *
   * @param value - String potentially containing ${VAR} placeholders
   * @returns Array of missing variable names
   */
  validatePlaceholders(value: string): string[] {
    const missing: string[] = [];
    const seen = new Set<string>();
    const placeholderRegex = /\$\{([A-Z_][A-Z0-9_]*)\}/gi;

    let match;
    while ((match = placeholderRegex.exec(value)) !== null) {
      const varName = match[1];
      // Avoid duplicates
      if (!seen.has(varName) && !this.has(varName)) {
        missing.push(varName);
        seen.add(varName);
      }
    }

    return missing;
  }

  /**
   * Expand ${VAR} placeholders in a string
   *
   * @param value - String potentially containing ${VAR} placeholders
   * @returns String with all placeholders expanded
   */
  expand(value: string): string {
    return value.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/gi, (_, varName: string) => {
      const resolved = this.get(varName);

      if (!resolved) {
        logger.warn('ENV', `Environment variable ${varName} is not defined, using empty string`);
      }

      return resolved;
    });
  }

  /**
   * Get all cached environment variables (from .env file only)
   * Does NOT include process.env
   */
  getAll(): Record<string, string> {
    return Object.fromEntries(this.cache.entries());
  }

  /**
   * Close file watcher and cleanup
   */
  async close(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    if (this.loadDebounceTimer) {
      clearTimeout(this.loadDebounceTimer);
      this.loadDebounceTimer = undefined;
    }
  }
}

/**
 * Create .env file template with helpful instructions
 * Called when initializing ~/.grimoire/ directory
 *
 * Following SRP: Separate function for template creation
 */
export async function createEnvTemplate(envPath: string): Promise<void> {
  const template = `# Grimoire Environment Variables
# Store secrets and API keys here
# This file is private to your machine (not in git)
#
# Security:
# - File permissions: 0600 (read/write by owner only)
# - Same security model as ~/.ssh/id_rsa
# - Stored in your home directory
#
# Usage:
# - Grimoire automatically loads this file at startup
# - Changes are detected and reloaded automatically
# - Values override shell environment variables
#
# Example:
# TEST_API_KEY=your-key-here
# OAUTH_TOKEN=your-token-here
# GITHUB_TOKEN=ghp_xxxxx
# DATABASE_URL=postgresql://user:pass@localhost/db

# Add your variables below:

`;

  try {
    // Only create if doesn't exist
    await readFile(envPath, 'utf-8');
    // File exists, don't overwrite
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // File doesn't exist, create it
      if (process.platform !== 'win32') {
        await writeFile(envPath, template, { mode: 0o600, encoding: 'utf-8' });
      } else {
        await writeFile(envPath, template, { encoding: 'utf-8' });
      }
      logger.info('ENV', 'Created .env template', { path: envPath });
    }
  }
}
