import type { ChildProcess } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { SpellConfig } from '../core/types';
import type { ActiveSpell, Tool, SSEServerConfig, HTTPServerConfig } from '../core/types';
import { logger } from '../utils/logger';
import type { EmbeddingStorage } from '../infrastructure/embedding-storage';
import { buildAuthHeaders, createAuthProvider } from '../infrastructure/auth-provider.js';

export class ProcessSpawnError extends Error {
  constructor(
    message: string,
    public readonly spellName: string
  ) {
    super(message);
    this.name = 'ProcessSpawnError';
  }
}

interface ActiveConnection {
  client: Client;
  transport: Transport;
  process?: ChildProcess; // Only for stdio transport
}

/**
 * Manages lifecycle of MCP server connections
 * - stdio: Spawns child processes
 * - sse/http: Connects to already-running servers
 * - Turn-based cleanup: Kills inactive spells after threshold
 * - Persistence: Saves/restores state to survive restarts
 */
export class ProcessLifecycleManager {
  private activeSpells = new Map<string, ActiveSpell>();
  private connections = new Map<string, ActiveConnection>();
  private currentTurn = 0;
  private usageTracking = new Map<string, { lastUsedTurn: number }>();

  // Persistence support
  private storage?: EmbeddingStorage;
  private saveDebounceTimer?: NodeJS.Timeout;
  private readonly SAVE_DEBOUNCE_MS = 5000; // 5 seconds

  /**
   * Create lifecycle manager
   * @param storage - Optional storage for persistence (survives restarts)
   */
  constructor(storage?: EmbeddingStorage) {
    this.storage = storage;
  }

  /**
   * Check if spell is active
   */
  isActive(name: string): boolean {
    return this.activeSpells.has(name);
  }

  /**
   * Get tools for active spell
   */
  getTools(name: string): Tool[] {
    const spell = this.activeSpells.get(name);
    return spell ? [...spell.tools] : [];
  }

  /**
   * Get MCP client for active spell (for tool invocation)
   */
  getClient(name: string): Client {
    const connection = this.connections.get(name);
    if (connection == null) {
      throw new Error(`Spell '${name}' is not active`);
    }
    return connection.client;
  }

  /**
   * Get all active spell names
   */
  getActiveSpellNames(): string[] {
    return Array.from(this.activeSpells.keys());
  }

  /**
   * Kill a spell connection
   */
  async kill(name: string): Promise<boolean> {
    const spell = this.activeSpells.get(name);
    const connection = this.connections.get(name);

    if (!spell || !connection) {
      return false;
    }

    logger.info('LIFECYCLE', 'Killing spell', { spellName: name });

    try {
      // Only close real connections (not mocks for testing)
      if (connection.client != null && typeof connection.client.close === 'function') {
        await connection.client.close();
      }

      // If stdio, kill the child process
      if (connection.process != null) {
        connection.process.kill();
      }
    } catch (error) {
      logger.error(
        'LIFECYCLE',
        'Error killing spell',
        error instanceof Error ? error : new Error(String(error))
      );
    }

    this.activeSpells.delete(name);
    this.connections.delete(name);

    return true;
  }

  /**
   * Kill all active spells (cleanup)
   */
  async killAll(): Promise<void> {
    logger.info('LIFECYCLE', 'Killing all active spells', { count: this.activeSpells.size });

    const killPromises = Array.from(this.activeSpells.keys()).map((name) => this.kill(name));
    await Promise.all(killPromises);
  }

  // ==========================================
  // Turn-Based Lifecycle Tracking (ADR-0006)
  // ==========================================

  /**
   * Get current turn number
   */
  getCurrentTurn(): number {
    return this.currentTurn;
  }

  /**
   * Increment turn counter (called after each query/tool call)
   */
  incrementTurn(): void {
    this.currentTurn++;
    void this.saveToStorage(); // Trigger debounced save
  }

  /**
   * Mark spell as used in current turn
   */
  markUsed(name: string): void {
    if (!this.isActive(name)) {
      logger.warn('LIFECYCLE', 'Attempted to mark inactive spell as used', { spellName: name });
      return;
    }

    this.usageTracking.set(name, { lastUsedTurn: this.currentTurn });
    logger.debug('LIFECYCLE', 'Spell marked as used', { spellName: name, turn: this.currentTurn });
    void this.saveToStorage(); // Trigger debounced save
  }

  /**
   * Get usage info for a spell
   */
  getUsageInfo(name: string): { lastUsedTurn: number } | null {
    return this.usageTracking.get(name) ?? null;
  }

  /**
   * Get list of spells inactive for >= threshold turns
   */
  getInactiveSpells(thresholdTurns: number): string[] {
    const inactive: string[] = [];

    for (const name of this.activeSpells.keys()) {
      const usage = this.usageTracking.get(name);
      if (!usage) {
        // Never used, consider inactive
        continue;
      }

      const turnsSinceUse = this.currentTurn - usage.lastUsedTurn;
      if (turnsSinceUse >= thresholdTurns) {
        inactive.push(name);
      }
    }

    return inactive;
  }

  /**
   * Clean up inactive spells (kill after threshold)
   * @returns Array of killed spell names for notification
   */
  async cleanupInactive(thresholdTurns = 5): Promise<string[]> {
    const inactive = this.getInactiveSpells(thresholdTurns);

    if (inactive.length === 0) {
      logger.debug('LIFECYCLE', 'No inactive spells to cleanup', { turn: this.currentTurn });
      return [];
    }

    logger.info('LIFECYCLE', 'Cleaning up inactive spells', {
      count: inactive.length,
      spells: inactive,
      turn: this.currentTurn,
      threshold: thresholdTurns,
    });

    const killPromises = inactive.map((name) => this.kill(name));
    await Promise.all(killPromises);

    // Remove from usage tracking
    for (const name of inactive) {
      this.usageTracking.delete(name);
    }

    void this.saveToStorage(); // Trigger debounced save

    return inactive;
  }

  // ==========================================
  // Persistence (ADR-0007)
  // ==========================================

  /**
   * Load lifecycle state from storage
   * Restores turn counter, usage tracking, and kills orphaned processes
   */
  async loadFromStorage(): Promise<void> {
    if (!this.storage) {
      logger.debug('LIFECYCLE', 'No storage configured, skipping load');
      return;
    }

    try {
      await this.storage.load();
      const metadata = this.storage.getLifecycleMetadata();

      if (!metadata) {
        logger.info('LIFECYCLE', 'No saved state, starting fresh');
        return;
      }

      // Restore turn counter
      this.currentTurn = metadata.currentTurn;

      // Restore usage tracking
      this.usageTracking = new Map(Object.entries(metadata.usageTracking));

      // Kill orphaned processes from previous run
      const orphanedPIDs = Object.entries(metadata.activePIDs);
      let killedCount = 0;

      for (const [spellName, pid] of orphanedPIDs) {
        try {
          // Check if process exists
          process.kill(pid, 0);
          // Process exists, kill it
          process.kill(pid);
          killedCount++;
          logger.info('LIFECYCLE', 'Killed orphaned process', { spellName, pid });
        } catch {
          // Process already dead (ESRCH error), ignore
          logger.debug('LIFECYCLE', 'Orphaned PID already dead', { spellName, pid });
        }
      }

      logger.info('LIFECYCLE', 'State restored from storage', {
        currentTurn: this.currentTurn,
        activeTracking: this.usageTracking.size,
        orphansKilled: killedCount,
        orphansFound: orphanedPIDs.length,
      });
    } catch (err) {
      logger.error(
        'LIFECYCLE',
        'Failed to load state from storage',
        err instanceof Error ? err : new Error(String(err))
      );
    }
  }

  /**
   * Save lifecycle state to storage (debounced)
   * Batches saves to avoid disk thrashing
   */
  private saveToStorage(): void {
    if (!this.storage) return;

    // Debounce: Clear existing timer and set new one
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    this.saveDebounceTimer = setTimeout(() => {
      void (async (): Promise<void> => {
      try {
        // Collect active PIDs
        const activePIDs: Record<string, number> = {};
        for (const [name, connection] of this.connections.entries()) {
          const pid = connection.process?.pid;
          if (pid != null) {
            activePIDs[name] = pid;
          }
        }

        // Update storage
        this.storage!.updateLifecycleMetadata({
          currentTurn: this.currentTurn,
          usageTracking: Object.fromEntries(this.usageTracking.entries()),
          activePIDs,
          lastSaved: Date.now(),
        });

        // Persist to disk
        await this.storage!.save();

        logger.debug('LIFECYCLE', 'State saved to storage', {
          turn: this.currentTurn,
          activeSpells: this.activeSpells.size,
          activePIDs: Object.keys(activePIDs).length,
        });
      } catch (err) {
        logger.error(
          'LIFECYCLE',
          'Failed to save state',
          err instanceof Error ? err : new Error(String(err))
        );
      }
      })();
    }, this.SAVE_DEBOUNCE_MS);
  }

  /**
   * Spawn/connect to MCP server based on transport type
   * - stdio: Spawns child process
   * - sse/http: Connects to remote server
   */
  async spawn(name: string, config: SpellConfig): Promise<Tool[]> {
    const timer = logger.startTimer();

    // Check if already active
    if (this.isActive(name)) {
      logger.info('SPAWN', 'Spell already active', { spellName: name });
      return this.getTools(name);
    }

    const transport = config.server.transport || 'stdio';

    try {
      let client: Client;
      let mcpTransport: Transport;
      let childProcess: ChildProcess | undefined;

      if (transport === 'stdio') {
        // Stdio: Spawn child process
        if (!('command' in config.server) || !('args' in config.server)) {
          throw new ProcessSpawnError(
            'Stdio transport requires command and args',
            name
          );
        }

        logger.info('SPAWN', 'Spawning stdio MCP server', {
          spellName: name,
          command: config.server.command,
        });

        const serverConfig = config.server;

        // StdioClientTransport will spawn the process itself
        // We don't need to spawn manually
        mcpTransport = new StdioClientTransport({
          command: serverConfig.command,
          args: serverConfig.args as string[],
          env: serverConfig.env as Record<string, string> | undefined,
        });

        client = new Client(
          {
            name: `grimoire-${name}`,
            version: '1.0.0',
          },
          {
            capabilities: {},
          }
        );

        await client.connect(mcpTransport);

        // Extract the child process reference from the transport
        // This is needed for cleanup later
        // StdioClientTransport has an internal _process property
        interface StdioTransportWithProcess {
          _process?: ChildProcess;
        }
        childProcess = (mcpTransport as unknown as StdioTransportWithProcess)._process;

        logger.info('SPAWN', 'Stdio MCP server connected', {
          spellName: name,
          pid: childProcess?.pid,
        });
      } else if (transport === 'sse') {
        // SSE: Connect to remote server
        if (!('url' in config.server)) {
          throw new ProcessSpawnError('SSE transport requires url', name);
        }

        const serverConfig = config.server as SSEServerConfig;

        logger.info('SPAWN', 'Connecting to SSE MCP server', {
          spellName: name,
          url: serverConfig.url,
          hasAuth: !!serverConfig.auth,
        });

        // Phase 1: Bearer token - build static headers
        const staticHeaders = buildAuthHeaders(serverConfig.headers, serverConfig.auth);

        // Phase 2: OAuth Client Credentials - get token upfront
        const oauthProvider = createAuthProvider(serverConfig.auth);

        const authHeaders: Record<string, string> = { ...staticHeaders };

        if (oauthProvider) {
          // Phase 2: OAuth Client Credentials - fetch token before connecting
          logger.info('SPAWN', 'Fetching OAuth access token for SSE connection', {
            spellName: name,
          });

          const accessToken = await oauthProvider.getAccessToken();
          authHeaders['Authorization'] = `Bearer ${accessToken}`;
        }

        // Configure transport with auth headers
        mcpTransport = new SSEClientTransport(new URL(serverConfig.url), {
          requestInit: {
            headers: authHeaders,
          },
        });

        client = new Client(
          {
            name: `grimoire-${name}`,
            version: '1.0.0',
          },
          {
            capabilities: {},
          }
        );

        await client.connect(mcpTransport);

        logger.info('SPAWN', 'SSE MCP server connected', {
          spellName: name,
          authType: serverConfig.auth?.type || 'none',
        });
      } else if (transport === 'http') {
        // HTTP: Use Streamable HTTP transport (modern HTTP with SSE)
        if (!('url' in config.server)) {
          throw new ProcessSpawnError('HTTP transport requires url', name);
        }

        const serverConfig = config.server as HTTPServerConfig;

        logger.info('SPAWN', 'Connecting to HTTP MCP server (Streamable HTTP)', {
          spellName: name,
          url: serverConfig.url,
          hasAuth: !!serverConfig.auth,
        });

        // Phase 1: Bearer token - build static headers
        const staticHeaders = buildAuthHeaders(serverConfig.headers, serverConfig.auth);

        // Phase 2: OAuth Client Credentials - get token upfront
        const oauthProvider = createAuthProvider(serverConfig.auth);

        const authHeaders: Record<string, string> = { ...staticHeaders };

        if (oauthProvider) {
          // Phase 2: OAuth Client Credentials - fetch token before connecting
          logger.info('SPAWN', 'Fetching OAuth access token for HTTP connection', {
            spellName: name,
          });

          const accessToken = await oauthProvider.getAccessToken();
          authHeaders['Authorization'] = `Bearer ${accessToken}`;
        }

        // Configure transport with auth headers
        mcpTransport = new StreamableHTTPClientTransport(new URL(serverConfig.url), {
          requestInit: {
            headers: authHeaders,
          },
        });

        client = new Client(
          {
            name: `grimoire-${name}`,
            version: '1.0.0',
          },
          {
            capabilities: {},
          }
        );

        await client.connect(mcpTransport);

        logger.info('SPAWN', 'HTTP MCP server connected (Streamable HTTP)', {
          spellName: name,
          authType: serverConfig.auth?.type || 'none',
        });
      } else {
        throw new ProcessSpawnError(`Unknown transport: ${String(transport)}`, name);
      }

      // Get tools from server
      const toolsResponse = await client.listTools();
      const tools: Tool[] = toolsResponse.tools.map((tool) => ({
        name: tool.name,
        description: tool.description ?? '',
        inputSchema: tool.inputSchema as Tool['inputSchema'],
      }));

      // Store connection
      this.connections.set(name, { client, transport: mcpTransport, process: childProcess });

      // Store as active spell
      const activeSpell: ActiveSpell = {
        name,
        process: childProcess || null,
        tools,
        lastUsedTurn: 0,
      };

      this.activeSpells.set(name, activeSpell);

      logger.info('SPAWN', 'Spell activated', {
        spellName: name,
        transport,
        toolCount: tools.length,
        tools: tools.map((t) => t.name),
        ...timer.end(),
      });

      return tools;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const errorCode = (err as NodeJS.ErrnoException)?.code;
      const fixSuggestion = this.getSpawnErrorFix(errorCode, errorMsg, config);

      logger.error(
        'SPAWN',
        'Failed to spawn/connect spell',
        err instanceof Error ? err : new Error(errorMsg),
        {
          spellName: name,
          transport,
          errorCode,
          fix: fixSuggestion,
        }
      );

      throw new ProcessSpawnError(
        `Failed to activate ${name}: ${errorMsg}\nFix: ${fixSuggestion}`,
        name
      );
    }
  }

  /**
   * Get actionable fix suggestion based on spawn error type
   */
  private getSpawnErrorFix(
    errorCode: string | undefined,
    errorMsg: string,
    config: SpellConfig
  ): string {
    const transport = config.server.transport || 'stdio';

    // ENOENT: Command not found
    if (errorCode === 'ENOENT') {
      const command = 'command' in config.server ? config.server.command : '';
      return `Command '${command}' not found. Install the required package or check the command path in ${config.name}.spell.yaml`;
    }

    // EACCES: Permission denied
    if (errorCode === 'EACCES') {
      const command = 'command' in config.server ? config.server.command : '';
      return `Permission denied for '${command}'. Run 'chmod +x ${command}' or check file permissions`;
    }

    // ECONNREFUSED: Connection refused (SSE/HTTP)
    if (errorCode === 'ECONNREFUSED' || errorMsg.includes('ECONNREFUSED')) {
      const url = 'url' in config.server ? config.server.url : '';
      return `Cannot connect to ${url}. Ensure the MCP server is running and the URL is correct in ${config.name}.spell.yaml`;
    }

    // EADDRINUSE: Port already in use
    if (errorCode === 'EADDRINUSE') {
      return `Port already in use. Stop the conflicting process or change the port in ${config.name}.spell.yaml`;
    }

    // Module not found
    if (errorMsg.includes('Cannot find module') || errorMsg.includes('MODULE_NOT_FOUND')) {
      return `Missing dependencies. Run 'npm install' or check the spell's required packages`;
    }

    // Timeout errors
    if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) {
      return `Connection timeout. Check network connectivity or increase timeout in ${config.name}.spell.yaml`;
    }

    // Generic fallback
    if (transport === 'stdio') {
      return `Check that the command and args are correct in ${config.name}.spell.yaml`;
    } else {
      return `Verify the server URL and ensure the ${transport} server is running`;
    }
  }
}
