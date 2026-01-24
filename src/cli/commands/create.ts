/**
 * Create Command
 * Create a new spell configuration file with optional MCP server validation
 */

import { writeFileSync } from 'fs';
import { join } from 'path';
import { getSpellDirectory } from '../../utils/paths';
import { stdioTemplate, sseTemplate, httpTemplate } from '../templates';
import {
  probeMCPServer,
  generateSteeringFromTools,
  generateDescriptionFromProbe,
} from '../utils/mcp-probe';
import { parse, stringify } from 'yaml';
import type { SpellConfig, AuthConfig } from '../../core/types';
import {
  text,
  select,
  confirm,
  parseArgs,
  Spinner,
  formatSuccess,
  formatError,
  formatInfo,
  bold,
  dim,
} from '../utils/prompts';

export interface CreateOptions {
  name?: string;
  transport?: string;
  interactive?: boolean;
  command?: string; // For stdio: the command to run
  args?: string[]; // For stdio: command arguments
  url?: string; // For sse/http: the URL
  env?: Record<string, string> | string[]; // Environment variables for stdio (can be parsed from CLI)
  probe?: boolean; // Whether to probe the server before creating
  auth?: AuthConfig; // For http/sse: authentication config
  headers?: Record<string, string>; // For http/sse: custom headers
  // CLI-specific auth fields (parsed into auth)
  authType?: string;
  authToken?: string;
  authUsername?: string;
  authPassword?: string;
  authClientId?: string;
  authClientSecret?: string;
  authTokenUrl?: string;
  authScope?: string;
  authPrivateKey?: string;
  authAlgorithm?: string;
  authJwtAssertion?: string;
}

export async function createCommand(options: CreateOptions): Promise<void> {
  // Ensure grimoire directory exists before doing anything
  const { ensureDirectories } = await import('../../utils/paths');
  await ensureDirectories();

  // Preserve original CLI values BEFORE expansion (for YAML file)
  const originalEnv = Array.isArray(options.env) ? [...options.env] : options.env;
  let originalAuthToken = options.authToken;
  let originalAuthUsername = options.authUsername;
  let originalAuthPassword = options.authPassword;
  const originalAuthClientId = options.authClientId;
  const originalAuthClientSecret = options.authClientSecret;

  // Parse CLI options into proper format FOR PROBING (with expansion)
  // 1. Parse env vars from CLI format (KEY=value array) to Record
  if (Array.isArray(options.env)) {
    const envRecord: Record<string, string> = {};
    for (const envPair of options.env) {
      const [key, ...valueParts] = envPair.split('=');
      if (key && valueParts.length > 0) {
        envRecord[key] = valueParts.join('=');
      }
    }
    options.env = envRecord;
  }

  // 2. Parse auth options from CLI flags into AuthConfig
  if (options.authType != null && options.authType.trim() !== '' && !options.auth) {
    if (
      options.authType === 'bearer' &&
      options.authToken != null &&
      options.authToken.trim() !== ''
    ) {
      options.auth = {
        type: 'bearer',
        token: options.authToken,
      };
    } else if (
      options.authType === 'basic' &&
      options.authUsername != null &&
      options.authUsername.trim() !== '' &&
      options.authPassword != null &&
      options.authPassword.trim() !== ''
    ) {
      options.auth = {
        type: 'basic',
        username: options.authUsername,
        password: options.authPassword,
      };
    } else if (options.authType === 'client_credentials') {
      if (
        options.authClientId == null ||
        options.authClientId.trim() === '' ||
        options.authClientSecret == null ||
        options.authClientSecret.trim() === '' ||
        options.authTokenUrl == null ||
        options.authTokenUrl.trim() === ''
      ) {
        throw new Error(
          'OAuth Client Credentials requires --auth-client-id, --auth-client-secret, and --auth-token-url'
        );
      }
      options.auth = {
        type: 'client_credentials',
        clientId: options.authClientId,
        clientSecret: options.authClientSecret,
        tokenUrl: options.authTokenUrl,
        scope: options.authScope,
      };
    } else if (options.authType === 'private_key_jwt') {
      if (
        options.authClientId == null ||
        options.authClientId.trim() === '' ||
        options.authPrivateKey == null ||
        options.authPrivateKey.trim() === ''
      ) {
        throw new Error('Private Key JWT requires --auth-client-id and --auth-private-key');
      }
      options.auth = {
        type: 'private_key_jwt',
        clientId: options.authClientId,
        privateKey: options.authPrivateKey,
        algorithm: (options.authAlgorithm as 'RS256' | 'ES256' | 'HS256') ?? 'RS256',
      };
    } else if (options.authType === 'static_private_key_jwt') {
      if (
        options.authClientId == null ||
        options.authClientId.trim() === '' ||
        options.authJwtAssertion == null ||
        options.authJwtAssertion.trim() === ''
      ) {
        throw new Error(
          'Static Private Key JWT requires --auth-client-id and --auth-jwt-assertion'
        );
      }
      options.auth = {
        type: 'static_private_key_jwt',
        clientId: options.authClientId,
        jwtBearerAssertion: options.authJwtAssertion,
      };
    }
  }

  // Interactive mode (default)
  if (options.interactive !== false) {
    /* eslint-disable no-console */
    console.log(`\n${bold('🔮 Welcome to MCP Grimoire')} - Spell Creation Wizard\n`);
    console.log(dim('This wizard will guide you through creating a new spell configuration.\n'));
    /* eslint-enable no-console */

    // Get spell name
    if (options.name == null || options.name === '') {
      options.name = await text({
        message: 'Spell name (required)',
        hint: "💡 Spell names typically match the MCP server you're connecting to\n   Examples: github, filesystem, postgres, notion, slack\n",
        validate: (value) => {
          if (!value || value.trim() === '')
            return 'Spell name is required - it identifies your MCP server';
          if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) {
            return 'Spell name must be lowercase alphanumeric with hyphens (e.g., my-server, github-api)';
          }
          return true;
        },
      });
    }

    // Get transport type
    if (options.transport == null || options.transport === '') {
      options.transport = await select({
        message: 'How does your MCP server communicate?',
        options: [
          {
            label: 'stdio - Standard Input/Output (most common)',
            value: 'stdio',
            description: 'Server runs as a child process',
          },
          {
            label: 'sse - Server-Sent Events',
            value: 'sse',
            description: 'Server runs remotely via HTTP/SSE',
          },
          {
            label: 'http - HTTP/REST',
            value: 'http',
            description: 'Server runs remotely via HTTP',
          },
        ],
        default: 'stdio',
      });
    }

    // Get transport-specific configuration
    if (options.transport === 'stdio') {
      if (options.command == null || options.command === '') {
        options.command = await text({
          message: 'Server command (required)',
          hint: '📦 The command to start your MCP server\n   Common commands: npx, node, python, or full path\n',
          validate: (value) => {
            if (!value || value.trim() === '') {
              return 'Command is required to start the MCP server';
            }
            return true;
          },
        });
      }

      // Trim the command
      options.command = options.command.trim();

      if (!options.args) {
        const argsString = await text({
          message: 'Command arguments (optional)',
          default: '@modelcontextprotocol/server-example',
          hint: '💡 For npx: the -y flag is automatically added to skip installation prompts\n   Just specify the package name\n',
        });

        if (argsString && argsString.trim()) {
          options.args = parseArgs(argsString.trim());

          // Auto-add -y flag for npx if not present
          if (options.command === 'npx' && !options.args.includes('-y')) {
            options.args = ['-y', ...options.args];
            /* eslint-disable-next-line no-console */
            console.log(formatSuccess('   ✓ Added -y flag for npx'));
          }
        } else {
          options.args = [];
        }
      }

      // Ask for environment variables
      if (!options.env) {
        /* eslint-disable-next-line no-console */
        console.log(
          dim('\n🌍 Environment variables are injected when spawning the MCP server process')
        );
        /* eslint-disable-next-line no-console */
        console.log(dim('   The server code can read these using process.env.VARIABLE_NAME'));
        /* eslint-disable-next-line no-console */
        console.log(dim('   Common examples: API_KEY, DATABASE_URL, GITHUB_TOKEN, AWS_REGION'));

        const needsEnv = await confirm({
          message: 'Does this MCP server need environment variables?',
          default: false,
        });

        if (needsEnv) {
          options.env = {};
          /* eslint-disable-next-line no-console */
          console.log(
            `\n${formatInfo('💡 Tip: Use \${VAR_NAME} to reference variables from your shell environment')}\n`
          );

          while (true) {
            const envName = await text({
              message: 'Environment variable name (or press Enter to finish):',
              default: '',
            });

            if (!envName || envName.trim() === '') {
              break;
            }

            const envValue = await text({
              message: `Value for ${envName} (use \${${envName}} to read from shell environment):`,
              default: `\${${envName}}`,
            });

            options.env[envName] = envValue;
          }

          if (Object.keys(options.env).length > 0) {
            /* eslint-disable-next-line no-console */
            console.log(
              `\n${formatSuccess(`Added ${Object.keys(options.env).length} environment variable(s)`)}\n`
            );
          }
        }
      }

      // Ask if they want to probe
      if (options.probe === undefined) {
        const shouldProbe = await confirm({
          message: 'Validate server and auto-generate steering?',
          default: true,
        });
        options.probe = shouldProbe;

        if (shouldProbe) {
          /* eslint-disable-next-line no-console */
          console.log(
            `\n${formatInfo('This will test if the server starts correctly and retrieve its tools.')}\n`
          );
        }
      }
    } else {
      // SSE or HTTP - remote servers MUST be probed
      if (options.url == null || options.url === '') {
        options.url = await text({
          message: `Server URL (required)`,
          hint: '🌐 The HTTP/HTTPS endpoint where your MCP server is running\n   Example: https://api.githubcopilot.com/mcp/\n',
          validate: (value) => {
            if (!value || value.trim() === '') {
              return 'URL is required for remote MCP servers';
            }
            const trimmed = value.trim();
            if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
              return 'URL must start with http:// or https://';
            }
            try {
              new URL(trimmed);
              return true;
            } catch {
              return 'Invalid URL format. Example: https://api.example.com/mcp';
            }
          },
        });
      }

      // Trim the URL
      options.url = options.url.trim();

      // Ask about authentication
      if (!options.auth) {
        /* eslint-disable-next-line no-console */
        console.log(
          dim('\n🔐 Authentication adds an Authorization header to every MCP server request')
        );
        /* eslint-disable-next-line no-console */
        console.log(dim('   Example (GitHub MCP): Authorization: Bearer github_pat_11ABCD...'));
        /* eslint-disable-next-line no-console */
        console.log(
          dim('   ⚠️  Important: Provide auth tokens here, NOT in custom headers section')
        );
        /* eslint-disable-next-line no-console */
        console.log(dim("   ⚠️  Note: stdio transport doesn't need auth (uses local processes)"));

        const needsAuth = await confirm({
          message: 'Does this MCP server require authentication?',
          default: false,
        });

        if (needsAuth) {
          const authType = await select({
            message: 'Authentication type:',
            options: [
              {
                label: 'bearer - Bearer Token (API Key)',
                value: 'bearer',
                description: 'Most common: Authorization: Bearer <token>',
              },
              {
                label: 'basic - Basic Auth (Username + Password)',
                value: 'basic',
                description: 'Authorization: Basic base64(username:password)',
              },
            ],
            default: 'bearer',
          });

          if (authType === 'bearer') {
            const tokenValue = await text({
              message: 'Enter your API token/key:',
              hint: '🔐 Example: github_pat_11ABCD... or sk-1234...\n   Your token will be securely stored in ~/.grimoire/.env',
              validate: (value) => {
                if (!value || value.trim() === '') {
                  return 'Bearer token is required for authentication';
                }
                return true;
              },
            });

            const envVarName = `${options.name.toUpperCase().replace(/-/g, '_')}__BEARER_TOKEN`;

            // Store placeholder in spell file
            options.auth = {
              type: 'bearer',
              token: `\${${envVarName}}`,
            };

            // Store literal value for .env file (will be written later)
            options.authToken = tokenValue;
            originalAuthToken = tokenValue; // Update for .env writing

            /* eslint-disable-next-line no-console */
            console.log(
              formatSuccess(`   ✓ Token will be stored as ${envVarName} in ~/.grimoire/.env`)
            );
          } else if (authType === 'basic') {
            const usernameValue = await text({
              message: 'Enter username:',
              hint: '🔐 Your credentials will be securely stored in ~/.grimoire/.env',
              validate: (value) => {
                if (!value || value.trim() === '') {
                  return 'Username is required for basic authentication';
                }
                return true;
              },
            });

            const passwordValue = await text({
              message: 'Enter password:',
              validate: (value) => {
                if (!value || value.trim() === '') {
                  return 'Password is required for basic authentication';
                }
                return true;
              },
            });

            const usernameEnvVar = `${options.name.toUpperCase().replace(/-/g, '_')}__API_USERNAME`;
            const passwordEnvVar = `${options.name.toUpperCase().replace(/-/g, '_')}__API_PASSWORD`;

            // Store placeholders in spell file
            options.auth = {
              type: 'basic',
              username: `\${${usernameEnvVar}}`,
              password: `\${${passwordEnvVar}}`,
            };

            // Store literal values for .env file (will be written later)
            options.authUsername = usernameValue;
            options.authPassword = passwordValue;
            originalAuthUsername = usernameValue; // Update for .env writing
            originalAuthPassword = passwordValue; // Update for .env writing

            /* eslint-disable-next-line no-console */
            console.log(
              formatSuccess(
                `   ✓ Credentials will be stored as ${usernameEnvVar} and ${passwordEnvVar}`
              )
            );
          }
        }
      }

      // Ask about custom headers
      if (!options.headers) {
        /* eslint-disable-next-line no-console */
        console.log(dim('\n📋 Custom HTTP headers are sent with every request to the MCP server'));
        /* eslint-disable-next-line no-console */
        console.log(dim('   Use cases: API versioning (X-API-Version: v1), client identification'));
        /* eslint-disable-next-line no-console */
        console.log(dim('   Common examples: X-Client-ID, X-Request-ID, X-Correlation-ID'));
        /* eslint-disable-next-line no-console */
        console.log(dim('   ⚠️  For API tokens, use Authentication section instead'));

        const needsHeaders = await confirm({
          message: 'Does this server require custom HTTP headers?',
          default: false,
        });

        if (needsHeaders) {
          options.headers = {};
          /* eslint-disable-next-line no-console */
          console.log(
            `\n${formatInfo('Enter custom headers (press Enter with empty name when done)')}\n`
          );

          while (true) {
            const headerName = await text({
              message: 'Header name (or press Enter to finish):',
              default: '',
            });

            if (!headerName || headerName.trim() === '') {
              break;
            }

            const headerValue = await text({
              message: `Value for ${headerName}:`,
              default: '',
            });

            options.headers[headerName] = headerValue;
          }

          if (Object.keys(options.headers).length > 0) {
            /* eslint-disable-next-line no-console */
            console.log(
              `\n${formatSuccess(`Added ${Object.keys(options.headers).length} custom header(s)`)}\n`
            );
          }
        }
      }

      // Remote servers MUST be probed to verify connectivity
      // Unlike stdio (where command might not be installed), remote servers should be running
      if (options.probe === undefined) {
        options.probe = true; // Always probe remote servers
        /* eslint-disable-next-line no-console */
        console.log(`\n${formatInfo('Verifying server connectivity and retrieving tools...')}\n`);
      }
    }

    /* eslint-disable-next-line no-console */
    console.log('');
  }

  // Validate required options for non-interactive mode

  if (options.name == null || options.name === '') {
    console.error(formatError('--name (-n) is required in non-interactive mode'));
    console.error('Usage: grimoire create -n <spell-name> -t <transport> --no-interactive');
    throw new Error('--name (-n) is required in non-interactive mode');
  }

  if (options.transport == null || options.transport === '') {
    console.error(formatError('--transport (-t) is required in non-interactive mode'));
    console.error('Valid transports: stdio, sse, http');
    throw new Error('--transport (-t) is required in non-interactive mode');
  }

  // Validate transport type
  const validTransports = ['stdio', 'sse', 'http'];
  if (!validTransports.includes(options.transport)) {
    console.error(formatError(`Invalid transport "${options.transport}"`));
    console.error(`Valid options: ${validTransports.join(', ')}`);
    throw new Error(`Invalid transport "${options.transport}"`);
  }

  // Validate spell name
  if (!/^[a-z0-9][a-z0-9-]*$/.test(options.name)) {
    console.error(formatError('Spell name must be lowercase alphanumeric with hyphens only'));
    console.error('Example: my-spell, postgres, github-api');
    throw new Error('Spell name must be lowercase alphanumeric with hyphens only');
  }

  // Validate transport-specific required fields (ALWAYS, not just when probing)
  if (options.transport === 'stdio') {
    // stdio requires command (unless interactive mode will prompt for it)
    if (typeof options.command !== 'string' || options.command.trim().length === 0) {
      console.error(formatError('--command is required for stdio transport'));
      console.error(
        'Example: grimoire create -n myspell -t stdio --command "npx" --no-interactive'
      );
      throw new Error('--command is required for stdio transport');
    }
  }

  if (options.transport === 'sse' || options.transport === 'http') {
    // http/sse requires URL (unless interactive mode will prompt for it)
    if (typeof options.url !== 'string' || options.url.trim().length === 0) {
      console.error(formatError(`--url is required for ${options.transport} transport`));
      console.error(
        `Example: grimoire create -n myspell -t ${options.transport} --url "http://localhost:3000" --no-interactive`
      );
      throw new Error(`--url is required for ${options.transport} transport`);
    }

    // Validate URL scheme
    if (!options.url.startsWith('http://') && !options.url.startsWith('https://')) {
      console.error(formatError('URL must start with http:// or https://'));
      console.error(`Invalid URL: ${options.url}`);
      throw new Error('URL must start with http:// or https://');
    }

    // Validate URL format
    try {
      new URL(options.url);
    } catch {
      console.error(formatError(`Malformed URL: ${options.url}`));
      console.error('URL must be a valid HTTP/HTTPS URL');
      throw new Error(`Malformed URL: ${options.url}`);
    }
  }

  // Validate auth completeness
  if (options.authType === 'bearer') {
    if (typeof options.authToken !== 'string' || options.authToken.trim().length === 0) {
      console.error(formatError('--auth-token is required when using --auth-type bearer'));
      console.error(
        'Example: grimoire create -n myspell -t http --url "..." --auth-type bearer --auth-token "your-token" --no-interactive'
      );
      throw new Error('--auth-token is required when using --auth-type bearer');
    }
  }

  if (options.authType === 'basic') {
    if (typeof options.authUsername !== 'string' || options.authUsername.trim().length === 0) {
      console.error(formatError('--auth-username is required when using --auth-type basic'));
      console.error(
        'Example: grimoire create -n myspell -t http --url "..." --auth-type basic --auth-username "user" --auth-password "pass" --no-interactive'
      );
      throw new Error('--auth-username is required when using --auth-type basic');
    }
    if (typeof options.authPassword !== 'string' || options.authPassword.trim().length === 0) {
      console.error(formatError('--auth-password is required when using --auth-type basic'));
      console.error(
        'Example: grimoire create -n myspell -t http --url "..." --auth-type basic --auth-username "user" --auth-password "pass" --no-interactive'
      );
      throw new Error('--auth-password is required when using --auth-type basic');
    }
  }

  // Remote servers (SSE/HTTP) MUST always be probed to verify connectivity (if URL is provided)
  // Unlike stdio (where command might not be installed), remote servers should be running
  if (
    (options.transport === 'sse' || options.transport === 'http') &&
    options.url != null &&
    options.url !== '' &&
    options.probe === undefined
  ) {
    options.probe = true;
  }

  // For interactive mode: temporarily set auth credentials in process.env for probing
  // auth-provider reads from process.env, not from .env file
  // After probe, these will be written to .env file for permanent storage
  const tempEnvVars: string[] = [];
  if (
    options.probe === true &&
    ((originalAuthToken != null && originalAuthToken !== '') ||
      (originalAuthUsername != null && originalAuthUsername !== '') ||
      (originalAuthPassword != null && originalAuthPassword !== ''))
  ) {
    const spellPrefix = options.name.toUpperCase().replace(/[^A-Z0-9]/g, '_');

    // Set bearer token in process.env if present
    if (originalAuthToken != null && originalAuthToken.trim() !== '') {
      const varName = `${spellPrefix}__BEARER_TOKEN`;
      process.env[varName] = originalAuthToken;
      tempEnvVars.push(varName);
    }

    // Set basic auth credentials in process.env if present
    if (originalAuthUsername != null && originalAuthUsername.trim() !== '') {
      const varName = `${spellPrefix}__API_USERNAME`;
      process.env[varName] = originalAuthUsername;
      tempEnvVars.push(varName);
    }
    if (originalAuthPassword != null && originalAuthPassword.trim() !== '') {
      const varName = `${spellPrefix}__API_PASSWORD`;
      process.env[varName] = originalAuthPassword;
      tempEnvVars.push(varName);
    }
  }

  // Probe the MCP server if requested
  let probeResult: Awaited<ReturnType<typeof probeMCPServer>> | null = null;
  if (options.probe === true) {
    // Validate transport-specific required options ONLY when probing

    if (options.transport === 'stdio') {
      if (options.command == null || options.command.trim() === '') {
        console.error(formatError('--command is required when using --probe with stdio transport'));
        console.error(
          'Example: grimoire create -n myspell -t stdio --command "npx" --args "-y @org/server" --probe --no-interactive'
        );
        console.error(
          'Or create without probe: grimoire create -n myspell -t stdio --no-interactive'
        );
        throw new Error('--command is required when using --probe with stdio transport');
      }
    }

    if (options.transport === 'sse' || options.transport === 'http') {
      if (options.url == null || options.url.trim() === '') {
        console.error(
          formatError(`--url is required when using --probe with ${options.transport} transport`)
        );
        console.error(
          `Example: grimoire create -n myspell -t ${options.transport} --url "http://localhost:3000" --probe --no-interactive`
        );
        console.error(
          `Or create without probe: grimoire create -n myspell -t ${options.transport} --no-interactive`
        );
        throw new Error(`--url is required when using --probe with ${options.transport} transport`);
      }
    }

    const spinner = new Spinner();
    const probeMessage =
      options.transport === 'stdio'
        ? 'Probing MCP server (may take up to 30 seconds for npx downloads)...'
        : 'Connecting to remote server...';

    /* eslint-disable-next-line no-console */
    console.log(`\n${formatInfo('The server will work fine even if probe times out')}\n`);
    spinner.start(probeMessage);

    let config: Partial<SpellConfig>;
    if (options.transport === 'stdio') {
      config = {
        name: options.name,
        server: {
          transport: 'stdio',
          command: options.command!,
          args: options.args || [],
          env: options.env, // Pass environment variables to probe
        },
      };
    } else if (options.transport === 'sse') {
      config = {
        name: options.name,
        server: {
          transport: 'sse',
          url: options.url!.trim(),
          ...(options.auth && { auth: options.auth }),
          ...(options.headers && { headers: options.headers }),
        },
      };
    } else {
      // http
      config = {
        name: options.name,
        server: {
          transport: 'http',
          url: options.url!.trim(),
          ...(options.auth && { auth: options.auth }),
          ...(options.headers && { headers: options.headers }),
        },
      };
    }

    probeResult = await probeMCPServer(config);

    if (!probeResult.success) {
      spinner.fail(`Server probe failed: ${probeResult.error}`);
      /* eslint-disable no-console */
      console.log(`\n${formatError('Common issues:')}`);
      if (options.transport === 'stdio') {
        console.log('   - Server command not found or not installed');
        console.log('   - Server requires environment variables');
        console.log('   - Server takes too long to start (increase timeout or check logs)');
        console.log('   - Command path is incorrect or not in PATH');
        console.error(`\n${formatError('Cannot create spell for unreachable stdio server.')}`);
        console.error(`   Please ensure the command is installed and working.`);
        console.error(`   Test manually: ${options.command} ${(options.args || []).join(' ')}\n`);
        /* eslint-enable no-console */

        throw new Error(`Cannot create spell for unreachable stdio server: ${probeResult.error}`);
      } else {
        // For remote servers (SSE/HTTP), fail and exit - no point creating spell for unreachable server
        console.error('   - Server is not running or not reachable');
        console.error('   - Incorrect URL or port');
        console.error('   - Server requires authentication');
        console.error('   - Network or firewall issues');
        console.error('   - Server does not implement MCP protocol correctly');
        console.error(`\n${formatError('Cannot create spell for unreachable remote server.')}`);
        console.error(`   Please ensure the server is running at: ${options.url}`);
        console.error(
          `   Then try again: grimoire create -n ${options.name} -t ${options.transport} --url "${options.url}"\n`
        );

        throw new Error(`Cannot create spell for unreachable remote server: ${probeResult.error}`);
      }
    } else {
      spinner.stop('Server probe successful!');
      /* eslint-disable no-console */
      console.log(
        `   ${dim('Server:')} ${probeResult.serverInfo?.name ?? 'Unknown'} ${probeResult.serverInfo?.version ?? ''}`
      );
      console.log(`   ${dim('Tools found:')} ${probeResult.tools?.length ?? 0}`);

      if (probeResult.tools && probeResult.tools.length > 0) {
        console.log(
          `   ${dim('Tools:')} ${probeResult.tools
            .slice(0, 5)
            .map((t) => t.name)
            .join(', ')}${probeResult.tools.length > 5 ? '...' : ''}`
        );
      }
      /* eslint-enable no-console */
    }
  }

  // Clean up temporary environment variables set for probing
  for (const varName of tempEnvVars) {
    delete process.env[varName];
  }

  // Generate template
  let template: string;
  switch (options.transport) {
    case 'stdio':
      template = stdioTemplate(options.name);
      break;
    case 'sse':
      template = sseTemplate(options.name);
      break;
    case 'http':
      template = httpTemplate(options.name);
      break;
    default:
      throw new Error(`Unsupported transport: ${options.transport}`);
  }

  // Parse template to a mutable object for updating
  // Note: YAML parse returns any by design - we work with plain objects here
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
  const config: any = parse(template);

  // Track literal values that need to go to .env file
  const envVarsToWrite: Record<string, string> = {};

  // Update server configuration based on transport type
  if (options.transport === 'stdio' && options.command != null && options.command.trim() !== '') {
    config.server.command = options.command;
    config.server.args = options.args || [];
    // Add environment variables if provided
    if (originalEnv) {
      let envRecord: Record<string, string> = {};

      if (Array.isArray(originalEnv)) {
        // Convert array format to Record
        for (const envPair of originalEnv) {
          const [key, ...valueParts] = envPair.split('=');
          if (key && valueParts.length > 0) {
            envRecord[key] = valueParts.join('=');
          }
        }
      } else {
        envRecord = originalEnv;
      }

      // Transform literals into placeholders with spell name prefix (namespaced)
      // Normalize spell name for variable prefix (uppercase, alphanumeric only)
      const spellPrefix = options.name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
      const envForYAML: Record<string, string> = {};

      for (const [key, value] of Object.entries(envRecord)) {
        if (value.includes('${')) {
          // Already a placeholder, use as-is
          envForYAML[key] = value;
        } else {
          // Literal value - create NAMESPACED placeholder for YAML, save to .env
          // This prevents collisions when multiple spells use same env var names
          const varName = `${spellPrefix}__${key}`;
          envForYAML[key] = `\${${varName}}`;
          envVarsToWrite[varName] = value;
        }
      }

      if (Object.keys(envForYAML).length > 0) {
        config.server.env = envForYAML;
      }
    }
  } else if (
    (options.transport === 'sse' || options.transport === 'http') &&
    options.url != null &&
    options.url.trim() !== ''
  ) {
    config.server.url = options.url.trim();

    // Add authentication if provided
    if (options.auth?.type != null && options.auth.type !== 'none') {
      const authConfig = { ...options.auth };
      // Normalize spell name for variable prefix (uppercase, alphanumeric only)
      const spellPrefix = options.name.toUpperCase().replace(/[^A-Z0-9]/g, '_');

      if (
        options.auth.type === 'bearer' &&
        originalAuthToken != null &&
        originalAuthToken.trim() !== ''
      ) {
        if (originalAuthToken.includes('${')) {
          // Already a placeholder
          authConfig.token = originalAuthToken;
        } else {
          // Literal value - create namespaced placeholder, save to .env
          const varName = `${spellPrefix}__BEARER_TOKEN`;
          authConfig.token = `\${${varName}}`;
          envVarsToWrite[varName] = originalAuthToken;
        }
      } else if (options.auth.type === 'basic') {
        // Use the preserved original values (before interactive prompts set placeholders)
        if (originalAuthUsername != null && originalAuthUsername.trim() !== '') {
          if (originalAuthUsername.includes('${')) {
            authConfig.username = originalAuthUsername;
          } else {
            const varName = `${spellPrefix}__API_USERNAME`;
            authConfig.username = `\${${varName}}`;
            envVarsToWrite[varName] = originalAuthUsername;
          }
        }
        if (originalAuthPassword != null && originalAuthPassword.trim() !== '') {
          if (originalAuthPassword.includes('${')) {
            authConfig.password = originalAuthPassword;
          } else {
            const varName = `${spellPrefix}__API_PASSWORD`;
            authConfig.password = `\${${varName}}`;
            envVarsToWrite[varName] = originalAuthPassword;
          }
        }
      } else if (options.auth.type === 'client_credentials') {
        if (originalAuthClientId != null && originalAuthClientId.trim() !== '') {
          if (originalAuthClientId.includes('${')) {
            authConfig.clientId = originalAuthClientId;
          } else {
            const varName = `${spellPrefix}__OAUTH_CLIENT_ID`;
            authConfig.clientId = `\${${varName}}`;
            envVarsToWrite[varName] = originalAuthClientId;
          }
        }
        if (originalAuthClientSecret != null && originalAuthClientSecret.trim() !== '') {
          if (originalAuthClientSecret.includes('${')) {
            authConfig.clientSecret = originalAuthClientSecret;
          } else {
            const varName = `${spellPrefix}__OAUTH_CLIENT_SECRET`;
            authConfig.clientSecret = `\${${varName}}`;
            envVarsToWrite[varName] = originalAuthClientSecret;
          }
        }
      }
      config.server.auth = authConfig;
    }

    // Add custom headers if provided
    if (options.headers && Object.keys(options.headers).length > 0) {
      const headersForYAML: Record<string, string> = {};
      // Normalize spell name for variable prefix (uppercase, alphanumeric only)
      const spellPrefix = options.name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
      for (const [headerName, headerValue] of Object.entries(options.headers)) {
        if (headerValue.includes('${')) {
          // Already a placeholder
          headersForYAML[headerName] = headerValue;
        } else {
          // Literal value - create namespaced placeholder, save to .env
          const headerVarName = headerName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
          const varName = `${spellPrefix}__${headerVarName}`;
          headersForYAML[headerName] = `\${${varName}}`;
          envVarsToWrite[varName] = headerValue;
        }
      }
      config.server.headers = headersForYAML;
    }
  }

  // If we probed successfully, enhance with tool information
  if (probeResult != null && probeResult.success && probeResult.tools != null) {
    // Generate steering from tools
    const steering = generateSteeringFromTools(
      options.name,
      probeResult.tools,
      probeResult.serverInfo
    );
    config.steering = steering;

    // Generate keywords from tool names - REPLACE placeholders entirely
    const toolKeywords = probeResult.tools
      .flatMap((tool) => tool.name.split('_').filter((part) => part.length >= 3))
      .filter((keyword, index, self) => self.indexOf(keyword) === index)
      .slice(0, 15);

    // Always include spell name components as keywords
    const spellNameKeywords = options.name.split('-').filter((part) => part.length >= 3);

    // Combine and deduplicate: spell name keywords + tool keywords
    const allKeywords = [...new Set([...spellNameKeywords, ...toolKeywords])];

    // Use ONLY real keywords from tools/name, ensure at least 3
    config.keywords =
      allKeywords.length >= 3
        ? allKeywords
        : [...allKeywords, 'mcp', 'server', 'tools'].slice(0, 15);

    // Generate dynamic description from server info and tools
    config.description = generateDescriptionFromProbe(
      probeResult,
      options.name,
      options.transport || 'stdio'
    );
  }
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

  template = stringify(config);

  // Write to grimoire directory
  const spellDir = getSpellDirectory();
  const fileName = `${options.name}.spell.yaml`;
  const filePath = join(spellDir, fileName);

  try {
    writeFileSync(filePath, template, 'utf-8');

    // Write literal values to ~/.grimoire/.env file
    if (Object.keys(envVarsToWrite).length > 0) {
      const { EnvManager } = await import('../../infrastructure/env-manager');
      const envPath = join(spellDir, '.env');
      const envManager = new EnvManager(envPath);
      await envManager.load();

      for (const [key, value] of Object.entries(envVarsToWrite)) {
        await envManager.set(key, value);
      }
      /* eslint-disable no-console */
      console.log(`\n${formatSuccess('Environment variables saved:')} ~/.grimoire/.env`);
      console.log(`   ${dim('Variables:')} ${Object.keys(envVarsToWrite).join(', ')}`);
      /* eslint-enable no-console */
    }

    /* eslint-disable no-console */
    console.log(`\n${formatSuccess('Spell created:')} ${filePath}`);
    console.log(`   ${dim('Name:')} ${options.name}`);
    console.log(`   ${dim('Transport:')} ${options.transport}`);

    if (probeResult?.success === true) {
      console.log(`   ${dim('Tools:')} ${probeResult.tools?.length ?? 0}`);
      console.log(`   ${dim('Status:')} ${formatSuccess('Verified working')}`);
    }

    console.log(`\n${bold('📝 Next steps:')}`);
    if (probeResult != null && probeResult.success) {
      // Probed successfully - tools and steering auto-generated
      console.log(`   1. Review the file: ${filePath}`);
      console.log(`   2. Customize keywords if needed (already populated from tools)`);
      console.log(`   3. Add any additional steering guidance`);
      console.log(`   4. Add environment variables if needed in server.env`);
    } else {
      // Not probed or probe failed - needs manual configuration
      console.log(`   1. Edit the file: ${filePath}`);
      if (options.transport === 'stdio') {
        console.log(`   2. Verify server.command and server.args are correct`);
      } else {
        console.log(`   2. Verify server.url is correct and server is running`);
      }
      console.log(`   3. Add relevant keywords (5-10 recommended)`);
      console.log(`   4. Customize the steering section with tool details and best practices`);
      console.log(`\n💡 Tip: Use --probe to test the server and auto-generate steering:`);
      if (options.transport === 'stdio') {
        console.log(
          `   grimoire create -n ${options.name} -t stdio --command "your-command" --probe --no-interactive`
        );
      } else {
        console.log(
          `   grimoire create -n ${options.name} -t ${options.transport} --url "your-url" --probe --no-interactive`
        );
      }
    }
    console.log(`\n${formatInfo(`Validate your spell: grimoire validate ${filePath}`)}`);

    // Force exit to prevent hanging due to MCP SDK resource leak
    // The SDK's StreamableHTTPClientTransport doesn't fully destroy HTTPS connections
    // after transport.close(). We add a delay in mcp-probe.ts for graceful cleanup,
    // but force exit here as final safeguard since this is a CLI command (not a server).
    // Diagnostic proof: 4 TLSWRAP + 1 Timeout persist after close() - see debug-hanging-simple.js
    // This is acceptable for CLI tools (npm, git, pnpm all do this).
    process.exit(0);
    /* eslint-enable no-console */
  } catch (error) {
    // Format error messages but re-throw for CLI wrapper to handle
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error(formatError(`Directory not found: ${spellDir}`));
      console.error('Run "grimoire" once to create the directory automatically.');
    } else if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      console.error(formatError(`Spell already exists: ${filePath}`));
      console.error('Choose a different name or delete the existing file.');
    } else {
      console.error(formatError(error instanceof Error ? error.message : 'Unknown error'));
    }

    // Re-throw error for CLI wrapper to handle (allows tests to catch)
    throw error;
  }
}
