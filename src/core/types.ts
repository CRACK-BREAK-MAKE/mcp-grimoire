/**
 * Core type definitions for MCP Grimoire
 * Domain layer - no external dependencies
 */

/**
 * Configuration for a spell package
 * Loaded from ~/.grimoire/*.spell.yaml files
 */
export interface SpellConfig {
  /** Unique spell name (alphanumeric + hyphens) */
  readonly name: string;

  /** Semantic version (e.g., "1.0.0") */
  readonly version: string;

  /** Human-readable description */
  readonly description: string;

  /** Intent matching keywords (3-20 items) */
  readonly keywords: ReadonlyArray<string>;

  /** MCP server configuration */
  readonly server: ServerConfig;

  /** Expert guidance (max 5000 chars) */
  readonly steering?: string;
}

/**
 * Transport type for MCP server connection
 */
export type TransportType = 'stdio' | 'sse' | 'http';

/**
 * MCP server configuration (stdio child process)
 */
export interface StdioServerConfig {
  /** Transport type */
  readonly transport?: 'stdio'; // Default

  /** Command to execute (e.g., "npx") */
  readonly command: string;

  /** Command arguments */
  readonly args: ReadonlyArray<string>;

  /** Environment variables */
  readonly env?: Readonly<Record<string, string>>;
}

/**
 * Authentication configuration for HTTP/SSE transports
 * See ADR-0011, ADR-0012, ADR-0013, ADR-0014 for authentication strategy
 */
export interface AuthConfig {
  /** Authentication type */
  readonly type:
    | 'bearer'
    | 'client_credentials'
    | 'private_key_jwt'
    | 'static_private_key_jwt'
    | 'oauth2'
    | 'basic'
    | 'none';

  // Phase 1: Bearer token authentication
  /** Bearer token (supports ${VAR} expansion) */
  readonly token?: string;

  // Phase 2: OAuth Client Credentials
  /** OAuth client ID */
  readonly clientId?: string;
  /** OAuth client secret (supports ${VAR} expansion) */
  readonly clientSecret?: string;
  /** OAuth token endpoint URL */
  readonly tokenUrl?: string;
  /** OAuth scope */
  readonly scope?: string;

  // Phase 2: Private Key JWT (RFC 7523)
  /** Private key for JWT signing (PEM format, supports ${VAR} expansion) */
  readonly privateKey?: string;
  /** Algorithm for JWT signing */
  readonly algorithm?: 'RS256' | 'ES256' | 'HS256';

  // Phase 2: Static Private Key JWT (pre-built JWT assertion)
  /** Pre-built JWT bearer assertion (supports ${VAR} expansion) */
  readonly jwtBearerAssertion?: string;

  // Basic Authentication (username + password)
  /** Username for Basic Auth (supports ${VAR} expansion) */
  readonly username?: string;
  /** Password for Basic Auth (supports ${VAR} expansion) */
  readonly password?: string;

  // Phase 3: OAuth Authorization Code + PKCE
  /** OAuth authorization endpoint URL */
  readonly authorizationUrl?: string;
  /** Redirect URI for OAuth callback */
  readonly redirectUri?: string;
}

/**
 * MCP server configuration (SSE/HTTP remote transport)
 * Unified config for both SSE and HTTP since they're identical
 */
export interface RemoteServerConfig {
  /** Transport type */
  readonly transport: 'sse' | 'http';

  /** Server endpoint URL */
  readonly url: string;

  /** Authentication configuration (Phase 1+) */
  readonly auth?: AuthConfig;

  /** Custom HTTP headers */
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * Legacy type aliases for backward compatibility
 * @deprecated Use RemoteServerConfig instead
 */
export type SSEServerConfig = RemoteServerConfig & { readonly transport: 'sse' };
export type HTTPServerConfig = RemoteServerConfig & { readonly transport: 'http' };

/**
 * MCP server configuration (all types)
 */
export type ServerConfig = StdioServerConfig | RemoteServerConfig;

/**
 * MCP tool definition
 */
export interface Tool {
  /** Tool name (unique within spell) */
  readonly name: string;

  /** Tool description (may include steering) */
  readonly description: string;

  /** JSON Schema for tool inputs */
  readonly inputSchema: ToolInputSchema;
}

export interface ToolInputSchema {
  readonly type: 'object';
  readonly properties: Record<string, unknown>;
  readonly required?: ReadonlyArray<string>;
}

/**
 * Confidence tiers for intent resolution (per ADR-0009)
 */
export enum ConfidenceTier {
  HIGH = 0.85, // Auto-spawn (high confidence)
  MEDIUM = 0.5, // Return alternatives for AI agent to choose
  LOW = 0.3, // Minimum threshold for weak matches
}

/**
 * Alternative spell option for disambiguation (ADR-0009 Tier 2/3)
 */
export interface SpellAlternative {
  readonly name: string;
  readonly confidence: number;
  readonly matchType: 'keyword' | 'semantic' | 'hybrid';
  readonly description: string;
  readonly keywords: ReadonlyArray<string>; // First 5 keywords for context
}

/**
 * Result of intent resolution
 */
export type IntentResolutionResult =
  | {
      readonly status: 'found';
      readonly spellName: string;
      readonly confidence: number;
    }
  | {
      readonly status: 'not_found';
      readonly query: string;
    }
  | {
      readonly status: 'error';
      readonly error: Error;
    };

/**
 * Result of resolve_intent tool call (gateway response)
 * Implements multi-tier confidence strategy per ADR-0009
 */
export type ResolveIntentResponse =
  // Tier 1: High confidence (≥0.85) - Auto-spawn
  | {
      readonly status: 'activated';
      readonly spell: {
        readonly name: string;
        readonly confidence: number;
        readonly matchType: 'keyword' | 'semantic' | 'hybrid';
      };
      readonly tools: ReadonlyArray<string>; // Tool names
    }
  // Tier 2: Medium confidence (0.5-0.84) - Return alternatives
  | {
      readonly status: 'multiple_matches';
      readonly query: string;
      readonly matches: ReadonlyArray<SpellAlternative>;
      readonly message: string;
    }
  // Tier 3a: Low confidence (0.3-0.49) - Weak matches
  | {
      readonly status: 'weak_matches';
      readonly query: string;
      readonly matches: ReadonlyArray<SpellAlternative>;
      readonly message: string;
    }
  // Tier 3b: No match (<0.3) - Error with suggestions
  | {
      readonly status: 'not_found';
      readonly query: string;
      readonly availableSpells: ReadonlyArray<{
        readonly name: string;
        readonly description: string;
      }>;
      readonly message: string;
    };

/**
 * Result of activate_spell tool call (new in ADR-0009)
 */
export interface ActivateSpellResponse {
  readonly status: 'activated';
  readonly spell: {
    readonly name: string;
  };
  readonly tools: ReadonlyArray<string>; // Tool names
}

/**
 * Active spell state
 */
export interface ActiveSpell {
  readonly name: string;
  readonly process: unknown; // ChildProcess (avoid Node.js dependency in core)
  readonly tools: ReadonlyArray<Tool>;
  lastUsedTurn: number;
}

/**
 * Type guard: Check if object is SpellConfig
 */
export function isSpellConfig(obj: unknown): obj is SpellConfig {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const config = obj as Record<string, unknown>;

  return (
    typeof config.name === 'string' &&
    typeof config.version === 'string' &&
    typeof config.description === 'string' &&
    Array.isArray(config.keywords) &&
    config.keywords.every((k) => typeof k === 'string') &&
    config.keywords.length >= 3 &&
    typeof config.server === 'object' &&
    config.server !== null
  );
}
