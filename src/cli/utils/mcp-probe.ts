/**
 * MCP Server Probe Utility
 * Connects to MCP servers to validate they work and retrieve tool information
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { SpellConfig, SSEServerConfig, HTTPServerConfig } from '../../core/types';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { buildAuthHeaders, createAuthProvider } from '../../infrastructure/auth-provider.js';

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
      const serverConfig = config.server as { command: string; args?: readonly string[]; env?: Readonly<Record<string, string>> };
      transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args ? [...serverConfig.args] : [],
        env: serverConfig.env ? { ...serverConfig.env } : undefined,
      });
    } else if (transportType === 'sse') {
      const serverConfig = config.server as SSEServerConfig;

      // Build authentication headers (ADR-0012: Bearer token)
      const staticHeaders = buildAuthHeaders(serverConfig.headers, serverConfig.auth);

      // Create OAuth provider if needed (ADR-0014: OAuth Client Credentials)
      const oauthProvider = createAuthProvider(serverConfig.auth);

      const authHeaders: Record<string, string> = { ...staticHeaders };

      if (oauthProvider) {
        // Phase 2: OAuth Client Credentials - fetch token before connecting
        const accessToken = await oauthProvider.getAccessToken();
        authHeaders['Authorization'] = `Bearer ${accessToken}`;
      }

      transport = new SSEClientTransport(new URL(serverConfig.url), {
        requestInit: {
          headers: authHeaders,
        },
      });
    } else if (transportType === 'http') {
      const serverConfig = config.server as HTTPServerConfig;

      // Build authentication headers (ADR-0012: Bearer token)
      const staticHeaders = buildAuthHeaders(serverConfig.headers, serverConfig.auth);

      // Create OAuth provider if needed (ADR-0014: OAuth Client Credentials)
      const oauthProvider = createAuthProvider(serverConfig.auth);

      const authHeaders: Record<string, string> = { ...staticHeaders };

      if (oauthProvider) {
        // Phase 2: OAuth Client Credentials - fetch token before connecting
        const accessToken = await oauthProvider.getAccessToken();
        authHeaders['Authorization'] = `Bearer ${accessToken}`;
      }

      transport = new StreamableHTTPClientTransport(new URL(serverConfig.url), {
        requestInit: {
          headers: authHeaders,
        },
      });
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
    await Promise.race([client.connect(transport!), timeoutPromise]);

    // Get tools list
    const toolsResponse = await Promise.race([
      client.listTools(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Tools list timeout')), timeoutMs / 2);
      }),
    ]);

    // Try to get server info (not critical if it fails)
    const serverInfo: { name?: string; version?: string } = {};

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
      };
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
 * Generate compact, high-quality steering instructions (target: <400 words / <500 tokens)
 * Following cap-js example structure but more concise
 * Following SRP: Each helper function has ONE job
 */
export function generateSteeringFromTools(
  spellName: string,
  tools: Tool[],
  _serverInfo?: { name?: string; version?: string }
): string {
  const capitalizedName = spellName.charAt(0).toUpperCase() + spellName.slice(1).replace(/-/g, ' ');

  // Infer domain from tool names and spell name
  const domain = inferDomain(spellName, tools);

  let steering = `# ${capitalizedName} - Expert Guidance\n\n`;

  // Section 1: When to Use (30-50 words) - CRITICAL for intent resolution
  const useCases = generateUseCases(spellName, tools, domain);
  steering += `## When to Use\n${useCases}\n\n`;

  // Section 2: Tools (ONE LINE per tool, max 200 words)
  steering += `## Tools (${tools.length})\n\n`;
  steering += generateCompactToolList(tools);

  // Section 3: Workflow (50 words, 3 steps)
  const workflow = generateWorkflow(tools, domain);
  steering += `\n## Workflow\n${workflow}\n\n`;

  // Section 4: Key Practices (70-100 words, top 3-5)
  const practices = generateBestPractices(domain, tools);
  steering += `## Key Practices\n${practices}\n`;

  return steering;
}

/**
 * Infer domain from spell name and tool patterns (SRP: ONE job - domain detection)
 */
function inferDomain(spellName: string, tools: Tool[]): string {
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

/**
 * Generate concise "When to Use" section (SRP: use case generation only)
 */
function generateUseCases(spellName: string, tools: Tool[], _domain: string): string {
  const actionVerbs = extractActionVerbs(tools);
  const keywords = spellName.split('-').filter((k) => k.length > 2);

  let useCase = `Use for: ${keywords.join(', ')} operations`;

  if (actionVerbs.length > 0) {
    useCase += ` (${actionVerbs.slice(0, 5).join(', ')})`;
  }

  return useCase;
}

/**
 * Extract action verbs from tool names (SRP: verb extraction only)
 */
function extractActionVerbs(tools: Tool[]): string[] {
  const verbs = new Set<string>();
  const commonVerbs = [
    'create',
    'read',
    'update',
    'delete',
    'query',
    'search',
    'list',
    'get',
    'set',
    'add',
    'remove',
    'fetch',
    'send',
    'execute',
    'validate',
  ];

  for (const tool of tools) {
    const parts = tool.name.toLowerCase().split(/[_-]/);
    for (const part of parts) {
      if (commonVerbs.includes(part)) {
        verbs.add(part);
      }
    }
  }

  return Array.from(verbs);
}

/**
 * Generate compact tool list (one line per tool) (SRP: tool list formatting only)
 */
function generateCompactToolList(tools: Tool[]): string {
  let output = '';

  // Group tools by prefix for organization
  const groups = groupTools(tools);
  const hasMultipleGroups = Object.keys(groups).length > 1;

  for (const [category, categoryTools] of Object.entries(groups)) {
    if (hasMultipleGroups && category !== 'General') {
      output += `**${category}**:\n`;
    }

    for (const tool of categoryTools) {
      // One line: name + brief purpose + params
      const desc = tool.description ?? 'No description';
      const shortDesc = desc.split('.')[0].substring(0, 60); // First sentence, max 60 chars

      output += `**${tool.name}** - ${shortDesc}`;

      // Add compact params
      if (tool.inputSchema != null && typeof tool.inputSchema === 'object') {
        const schema = tool.inputSchema as { properties?: Record<string, unknown>; required?: string[] };
        const required = schema.required ?? [];
        if (required.length > 0) {
          output += ` | Required: ${required.join(', ')}`;
        }
      }
      output += '\n';
    }

    if (hasMultipleGroups) {
      output += '\n';
    }
  }

  return output;
}

/**
 * Generate 3-step workflow based on tool patterns (SRP: workflow generation only)
 */
function generateWorkflow(tools: Tool[], _domain: string): string {
  const toolNames = tools.map((t) => t.name.toLowerCase());

  // Detect discovery tools (list, search, get, find)
  const hasDiscovery = toolNames.some((n) => n.includes('list') || n.includes('search') || n.includes('find'));

  // Detect action tools (create, update, delete, execute)
  const hasActions = toolNames.some(
    (n) => n.includes('create') || n.includes('update') || n.includes('delete') || n.includes('execute')
  );

  // Detect validation tools
  const hasValidation = toolNames.some((n) => n.includes('validate') || n.includes('verify') || n.includes('test'));

  // Build workflow
  let workflow = '1. **Discovery**: ';
  if (hasDiscovery) {
    workflow += 'List/search available resources\n';
  } else {
    workflow += 'Identify target resource\n';
  }

  workflow += '2. **Action**: ';
  if (hasActions) {
    workflow += 'Execute operations (create/update/delete)\n';
  } else {
    workflow += 'Perform operations using available tools\n';
  }

  workflow += '3. **Verify**: ';
  if (hasValidation) {
    workflow += 'Validate results and handle errors';
  } else {
    workflow += 'Check operation results';
  }

  return workflow;
}

/**
 * Generate domain-specific best practices (top 3-5 items) (SRP: practices generation only)
 */
function generateBestPractices(domain: string, tools: Tool[]): string {
  const practices: string[] = [];

  switch (domain) {
    case 'database':
      practices.push('✅ Use parameterized queries to prevent injection attacks');
      practices.push('✅ Add LIMIT clauses for large result sets');
      practices.push('⚠️ Validate table/column names before querying');
      break;

    case 'api':
      practices.push('✅ Handle rate limits and retry with exponential backoff');
      practices.push('✅ Set timeouts for all requests (avoid hanging)');
      practices.push('⚠️ Validate API responses before using data');
      break;

    case 'filesystem':
      practices.push('✅ Validate file paths to prevent directory traversal');
      practices.push('✅ Check file permissions before operations');
      practices.push('⚠️ Handle missing files gracefully');
      break;

    case 'search':
      practices.push('✅ Start with broad queries, then narrow down');
      practices.push('✅ Set appropriate result limits to avoid overload');
      practices.push('⚠️ Handle empty results gracefully');
      break;

    default:
      practices.push('✅ Validate inputs before calling tools');
      practices.push('✅ Handle errors gracefully and provide clear feedback');
      practices.push('⚠️ Choose the most specific tool for each task');
  }

  // Add tool-specific practice if many tools
  if (tools.length > 5) {
    practices.push(`💡 ${tools.length} tools available - read descriptions carefully`);
  }

  return practices.map((p) => `${p}\n`).join('');
}

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
