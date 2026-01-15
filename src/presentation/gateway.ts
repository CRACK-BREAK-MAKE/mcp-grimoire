import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { SpellDiscovery } from '../application/spell-discovery';
import { HybridResolver } from '../application/hybrid-resolver';
import { SteeringInjector } from '../application/steering-injector';
import { ProcessLifecycleManager } from '../application/process-lifecycle';
import { ToolRouter } from './tool-router';
import { YAMLConfigLoader } from '../infrastructure/config-loader';
import { EmbeddingService } from '../infrastructure/embedding-service';
import { EmbeddingStorage } from '../infrastructure/embedding-storage';
import { SpellWatcher } from '../infrastructure/spell-watcher';
import {
  ConfidenceTier,
  type Tool,
  type ResolveIntentResponse,
  type SpellAlternative,
} from '../core/types';
import { logger } from '../utils/logger';

/**
 * Main Grimoire Server
 * Implements multi-tier confidence-based intent resolution (ADR-0009):
 * - Tier 1 (≥0.85): Auto-spawn spell (high confidence)
 * - Tier 2 (0.5-0.84): Return alternatives for AI agent to choose (medium confidence)
 * - Tier 3a (0.3-0.49): Return weak matches for clarification (low confidence)
 * - Tier 3b (<0.3): Return not found error with available spells
 */
export class GrimoireServer {
  private server: Server;
  private discovery: SpellDiscovery;
  private resolver!: HybridResolver; // Initialized in start()
  private injector: SteeringInjector;
  private lifecycle: ProcessLifecycleManager;
  private router: ToolRouter;
  private embeddingService!: EmbeddingService; // Initialized in start()
  private embeddingStorage: EmbeddingStorage;
  private watcher: SpellWatcher | null = null;
  private configLoader: YAMLConfigLoader;

  constructor() {
    this.configLoader = new YAMLConfigLoader();
    this.discovery = new SpellDiscovery(this.configLoader);
    this.embeddingStorage = new EmbeddingStorage();
    this.injector = new SteeringInjector();
    this.lifecycle = new ProcessLifecycleManager(this.embeddingStorage); // Inject storage for persistence
    this.router = new ToolRouter();

    this.server = new Server(
      {
        name: 'mcp-grimoire-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * Setup MCP request handlers
   * Per ADR-0003: Use schema objects, not string method names
   */
  private setupHandlers(): void {
    // Handle tools/list - Use schema object per ADR-0003
    this.server.setRequestHandler(ListToolsRequestSchema, () => {
      const tools = this.getAllTools();
      logger.info('MCP', '📋 Client requested tools/list', {
        totalTools: tools.length,
        toolNames: tools.map((t) => t.name),
        activeSpells: this.router.getActiveSpellNames(),
      });
      return {
        tools,
      };
    });

    // Handle tools/call - Use schema object per ADR-0003
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const params = request.params as { name: string; arguments: unknown };
      const { name: toolName, arguments: args } = params;

      logger.info('TOOL', `🔧 Tool called: ${toolName}`, {
        toolName,
        availableTools: this.getAllTools().map((t) => t.name),
        activeSpells: this.router.getActiveSpellNames(),
      });

      if (toolName === 'resolve_intent') {
        return this.handleResolveIntent(args);
      }

      if (toolName === 'activate_spell') {
        return this.handleActivateSpell(args);
      }

      // Route to child server (simplified for Phase 2)
      return this.handleToolCall(toolName, args);
    });
  }

  /**
   * Handle resolve_intent tool call with multi-tier confidence routing (ADR-0009)
   * Tier 1 (≥0.85): Auto-spawn
   * Tier 2 (0.5-0.84): Return alternatives
   * Tier 3a (0.3-0.49): Return weak matches
   * Tier 3b (<0.3): Return not found
   */
  private async handleResolveIntent(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const { query } = args as { query: string };

    // Validate query
    if (!query || query.trim().length === 0) {
      const spells = this.discovery.getSpells();
      const response: ResolveIntentResponse = {
        status: 'not_found',
        query: query || '',
        message: 'Query cannot be empty',
        availableSpells: Array.from(spells.entries()).map(([name, config]) => ({
          name,
          description: config.description,
        })),
      };

      this.lifecycle.incrementTurn(); // Count as turn even without spawning

      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
      };
    }

    try {
      const startTime = Date.now();
      const totalSpells = this.discovery.getSpells().size;

      // Get top 5 results with minimum confidence of 0.3 (LOW tier)
      const results = await this.resolver.resolveTopN(query, 5, ConfidenceTier.LOW);

      const resolutionTime = Date.now() - startTime;

      logger.info('INTENT', '🔍 Intent Resolution Analysis', {
        query,
        totalSpellsIndexed: totalSpells,
        candidatesFound: results.length,
        resolutionTimeMs: resolutionTime,
        topResults: results.slice(0, 3).map(r => ({
          spell: r.spellName,
          confidence: r.confidence.toFixed(3),
          matchType: r.matchType,
        })),
      });

      // Tier 3b: No Match (<0.3) - Return error with all available spells
      if (results.length === 0) {
        const spells = this.discovery.getSpells();
        const response: ResolveIntentResponse = {
          status: 'not_found',
          query,
          message: 'No relevant tools found for this query. Available tools listed below.',
          availableSpells: Array.from(spells.entries()).map(([name, config]) => ({
            name,
            description: config.description,
          })),
        };

        logger.info('INTENT', 'Intent resolution: not found', { query });

        this.lifecycle.incrementTurn(); // Count as turn even without spawning

        return {
          content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
        };
      }

      const topResult = results[0];

      // Tier 1: High Confidence (≥0.85) - Auto-spawn
      if (topResult.confidence >= (ConfidenceTier.HIGH as number)) {
        const config = this.discovery.getSpell(topResult.spellName);

        if (!config) {
          throw new Error(`spell configuration not found: ${topResult.spellName}`);
        }

        // Spawn the MCP server and get its tools
        const tools = await this.lifecycle.spawn(topResult.spellName, config);

        // Inject steering
        const enhancedTools = this.injector.inject(tools, config.steering);

        // Register enhanced tools
        this.router.registerTools(topResult.spellName, enhancedTools);

        // Calculate token savings
        const tokenSavings = this.calculateTokenSavings(enhancedTools.length, totalSpells);

        // Increment turn counter (ADR-0006)
        this.lifecycle.incrementTurn();

        // Run cleanup check (ADR-0006: 5-turn inactivity threshold)
        const killedSpells = await this.lifecycle.cleanupInactive(5);

        // Unregister tools from killed spells
        if (killedSpells.length > 0) {
          for (const name of killedSpells) {
            this.router.unregisterTools(name);
          }
          logger.info('LIFECYCLE', 'Auto-cleanup after spawn', {
            spawned: topResult.spellName,
            killed: killedSpells,
            turn: this.lifecycle.getCurrentTurn(),
          });
        }

        // Notify client that tools have changed (covers both spawn + cleanup)
        this.notifyToolsChanged();

        const response: ResolveIntentResponse = {
          status: 'activated',
          spell: {
            name: topResult.spellName,
            confidence: topResult.confidence,
            matchType: topResult.matchType,
          },
          tools: enhancedTools.map((t) => t.name),
        };

        logger.info('INTENT', '✅ Spell Activated - Tier 1 (High Confidence)', {
          query,
          spellName: topResult.spellName,
          confidence: topResult.confidence.toFixed(3),
          matchType: topResult.matchType,
          tier: 'HIGH (≥0.85)',
          toolsActivated: enhancedTools.length,
          tokenSavings: tokenSavings,
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
        };
      }

      // Tier 2: Medium Confidence (0.5-0.84) - Return alternatives (top 3)
      if (topResult.confidence >= (ConfidenceTier.MEDIUM as number)) {
        const alternatives: SpellAlternative[] = results.slice(0, 3).map((result) =>
          this.toSpellAlternative(result)
        );

        const response: ResolveIntentResponse = {
          status: 'multiple_matches',
          query,
          matches: alternatives,
          message: 'Multiple relevant tools found. Use activate_spell(name) to select one.',
        };

        logger.info('INTENT', '🔀 Tier 2 (Medium Confidence) - Multiple Matches', {
          query,
          tier: 'MEDIUM (0.50-0.84)',
          matchCount: alternatives.length,
          topConfidence: topResult.confidence.toFixed(3),
          alternatives: alternatives.map(a => `${a.name} (${a.confidence.toFixed(3)})`),
          action: 'Returned alternatives for user selection',
        });

        this.lifecycle.incrementTurn(); // Count as turn even without spawning

        return {
          content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
        };
      }

      // Tier 3a: Low Confidence (0.3-0.49) - Return weak matches (top 5)
      const weakMatches: SpellAlternative[] = results.slice(0, 5).map((result) =>
        this.toSpellAlternative(result)
      );

      const response: ResolveIntentResponse = {
        status: 'weak_matches',
        query,
        matches: weakMatches,
        message: 'Found weak matches. Please clarify which tool you need, or rephrase your query.',
      };

      logger.info('INTENT', '⚠️  Tier 3a (Low Confidence) - Weak Matches', {
        query,
        tier: 'LOW (0.30-0.49)',
        matchCount: weakMatches.length,
        topConfidence: topResult.confidence.toFixed(3),
        matches: weakMatches.map(m => `${m.name} (${m.confidence.toFixed(3)})`),
        action: 'Returned weak matches for clarification',
      });

      this.lifecycle.incrementTurn(); // Count as turn even without spawning

      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
      };
    } catch (error) {
      logger.error(
        'INTENT',
        'Intent resolution error',
        error instanceof Error ? error : new Error(String(error))
      );

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const spells = this.discovery.getSpells();
      const response: ResolveIntentResponse = {
        status: 'not_found',
        query,
        message: `Error during intent resolution: ${errorMessage}`,
        availableSpells: Array.from(spells.entries()).map(([name, config]) => ({
          name,
          description: config.description,
        })),
      };

      this.lifecycle.incrementTurn(); // Count as turn even on error

      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
      };
    }
  }

  /**
   * Handle activate_spell tool call (ADR-0009 Tier 2 follow-up)
   * Explicitly activates a spell by name when user/agent selects from alternatives
   */
  private async handleActivateSpell(
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const { name } = args as { name: string };

    // Validate spell name
    if (!name || name.trim().length === 0) {
      throw new Error('Spell name cannot be empty');
    }

    const config = this.discovery.getSpell(name);

    if (!config) {
      throw new Error(
        `Spell '${name}' not found. Available spells: ${Array.from(this.discovery.getSpells().keys()).join(', ')}`
      );
    }

    // Spawn the MCP server and get its tools
    const tools = await this.lifecycle.spawn(name, config);

    // Inject steering
    const enhancedTools = this.injector.inject(tools, config.steering);

    // Register tools
    this.router.registerTools(name, enhancedTools);

    // Increment turn counter (ADR-0006)
    this.lifecycle.incrementTurn();

    // Run cleanup check (ADR-0006: 5-turn inactivity threshold)
    const killedSpells = await this.lifecycle.cleanupInactive(5);

    // Unregister tools from killed spells
    if (killedSpells.length > 0) {
      for (const killedName of killedSpells) {
        this.router.unregisterTools(killedName);
      }
      logger.info('LIFECYCLE', 'Auto-cleanup after activate_spell', {
        activated: name,
        killed: killedSpells,
        turn: this.lifecycle.getCurrentTurn(),
      });
    }

    // Notify client that tools have changed (covers both activation + cleanup)
    this.notifyToolsChanged();

    logger.info('INTENT', 'Spell explicitly activated', { spellName: name });

    const response = {
      status: 'activated' as const,
      spell: {
        name,
      },
      tools: enhancedTools.map((t) => t.name),
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  }

  /**
   * Helper: Convert resolution result to SpellAlternative
   */
  private toSpellAlternative(result: {
    spellName: string;
    confidence: number;
    matchType: 'keyword' | 'semantic' | 'hybrid';
  }): SpellAlternative {
    const config = this.discovery.getSpell(result.spellName);
    return {
      name: result.spellName,
      confidence: result.confidence,
      matchType: result.matchType,
      description: config?.description ?? 'No description available',
      keywords: config?.keywords.slice(0, 5) ?? [], // First 5 keywords for context
    };
  }

  /**
   * Handle regular tool call (Phase 2: simplified)
   * Returns MCP-compliant response with content array
   */
  private async handleToolCall(
    toolName: string,
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const spellName = this.router.findSpellForTool(toolName);

    if (spellName === undefined) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    // Get the MCP client for this spell
    const client = this.lifecycle.getClient(spellName);

    // Call the tool on the child MCP server
    try {
      const timer = logger.startTimer();

      logger.info('TOOL', 'Calling tool on child MCP server', {
        spellName: spellName,
        toolName,
        args,
      });

      const response = await client.callTool({
        name: toolName,
        arguments: args as Record<string, unknown>,
      });

      // Mark spell as used (for turn-based cleanup)
      this.lifecycle.markUsed(spellName);

      // Increment turn counter (ADR-0006)
      this.lifecycle.incrementTurn();

      // Run cleanup check (ADR-0006: 5-turn inactivity threshold)
      const killedSpells = await this.lifecycle.cleanupInactive(5);

      // Unregister tools and notify if cleanup happened
      if (killedSpells.length > 0) {
        for (const name of killedSpells) {
          this.router.unregisterTools(name);
        }
        logger.info('LIFECYCLE', 'Auto-cleanup after tool call', {
          killed: killedSpells,
          turn: this.lifecycle.getCurrentTurn(),
          activeSpells: this.lifecycle.getActiveSpellNames(),
        });
        this.notifyToolsChanged();
      }

      // Type assertion for response content
      const content = response.content as Array<{
        type: string;
        text?: string;
        data?: string;
        [key: string]: unknown;
      }>;

      logger.info('TOOL', 'Tool call successful', {
        spellName: spellName,
        toolName,
        contentItems: content.length,
        ...timer.end(),
      });

      return {
        content: content.map((item) => ({
          type: item.type,
          text: item.type === 'text' && item.text != null && item.text !== ''
            ? item.text
            : JSON.stringify(item),
        })),
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(
        'TOOL',
        'Tool call failed',
        error instanceof Error ? error : new Error(errorMsg)
      );

      return {
        content: [
          {
            type: 'text',
            text: `Error calling tool ${toolName} on ${spellName}: ${errorMsg}`,
          },
        ],
      };
    }
  }

  /**
   * Get all currently available tools
   * Includes:
   * - resolve_intent and activate_spell (always available)
   * - Tools from all active spells (dynamically added after spawning)
   */
  private getAllTools(): Tool[] {
    const availableSpellNames = Array.from(this.discovery.getSpells().keys());

    const tools: Tool[] = [
      {
        name: 'resolve_intent',
        description:
          'ALWAYS use this first to find and activate the right tools for any task. This is the primary way to access MCP servers - it uses intelligent intent matching to automatically spawn the right spell and return its tools. Do not try to guess spell names - let the system resolve the intent for you.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                'Natural language description of what you want to do (e.g., "book a cab", "query database", "process payment", "deploy to cloud"). Be specific about the task, not the tool name.',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'activate_spell',
        description:
          'ONLY use this tool when resolve_intent returns status="multiple_matches" and asks you to choose between alternatives. Never use this as your first action - always call resolve_intent first.',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              enum: availableSpellNames,
              description: 'Spell name from the alternatives returned by resolve_intent',
            },
          },
          required: ['name'],
        },
      },
    ];

    // Add tools from all active spells
    const activeSpellNames = this.router.getActiveSpellNames();
    for (const spellName of activeSpellNames) {
      const spellTools = this.router.getToolsForSpell(spellName);
      tools.push(...spellTools);
    }

    return tools;
  }

  /**
   * Public method for testing - handle resolve_intent call
   */
  public async handleResolveIntentCall(
    args: unknown
  ): Promise<ResolveIntentResponse> {
    const result = await this.handleResolveIntent(args);
    return JSON.parse(result.content[0].text) as ResolveIntentResponse;
  }

  /**
   * Public method for testing - handle activate_spell call
   */
  public async handleActivateSpellCall(args: unknown): Promise<{
    status: string;
    spell?: { name: string };
    tools?: string[];
    message?: string;
  }> {
    const result = await this.handleActivateSpell(args);
    return JSON.parse(result.content[0].text) as {
      status: string;
      spell?: { name: string };
      tools?: string[];
      message?: string;
    };
  }

  /**
   * Public method for testing - get available tools
   */
  public getAvailableTools(): Tool[] {
    return this.getAllTools();
  }

  /**
   * Print startup banner with configuration info
   * Shows users what's happening when run via npx
   */
  private printStartupBanner(): void {
    const isDebug = process.env.GRIMOIRE_DEBUG === 'true';

    console.error('');
    console.error('╔═══════════════════════════════════════════════════════════════╗');
    console.error('║              📚 MCP Grimoire - Your Spellbook 📚              ║');
    console.error('║               Intelligent MCP Server Orchestrator             ║');
    console.error('║                        Version 1.0.0                          ║');
    console.error('╚═══════════════════════════════════════════════════════════════╝');
    console.error('');
    console.error(`Spells Directory: ${this.discovery.getSpellDirectory()}`);
    console.error(`Debug Mode: ${isDebug ? '✓ ENABLED (verbose logs)' : '✗ Disabled (set GRIMOIRE_DEBUG=true to enable)'}`);
    console.error('');
    console.error('✨ Features:');
    console.error('  • Intent Resolution: Keyword + Semantic matching');
    console.error('  • Lazy Summoning: Spells activate on-demand (94% token savings)');
    console.error('  • Auto-Cleanup: Inactive spells dismissed after 5 turns');
    console.error('  • Hot Reload: Auto-detect spell config changes');
    console.error('');
    console.error('Ready to cast spells! 🪄');
    console.error('');
  }

  /**
   * Start the gateway server
   */
  async start(): Promise<void> {
    this.printStartupBanner();

    logger.info('STARTUP', 'Starting MCP Grimoire...');

    // Ensure grimoire directory exists
    const { ensureDirectories } = await import('../utils/paths');
    await ensureDirectories();
    logger.info('STARTUP', 'Grimoire directory ready', {
      path: this.discovery.getSpellDirectory(),
    });

    // Initialize embedding service and load cached embeddings
    this.embeddingService = await EmbeddingService.getInstance();
    await this.embeddingStorage.load();
    this.resolver = new HybridResolver(this.embeddingService, this.embeddingStorage);

    logger.info('STARTUP', 'Loaded embedding cache', {
      cached: this.embeddingStorage.getStoreInfo().count,
    });

    // Load lifecycle state from storage (kills orphaned processes, restores turn counter)
    await this.lifecycle.loadFromStorage();
    const lifecycleMetadata = this.embeddingStorage.getLifecycleMetadata();
    logger.info('STARTUP', 'Loaded lifecycle state', {
      currentTurn: lifecycleMetadata?.currentTurn ?? 0,
      trackedSpells: Object.keys(lifecycleMetadata?.usageTracking ?? {}).length,
      orphansCleanedOnStartup: lifecycleMetadata ? Object.keys(lifecycleMetadata.activePIDs).length : 0,
    });

    // Scan for spells
    const count = await this.discovery.scan();
    logger.info('STARTUP', `Discovered ${count} spell(s) in ${this.discovery.getSpellDirectory()}`, {
      count,
      directory: this.discovery.getSpellDirectory(),
    });

    // Show helpful message if no spells found
    if (count === 0) {
      console.error('\n⚠️  No spells found!');
      console.error(`   Add spell files to: ${this.discovery.getSpellDirectory()}`);
      console.error('\n💡 Quick start:');
      console.error('   grimoire example stdio -o ~/.grimoire/myspell.spell.yaml');
      console.error('   # Then edit the file with your MCP server details\n');
    }

    // Index spells for hybrid resolution
    for (const [name, config] of this.discovery.getSpells()) {
      await this.resolver.indexSpell(config);
      logger.debug('STARTUP', 'Indexed spell', { name });
    }

    // Start file watcher for hot-reloading
    this.watcher = new SpellWatcher(
      this.discovery.getSpellDirectory(),
      this.discovery,
      this.resolver,
      this.lifecycle,
      this.router,
      () => this.notifyToolsChanged()
    );
    this.watcher.start();

    // Setup stdio transport
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    logger.info('STARTUP', 'Gateway ready with confidence-based spawning and hot-reload');
  }

  /**
   * Shutdown gateway
   */
  async shutdown(): Promise<void> {
    logger.info('STARTUP', 'Shutting down gateway...');

    // Stop file watcher
    if (this.watcher) {
      await this.watcher.stop();
    }

    // Kill all active spells
    await this.lifecycle.killAll();

    await this.server.close();
  }

  /**
   * Notify client that tools list has changed
   * Called after spawning/killing spells or when files change
   */
  private notifyToolsChanged(): void {
    const currentTools = this.getAllTools();
    logger.info('MCP', '🔔 Sending tools/list_changed notification', {
      totalTools: currentTools.length,
      toolNames: currentTools.map((t) => t.name),
      activeSpells: this.router.getActiveSpellNames(),
    });
    void this.server.notification({
      method: 'notifications/tools/list_changed',
      params: {},
    });
  }

  /**
   * Calculate token savings from lazy loading
   * Estimates tokens saved by only loading 1 spell vs loading all spells upfront
   */
  private calculateTokenSavings(activatedToolCount: number, totalSpells: number): {
    estimatedTokensWithoutGateway: number;
    estimatedTokensWithGateway: number;
    tokensSaved: number;
    percentageSaved: string;
  } {
    // Assumptions:
    // - Average of 8 tools per spell
    // - Average of 150 tokens per tool description (name + description + schema)
    // - 2 gateway tools (resolve_intent + activate_spell) ~= 200 tokens
    const AVG_TOOLS_PER_SPELL = 8;
    const AVG_TOKENS_PER_TOOL = 150;
    const GATEWAY_TOOL_TOKENS = 200;

    // Without gateway: All spells loaded upfront
    const totalTools = totalSpells * AVG_TOOLS_PER_SPELL;
    const tokensWithoutGateway = totalTools * AVG_TOKENS_PER_TOOL;

    // With gateway: Only gateway tools + activated spell's tools
    const tokensWithGateway = GATEWAY_TOOL_TOKENS + (activatedToolCount * AVG_TOKENS_PER_TOOL);

    const tokensSaved = tokensWithoutGateway - tokensWithGateway;
    const percentageSaved = ((tokensSaved / tokensWithoutGateway) * 100).toFixed(1);

    return {
      estimatedTokensWithoutGateway: tokensWithoutGateway,
      estimatedTokensWithGateway: tokensWithGateway,
      tokensSaved,
      percentageSaved: `${percentageSaved}%`,
    };
  }
}
