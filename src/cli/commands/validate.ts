/**
 * Validate Command
 * Validate a spell configuration file
 */

import {readFileSync} from 'fs';
import {parse} from 'yaml';
import type {SpellConfig} from '../../core/types';
import {dim, formatError, formatSuccess, formatWarning} from '../utils/prompts';

export function validateCommand(filePath: string): void {
  try {
    // Read file
    const content = readFileSync(filePath, 'utf-8');

    // Parse YAML
    let config: unknown;
    try {
      config = parse(content);
    } catch (error) {
       
      console.error(formatError(`YAML Parse Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }

    // Validate structure
    const errors: string[] = [];
    const warnings: string[] = [];

    if (config == null || typeof config !== 'object') {
      errors.push('Configuration must be an object');
    } else {
      const cfg = config as Partial<SpellConfig>;

      // Required fields
      if (cfg.name == null || cfg.name === '') {
        errors.push('Missing required field: name');
      } else if (typeof cfg.name !== 'string') {
        errors.push('Field "name" must be a string');
      } else if (!/^[a-z0-9][a-z0-9-]*$/.test(cfg.name)) {
        errors.push('Field "name" must be lowercase alphanumeric with hyphens only');
      }

      if (cfg.version == null || cfg.version === '') {
        errors.push('Missing required field: version');
      }

      if (cfg.description == null || cfg.description === '') {
        warnings.push('Missing recommended field: description');
      }

      if (!cfg.keywords || !Array.isArray(cfg.keywords)) {
        errors.push('Missing required field: keywords (must be array)');
      } else {
        if (cfg.keywords.length < 3) {
          errors.push('Field "keywords" must have at least 3 items');
        }
        if (cfg.keywords.length > 20) {
          warnings.push('Field "keywords" has more than 20 items (recommended max)');
        }
        if (!cfg.keywords.every((k) => typeof k === 'string')) {
          errors.push('All keywords must be strings');
        }
      }

      if (!cfg.server) {
        errors.push('Missing required field: server');
      } else {
        const server = cfg.server;

        if (!server.transport) {
          errors.push('Missing required field: server.transport');
        } else if (!['stdio', 'sse', 'http'].includes(server.transport)) {
          errors.push('Field "server.transport" must be one of: stdio, sse, http');
        } else {
          const transport = server.transport as string;

          // Validate transport-specific fields
          if (transport === 'stdio') {
            if (!('command' in server)) {
              errors.push('Missing required field for stdio: server.command');
            }
            if (!('args' in server)) {
              warnings.push('Missing recommended field for stdio: server.args');
            }
          } else if (transport === 'sse' || transport === 'http') {
            if (!('url' in server)) {
              errors.push(`Missing required field for ${transport}: server.url`);
            }

            // Validate authentication configuration
            if ('auth' in server && server.auth != null) {
              const auth = server.auth as unknown as Record<string, unknown>;

              if (typeof auth !== 'object') {
                errors.push('Field "server.auth" must be an object if provided');
              } else {
                // Validate auth.type
                const authType = auth.type;
                if (typeof authType !== 'string' || authType.length === 0) {
                  errors.push('Missing required field: server.auth.type');
                } else if (!['bearer', 'client_credentials', 'oauth2', 'none'].includes(authType)) {
                  errors.push('Field "server.auth.type" must be one of: bearer, client_credentials, oauth2, none');
                }

                // Phase 1: Bearer token validation
                if (authType === 'bearer') {
                  const token = auth.token;
                  if (typeof token !== 'string' || token.length === 0) {
                    errors.push('Missing required field: server.auth.token (required for bearer auth)');
                  }
                }

                // Phase 2: OAuth Client Credentials validation
                if (authType === 'client_credentials') {
                  const clientId = auth.clientId;
                  const clientSecret = auth.clientSecret;
                  const tokenUrl = auth.tokenUrl;

                  if (typeof clientId !== 'string' || clientId.length === 0) {
                    errors.push('Missing required field: server.auth.clientId (required for client_credentials)');
                  }
                  if (typeof clientSecret !== 'string' || clientSecret.length === 0) {
                    errors.push('Missing required field: server.auth.clientSecret (required for client_credentials)');
                  }
                  if (typeof tokenUrl !== 'string' || tokenUrl.length === 0) {
                    errors.push('Missing required field: server.auth.tokenUrl (required for client_credentials)');
                  }
                }

                // Phase 3: OAuth 2.1 Authorization Code validation
                if (authType === 'oauth2') {
                  const clientId = auth.clientId;
                  const authorizationUrl = auth.authorizationUrl;
                  const tokenUrl = auth.tokenUrl;

                  if (typeof clientId !== 'string' || clientId.length === 0) {
                    errors.push('Missing required field: server.auth.clientId (required for oauth2)');
                  }
                  if (typeof authorizationUrl !== 'string' || authorizationUrl.length === 0) {
                    errors.push('Missing required field: server.auth.authorizationUrl (required for oauth2)');
                  }
                  if (typeof tokenUrl !== 'string' || tokenUrl.length === 0) {
                    errors.push('Missing required field: server.auth.tokenUrl (required for oauth2)');
                  }
                }
              }
            }

            // Validate custom headers
            if ('headers' in server && server.headers != null) {
              if (typeof server.headers !== 'object' || Array.isArray(server.headers)) {
                errors.push('Field "server.headers" must be an object if provided');
              }
            }
          }
        }
      }

      if (cfg.steering != null && cfg.steering !== '' && typeof cfg.steering !== 'string') {
        errors.push('Field "steering" must be a string if provided');
      }
    }

    // Report results
    /* eslint-disable no-console */
    if (errors.length > 0) {
      console.error(`\n${formatError(`Validation Failed:`)} ${filePath}\n`);
      errors.forEach((err) => console.error(`   ${formatError(err)}`));
    }

    if (warnings.length > 0) {
      console.warn(`\n${formatWarning('Warnings:')}\n`);
      warnings.forEach((warn) => console.warn(`   ${formatWarning(warn)}`));
    }

    if (errors.length === 0 && warnings.length === 0) {
      console.log(`\n${formatSuccess('Validation Passed:')} ${filePath}`);
      console.log(`   ${dim('No errors or warnings found.')}`);
    } else if (errors.length === 0) {
      console.log(`\n${formatSuccess('Validation Passed:')} ${filePath}`);
      console.log(`   ${dim(`${warnings.length} warning(s) found (non-critical).`)}`);
    }
    /* eslint-enable no-console */

    // Exit with error code if validation failed
    if (errors.length > 0) {
      process.exit(1);
    }
  } catch (error) {
     
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error(formatError(`File not found: ${filePath}`));
    } else {
      console.error(formatError(error instanceof Error ? error.message : 'Unknown error'));
    }
     
    process.exit(1);
  }
}
