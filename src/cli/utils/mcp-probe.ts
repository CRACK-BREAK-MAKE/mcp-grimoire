/**
 * MCP Server Probe Utility
 * Connects to MCP servers to validate they work and retrieve tool information
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { SpellConfig, RemoteServerConfig } from '../../core/types';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../../utils/logger';
import { buildAuthHeaders, createAuthProvider } from '../../infrastructure/auth-provider';

export interface ProbeResult {
  success: boolean;
  error?: string;
  tools?: Tool[];
  serverInfo?: {
    name?: string;
    version?: string;
  };
}

/**
 * Probe an MCP server to validate it works and get tool list
 * Supports stdio, sse, and http transports
 */
export async function probeMCPServer(
  config: Partial<SpellConfig>,
  timeoutMs: number = 30000
): Promise<ProbeResult> {
  const transportType = config.server?.transport || 'stdio';

  // Validate configuration based on transport
  if (transportType === 'stdio') {
    if (!('command' in (config.server || {}))) {
      return {
        success: false,
        error: 'Stdio transport requires command',
      };
    }
  } else if (transportType === 'sse' || transportType === 'http') {
    if (!('url' in (config.server || {}))) {
      return {
        success: false,
        error: `${transportType.toUpperCase()} transport requires url`,
      };
    }
  } else {
    return {
      success: false,
      error: `Unknown transport: ${String(transportType)}`,
    };
  }

  let client: Client | null = null;
  let transport: Transport | null = null;

  try {
    // Create MCP client transport based on type
    if (transportType === 'stdio') {
      const serverConfig = config.server as {
        command: string;
        args?: readonly string[];
        env?: Readonly<Record<string, string>>;
      };
      transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args ? [...serverConfig.args] : [],
        env: serverConfig.env ? { ...serverConfig.env } : undefined,
      });
    } else if (transportType === 'sse') {
      // SSE transport uses older MCP protocol (2024-11-05): GET for SSE stream, POST to /messages
      const serverConfig = config.server as RemoteServerConfig;

      logger.info('PROBE', '[SSE] Using SSEClientTransport (old MCP protocol)');
      logger.debug('PROBE', 'Server config', {
        url: serverConfig.url,
        authType: serverConfig.auth?.type,
        hasHeaders: !!serverConfig.headers,
      });

      // Build static auth headers (Bearer, Basic Auth)
      const staticHeaders = buildAuthHeaders(serverConfig.headers, serverConfig.auth);

      logger.info('PROBE', '=== SENDING TO SSE SERVER ===');
      logger.info('PROBE', 'URL', { url: serverConfig.url });
      logger.info('PROBE', 'Auth Type', { type: serverConfig.auth?.type });
      logger.info('PROBE', 'Headers being sent', { headers: staticHeaders });
      logger.info('PROBE', '============================');

      // Create OAuth provider if needed (Client Credentials, Private Key JWT)
      const authProvider = createAuthProvider(serverConfig.auth);

      logger.debug('PROBE', 'Has authProvider', { hasProvider: !!authProvider });

      logger.info('PROBE', '=== CREATING SSE TRANSPORT ===');
      logger.info('PROBE', 'Transport Type', { transportType });
      logger.info('PROBE', 'Protocol', {
        protocol: 'Old MCP (2024-11-05): GET /sse + POST /messages',
      });
      logger.info('PROBE', '==============================');

      // Configure SSE transport with both static headers and auth provider
      transport = new SSEClientTransport(new URL(serverConfig.url), {
        authProvider,
        requestInit: {
          headers: staticHeaders,
        },
      });

      logger.info('PROBE', 'SSEClientTransport created successfully');
    } else if (transportType === 'http') {
      // HTTP transport uses newer MCP protocol (2025-03-26): Streamable HTTP
      const serverConfig = config.server as RemoteServerConfig;

      logger.info('PROBE', '[HTTP] Using StreamableHTTPClientTransport (new MCP protocol)');
      logger.debug('PROBE', 'Server config', {
        url: serverConfig.url,
        authType: serverConfig.auth?.type,
        hasHeaders: !!serverConfig.headers,
      });

      // Build static auth headers (Bearer, Basic Auth)
      const staticHeaders = buildAuthHeaders(serverConfig.headers, serverConfig.auth);

      logger.info('PROBE', '=== SENDING TO HTTP SERVER ===');
      logger.info('PROBE', 'URL', { url: serverConfig.url });
      logger.info('PROBE', 'Auth Type', { type: serverConfig.auth?.type });
      logger.info('PROBE', 'Headers being sent', { headers: staticHeaders });
      logger.info('PROBE', '===============================');

      // Create OAuth provider if needed (Client Credentials, Private Key JWT)
      const authProvider = createAuthProvider(serverConfig.auth);

      logger.debug('PROBE', 'Has authProvider', { hasProvider: !!authProvider });

      logger.info('PROBE', '=== CREATING HTTP TRANSPORT ===');
      logger.info('PROBE', 'Transport Type', { transportType });
      logger.info('PROBE', 'Protocol', { protocol: 'New MCP (2025-03-26): Streamable HTTP' });
      logger.info('PROBE', '================================');

      // Configure HTTP transport with both static headers and auth provider
      transport = new StreamableHTTPClientTransport(new URL(serverConfig.url), {
        authProvider,
        requestInit: {
          headers: staticHeaders,
        },
      });

      logger.info('PROBE', 'StreamableHTTPClientTransport created successfully');
    }

    client = new Client(
      {
        name: 'grimoire-probe',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    // Set up timeout for connection
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Server connection timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    // Connect to server with timeout
    logger.info('PROBE', '=== CONNECTING TO SERVER ===');
    logger.info('PROBE', 'Transport type', { type: transportType });
    logger.info('PROBE', 'Client info', { name: 'grimoire-probe', version: '1.0.0' });
    logger.info('PROBE', '============================');

    try {
      await Promise.race([client.connect(transport!), timeoutPromise]);
      logger.info('PROBE', '✓ Connected successfully!');
    } catch (connectError: unknown) {
      const error = connectError instanceof Error ? connectError : undefined;
      logger.error('PROBE', '✗ Connection failed', error);
      throw connectError;
    }

    // Get tools list
    logger.info('PROBE', '=== REQUESTING TOOLS LIST ===');
    let toolsResponse;
    try {
      toolsResponse = await Promise.race([
        client.listTools(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Tools list timeout')), timeoutMs / 2);
        }),
      ]);
      logger.info('PROBE', '✓ Tools list received', { count: toolsResponse.tools.length });
    } catch (toolsError: unknown) {
      const error = toolsError instanceof Error ? toolsError : undefined;
      logger.error('PROBE', '✗ Tools list failed', error);
      throw toolsError;
    }

    // Get server info from MCP protocol
    const serverVersion = client.getServerVersion();
    const serverInfo: { name?: string; version?: string } = {
      name: serverVersion?.name,
      version: serverVersion?.version,
    };

    // Success!
    return {
      success: true,
      tools: toolsResponse.tools,
      serverInfo: {
        name: serverInfo.name,
        version: serverInfo.version,
      },
    };
  } catch (error) {
    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        return {
          success: false,
          error: `Server connection timeout. Make sure the server starts quickly and responds to MCP protocol.`,
        };
      }

      if (error.message.includes('ENOENT')) {
        const detail =
          transportType === 'stdio' && 'command' in (config.server || {})
            ? `: ${(config.server as { command: string }).command}`
            : '';
        return {
          success: false,
          error: `Command not found${detail}. Make sure the command is installed and in PATH.`,
        };
      }

      if (error.message.includes('EACCES')) {
        const detail =
          transportType === 'stdio' && 'command' in (config.server || {})
            ? `: ${(config.server as { command: string }).command}`
            : '';
        return {
          success: false,
          error: `Permission denied${detail}. Check file permissions.`,
        };
      }

      return {
        success: false,
        error: error.message,
      } as const;
    }

    return {
      success: false,
      error: 'Unknown error occurred while probing server',
    };
  } finally {
    // Cleanup
    try {
      if (client) {
        await client.close();
      }
    } catch {
      // Ignore cleanup errors
    }

    try {
      if (transport) {
        // Close transport which will kill the child process
        await transport.close();
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Generate dynamic description from probe results
 * Creates a meaningful description based on server info, tool count, and transport type
 */
export function generateDescriptionFromProbe(
  probeResult: ProbeResult,
  spellName: string,
  transport: string
): string {
  const serverName = probeResult.serverInfo?.name ?? spellName;
  const serverVersion = probeResult.serverInfo?.version ?? '';
  const toolCount = probeResult.tools?.length ?? 0;

  // Build server identity line
  let description = serverName;
  if (serverVersion && serverVersion.trim().length > 0) {
    description += ` v${serverVersion}`;
  }

  // Add transport information
  const transportLabel = transport === 'stdio' ? 'stdio' : transport === 'sse' ? 'SSE' : 'HTTP';
  description += ` MCP server (${transportLabel} transport)`;

  // Add tool capability summary
  if (toolCount > 0) {
    description += `\n\nProvides ${toolCount} tool${toolCount === 1 ? '' : 's'}`;

    // Categorize tools by common prefixes
    const tools = probeResult.tools || [];
    const categories = new Map<string, string[]>();

    for (const tool of tools) {
      const prefix = tool.name.split('_')[0];
      if (!categories.has(prefix)) {
        categories.set(prefix, []);
      }
      categories.get(prefix)!.push(tool.name);
    }

    // Generate capability description
    if (categories.size > 1) {
      const actions = Array.from(categories.keys()).slice(0, 5).join(', ');
      description += ` for ${actions}`;
      if (categories.size > 5) {
        description += `, and more`;
      }
      description += ' operations';
    } else {
      description += ' for various operations';
    }
    description += '.';

    // ====== ADD DETAILED TOOL DEFINITIONS (NOT IN STEERING) ======
    // This is where tool details belong - steering is for intent resolution only
    description += '\n\n## Available Tools\n\n';

    const groups = groupTools(tools);
    const hasMultipleGroups = Object.keys(groups).length > 1;

    for (const [category, categoryTools] of Object.entries(groups)) {
      if (hasMultipleGroups && category !== 'General') {
        description += `### ${category}\n\n`;
      }

      for (const tool of categoryTools) {
        const toolDesc = tool.description ?? 'No description';
        description += `- **${tool.name}**: ${toolDesc}`;

        // Add required params if any
        if (tool.inputSchema != null && typeof tool.inputSchema === 'object') {
          const schema = tool.inputSchema as {
            properties?: Record<string, unknown>;
            required?: string[];
          };
          const required = schema.required ?? [];
          if (required.length > 0) {
            description += ` (Required: ${required.join(', ')})`;
          }
        }
        description += '\n';
      }

      if (hasMultipleGroups) {
        description += '\n';
      }
    }
  }

  return description;
}

/**
 * Generate MINIMAL steering instructions for intent resolution
 * Purpose: Help AI agents choose the RIGHT server and RIGHT tools for user queries
 * Target: <300 words / <400 tokens (gets injected into every tool description)
 *
 * Core Innovation: 94% token reduction by keeping steering minimal while listing tools
 */
export function generateSteeringFromTools(
  spellName: string,
  tools: Tool[],
  serverInfo?: { name?: string; version?: string }
): string {
  const serverName = serverInfo?.name ?? spellName;
  const serverVersion =
    typeof serverInfo?.version === 'string' && serverInfo.version.trim().length > 0
      ? ` (v${serverInfo.version})`
      : '';

  // Infer domain from tool names and spell name
  // const domain = inferDomain(spellName, tools);
  const keywords = spellName.split('-').filter((k) => k.length > 2 && k !== 'spell');

  let steering = `# ${serverName}${serverVersion} - When to Use\n\n`;

  // Section 1: Intent matching keywords from spell name
  steering += `Use when user needs: ${keywords.join(', ')} operations\n\n`;

  // Section 2: Tool list for intent matching (CRITICAL - AI needs to see tool names)
  steering += `**Available Tools (${tools.length})**:\n`;

  // Group tools by operation for better readability
  const groups = groupTools(tools);
  for (const [category, categoryTools] of Object.entries(groups)) {
    if (Object.keys(groups).length > 1 && category !== 'General') {
      steering += `\n**${category}**: `;
    }
    // Just list tool names, no descriptions (descriptions are in spell.description)
    const toolNames = categoryTools.slice(0, 15).map((t) => t.name);
    steering += toolNames.join(', ');
    if (categoryTools.length > 15) {
      steering += `, ...${categoryTools.length - 15} more`;
    }
    steering += '\n';
  }

  return steering;
}

/**
 * Infer domain from spell name and tool patterns (SRP: ONE job - domain detection)
 */
// Not yet used - reserved for future enhancement
/* function inferDomain(spellName: string, tools: Tool[]): string {
  const nameTokens = spellName.toLowerCase().split('-');
  const toolNames = tools.map((t) => t.name.toLowerCase()).join(' ');

  // Database patterns
  if (
    nameTokens.some((t) => ['postgres', 'mysql', 'mongodb', 'sql', 'database', 'db'].includes(t)) ||
    toolNames.includes('query') ||
    toolNames.includes('select') ||
    toolNames.includes('table')
  ) {
    return 'database';
  }

  // API patterns
  if (
    nameTokens.some((t) => ['api', 'rest', 'http', 'webhook'].includes(t)) ||
    toolNames.includes('request') ||
    toolNames.includes('endpoint')
  ) {
    return 'api';
  }

  // File system patterns
  if (
    nameTokens.some((t) => ['file', 'fs', 'filesystem', 'storage'].includes(t)) ||
    toolNames.includes('read') ||
    toolNames.includes('write') ||
    toolNames.includes('path')
  ) {
    return 'filesystem';
  }

  // Search patterns
  if (toolNames.includes('search') || toolNames.includes('find') || toolNames.includes('list')) {
    return 'search';
  }

  return 'general';
}
*/

/**
 * Group tools by common prefix or category
 */
function groupTools(tools: Tool[]): Record<string, Tool[]> {
  const groups: Record<string, Tool[]> = {};

  for (const tool of tools) {
    // Try to extract category from tool name (e.g., "file_read" -> "file")
    const parts = tool.name.split('_');
    const category = parts.length > 1 ? parts[0] : 'General';

    if (groups[category] == null) {
      groups[category] = [];
    }
    groups[category].push(tool);
  }

  // If we only have one group, just use "Tools" as the category
  if (Object.keys(groups).length === 1) {
    const allTools = Object.values(groups)[0];
    return { Tools: allTools };
  }

  return groups;
}
