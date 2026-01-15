/**
 * Spell Configuration File Watcher
 * Watches (os.home)/.grimoire directory for changes and hot-reloads configurations
 *
 * Features:
 * - Detects new, modified, and deleted .spell.yaml files
 * - Re-indexes spells when files change
 * - Updates embeddings using delete-and-recreate strategy
 * - Kills active MCP servers when their config changes
 * - Debounces rapid file changes (e.g., editor saves)
 */

import { watch, type FSWatcher } from 'chokidar';
import { join, basename } from 'path';
import { SpellDiscovery } from '../application/spell-discovery';
import type { HybridResolver } from '../application/hybrid-resolver';
import type { ProcessLifecycleManager } from '../application/process-lifecycle';
import type { ToolRouter } from '../presentation/tool-router';
import { logger } from '../utils/logger';

export class SpellWatcher {
  private watcher: FSWatcher | null = null;
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private readonly DEBOUNCE_MS = 500; // Wait 500ms after last change

  constructor(
    private readonly spellDirectory: string,
    private readonly discovery: SpellDiscovery,
    private readonly resolver: HybridResolver,
    private readonly lifecycle: ProcessLifecycleManager,
    private readonly router: ToolRouter,
    private readonly onToolsChanged: () => void
  ) {}

  /**
   * Start watching the spell directory
   */
  start(): void {
    const watchPattern = join(this.spellDirectory, '*.spell.yaml');
    logger.info('WATCH', 'Starting spell file watcher', {
      directory: this.spellDirectory,
      pattern: watchPattern,
    });

    // Watch the directory with a glob pattern
    // chokidar needs to watch the directory, not just the pattern
    this.watcher = watch(this.spellDirectory, {
      persistent: true,
      ignoreInitial: true, // Don't trigger events for existing files on startup
      ignored: (path: string) => {
        // Only watch .spell.yaml files
        const shouldIgnore = !path.endsWith('.spell.yaml') && path !== this.spellDirectory;
        return shouldIgnore;
      },
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });

    // Add debug listeners to track all events
    this.watcher
      .on('ready', () => {
        const watched = this.watcher?.getWatched();
        logger.info('WATCH', '🔍 Watcher ready and monitoring', {
          watchedPaths: watched,
          totalPaths: watched ? Object.keys(watched).length : 0,
        });
      })
      .on('all', (event, path) => {
        logger.info('WATCH', '🔔 Raw watcher event', {
          event,
          path,
          timestamp: new Date().toISOString(),
        });
      })
      .on('add', (filePath) => {
        logger.info('WATCH', '📂 Add event received', { filePath });
        this.handleFileAdded(filePath);
      })
      .on('change', (filePath) => {
        logger.info('WATCH', '📝 Change event received', { filePath });
        this.handleFileChanged(filePath);
      })
      .on('unlink', (filePath) => {
        logger.info('WATCH', '🗑️  Unlink event received', { filePath });
        this.handleFileDeleted(filePath);
      })
      .on('error', (error) => {
        logger.error('WATCH', 'Spell watcher error', error instanceof Error ? error : new Error(String(error)));
      });

    logger.info('WATCH', 'Spell file watcher started');
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      logger.info('WATCH', 'Spell file watcher stopped');
    }

    // Clear any pending debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  /**
   * Handle new spell file added
   */
  private handleFileAdded(filePath: string): void {
    const spellName = this.getSpellNameFromPath(filePath);

    this.debounce(filePath, async () => {
      try {
        logger.info('WATCH', '🆕 New spell file detected', {
          filePath,
          spellName: spellName,
        });

        // Reload all configs to pick up the new file
        await this.discovery.scan();

        // Get the new config
        const config = this.discovery.getSpell(spellName);
        if (!config) {
          throw new Error(`Failed to load config for ${spellName}`);
        }

        // Index the new spell (keywords + embeddings)
        await this.resolver.indexSpell(config);

        logger.info('WATCH', '✅ New spell indexed successfully', {
          spellName: config.name,
          keywords: config.keywords.length,
        });
      } catch (error) {
        logger.error('WATCH', 'Failed to load new spell file', error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Handle spell file modified
   */
  private handleFileChanged(filePath: string): void {
    const spellName = this.getSpellNameFromPath(filePath);

    this.debounce(filePath, async () => {
      try {
        logger.info('WATCH', '🔄 Spell file modified', {
          filePath,
          spellName,
        });

        // Reload all configs
        await this.discovery.scan();

        // Get the updated config
        const config = this.discovery.getSpell(spellName);
        if (!config) {
          throw new Error(`Failed to load config for ${spellName}`);
        }

        // Check if spell is currently active
        const wasActive = this.lifecycle.isActive(spellName);

        if (wasActive) {
          logger.info('WATCH', 'Spell is active - killing before re-indexing', {
            spellName: spellName,
          });

          // Kill the active MCP server
          await this.lifecycle.kill(spellName);

          // Unregister tools
          this.router.unregisterTools(spellName);

          // Notify client that tools changed
          this.onToolsChanged();
        }

        // Delete old embeddings and keywords (delete-and-recreate strategy)
        await this.resolver.removeSpell(spellName);

        // Re-index with new config
        await this.resolver.indexSpell(config);

        logger.info('WATCH', '✅ Spell re-indexed successfully', {
          spellName: config.name,
          wasActive,
          keywords: config.keywords.length,
        });

        if (wasActive) {
          logger.info('WATCH', '💡 Spell was active - will respawn on next use', {
            spellName: spellName,
          });
        }
      } catch (error) {
        logger.error('WATCH', 'Failed to reload modified spell file', error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Handle spell file deleted
   */
  private handleFileDeleted(filePath: string): void {
    const spellName = this.getSpellNameFromPath(filePath);

    this.debounce(filePath, async () => {
      try {
        logger.info('WATCH', '🗑️  Spell file deleted', {
          filePath,
          spellName: spellName,
        });

        // Check if spell is currently active
        const wasActive = this.lifecycle.isActive(spellName);

        if (wasActive) {
          logger.info('WATCH', 'Spell is active - killing before removal', {
            spellName: spellName,
          });

          // Kill the active MCP server
          await this.lifecycle.kill(spellName);

          // Unregister tools
          this.router.unregisterTools(spellName);

          // Notify client that tools changed
          this.onToolsChanged();
        }

        // Remove from index (deletes keywords and embeddings)
        await this.resolver.removeSpell(spellName);

        logger.info('WATCH', '✅ Spell removed successfully', {
          spellName: spellName,
          wasActive,
        });
      } catch (error) {
        logger.error('WATCH', 'Failed to remove deleted spell', error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Debounce file changes to handle rapid saves (e.g., editor auto-save)
   */
  private debounce(filePath: string, action: () => Promise<void>): void {
    // Clear existing timer for this file
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      logger.debug('WATCH', 'Clearing existing debounce timer', { filePath });
      clearTimeout(existingTimer);
    }

    logger.debug('WATCH', 'Setting debounce timer', {
      filePath,
      delayMs: this.DEBOUNCE_MS,
    });

    // Set new timer
    const timer = setTimeout(() => {
      logger.debug('WATCH', 'Debounce timer fired, executing action', { filePath });
      this.debounceTimers.delete(filePath);
      void action();
    }, this.DEBOUNCE_MS);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Extract spell name from file path
   * e.g., /path/to/.grimoire/postgres.spell.yaml -> postgres
   */
  private getSpellNameFromPath(filePath: string): string {
    const filename = basename(filePath);
    return filename.replace('.spell.yaml', '');
  }
}
