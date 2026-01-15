import type { SpellConfig } from './types';

/**
 * SpellConfig validation error
 */
export class ConfigurationError extends Error {
  constructor(
    message: string,
    public readonly field?: string
  ) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * Type guard for SpellConfig
 */
export function isSpellConfig(obj: unknown): obj is SpellConfig {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'name' in obj &&
    'keywords' in obj &&
    'server' in obj
  );
}

/**
 * Validate SpellConfig fields
 * @throws {ConfigurationError} If validation fails
 */
export function validateSpellConfig(config: SpellConfig): void {
  // Name validation
  if (!config.name || config.name.trim().length === 0) {
    throw new ConfigurationError('Name is required', 'name');
  }

  if (!/^[a-z0-9-]+$/.test(config.name)) {
    throw new ConfigurationError(
      'Name must be alphanumeric with hyphens only',
      'name'
    );
  }

  // Keywords validation
  if (!Array.isArray(config.keywords)) {
    throw new ConfigurationError('Keywords must be an array', 'keywords');
  }

  if (config.keywords.length < 3) {
    throw new ConfigurationError('At least 3 keywords required', 'keywords');
  }

  if (config.keywords.length > 20) {
    throw new ConfigurationError('Maximum 20 keywords allowed', 'keywords');
  }

  // Server validation
  if (typeof config.server !== 'object' || config.server === null) {
    throw new ConfigurationError('Server configuration required', 'server');
  }

  // Check transport type (defaults to 'stdio' if not specified)
  const transport = config.server.transport || 'stdio';

  if (transport === 'stdio') {
    // Stdio transport requires command and args
    if (!('command' in config.server) || typeof config.server.command !== 'string') {
      throw new ConfigurationError('Server command required for stdio transport', 'server.command');
    }

    if (!('args' in config.server) || !Array.isArray(config.server.args)) {
      throw new ConfigurationError('Server args must be array for stdio transport', 'server.args');
    }
  } else if (transport === 'sse' || transport === 'http') {
    // SSE and HTTP transports require URL
    if (!('url' in config.server) || typeof config.server.url !== 'string') {
      throw new ConfigurationError(`Server url required for ${transport} transport`, 'server.url');
    }

    // Basic URL validation
    try {
      new URL(config.server.url);
    } catch {
      throw new ConfigurationError(`Invalid URL format: ${config.server.url}`, 'server.url');
    }
  } else {
    throw new ConfigurationError(
      `Invalid transport type: ${String(transport)}. Must be 'stdio', 'sse', or 'http'`,
      'server.transport'
    );
  }

  // Steering validation (optional)
  if (config.steering !== undefined) {
    if (typeof config.steering !== 'string') {
      throw new ConfigurationError('Steering must be string', 'steering');
    }

    if (config.steering.length > 5000) {
      throw new ConfigurationError(
        'Steering max 5000 characters',
        'steering'
      );
    }
  }
}
