/**
 * Create Command
 * Create a new spell configuration file with optional MCP server validation
 */

import { writeFileSync } from 'fs';
import { join } from 'path';
import { getSpellDirectory } from '../../utils/paths';
import { stdioTemplate, sseTemplate, httpTemplate } from '../templates';
import { probeMCPServer, generateSteeringFromTools } from '../utils/mcp-probe';
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
  authClientId?: string;
  authClientSecret?: string;
  authTokenUrl?: string;
  authScope?: string;
}

export async function createCommand(options: CreateOptions): Promise<void> {
  // Ensure grimoire directory exists before doing anything
  const { ensureDirectories } = await import('../../utils/paths');
  await ensureDirectories();

  // Preserve original CLI values BEFORE expansion (for YAML file)
  const originalEnv = Array.isArray(options.env) ? [...options.env] : options.env;
  const originalAuthToken = options.authToken;
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
        message: 'What is the name of your spell?',
        default: 'my-spell',
        validate: (value) => {
          if (!value) return 'Spell name is required';
          if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) {
            return 'Spell name must be lowercase alphanumeric with hyphens only';
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
          message: 'Server command (e.g., npx, node, python):',
          default: 'npx',
        });
      }

      if (!options.args) {
        const argsString = await text({
          message: 'Command arguments:',
          default: '-y @modelcontextprotocol/server-example',
        });
        options.args = parseArgs(argsString);
      }

      // Ask for environment variables
      if (!options.env) {
        const needsEnv = await confirm({
          message: 'Does this server require environment variables?',
          default: false,
        });

        if (needsEnv) {
          options.env = {};
          /* eslint-disable-next-line no-console */
          console.log(
            `\n${formatInfo('Enter environment variables (press Enter with empty name when done)')}\n`
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
        const defaultUrl =
          options.transport === 'sse' ? 'http://localhost:3000/sse' : 'http://localhost:3000/api';
        options.url = await text({
          message: `Server URL:`,
          default: defaultUrl,
          validate: (value) => {
            if (!value.startsWith('http')) {
              return 'URL must start with http:// or https://';
            }
            return true;
          },
        });
      }

      // Ask about authentication (Phase 1: Bearer token only)
      if (!options.auth) {
        const needsAuth = await confirm({
          message: 'Does this server require authentication?',
          default: false,
        });

        if (needsAuth) {
          const authType = await select({
            message: 'Authentication type:',
            options: [
              {
                label: 'bearer - Bearer Token (API Key)',
                value: 'bearer',
                description: 'Use Authorization: Bearer <token> header',
              },
              {
                label: 'none - No Authentication',
                value: 'none',
                description: 'Server does not require authentication',
              },
            ],
            default: 'bearer',
          });

          if (authType === 'bearer') {
            const token = await text({
              message: 'Bearer token (use ${VAR_NAME} to read from environment):',
              default: '${API_TOKEN}',
            });

            options.auth = {
              type: 'bearer',
              token,
            };
          }
        }
      }

      // Ask about custom headers
      if (!options.headers) {
        const needsHeaders = await confirm({
          message: 'Does this server require custom headers?',
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
    process.exit(1);
  }

  if (options.transport == null || options.transport === '') {
    console.error(formatError('--transport (-t) is required in non-interactive mode'));
    console.error('Valid transports: stdio, sse, http');
    process.exit(1);
  }

  // Validate transport type
  const validTransports = ['stdio', 'sse', 'http'];
  if (!validTransports.includes(options.transport)) {
    console.error(formatError(`Invalid transport "${options.transport}"`));
    console.error(`Valid options: ${validTransports.join(', ')}`);
    process.exit(1);
  }

  // Validate spell name
  if (!/^[a-z0-9][a-z0-9-]*$/.test(options.name)) {
    console.error(formatError('Spell name must be lowercase alphanumeric with hyphens only'));
    console.error('Example: my-spell, postgres, github-api');
    process.exit(1);
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
        process.exit(1);
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
        process.exit(1);
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
        console.log(`\n${formatInfo('The spell will still be created with a basic template.')}`);
        console.log('   You can manually add steering instructions later.\n');
        /* eslint-enable no-console */

        // For stdio, continue without probe results (command might not be installed yet)
        probeResult = null;
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

        process.exit(1);
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

  // Update server configuration based on transport type
  if (options.transport === 'stdio' && options.command != null && options.command.trim() !== '') {
    config.server.command = options.command;
    config.server.args = options.args || [];
    // Add environment variables if provided (restore original format with ${VAR})
    if (originalEnv) {
      if (Array.isArray(originalEnv)) {
        // Convert array format back to Record, preserving ${VAR} syntax
        const envRecord: Record<string, string> = {};
        for (const envPair of originalEnv) {
          const [key, ...valueParts] = envPair.split('=');
          if (key && valueParts.length > 0) {
            envRecord[key] = valueParts.join('=');
          }
        }
        // Only set if not empty
        if (Object.keys(envRecord).length > 0) {
          config.server.env = envRecord;
        }
      } else if (Object.keys(originalEnv).length > 0) {
        // Only set if not empty
        config.server.env = originalEnv;
      }
    }
  } else if (
    (options.transport === 'sse' || options.transport === 'http') &&
    options.url != null &&
    options.url.trim() !== ''
  ) {
    config.server.url = options.url.trim();

    // Add authentication if provided (restore original ${VAR} syntax)
    if (options.auth?.type != null && options.auth.type !== 'none') {
      // Clone auth config but use original values for secrets
      const authConfig = { ...options.auth };
      if (
        options.auth.type === 'bearer' &&
        originalAuthToken != null &&
        originalAuthToken.trim() !== ''
      ) {
        authConfig.token = originalAuthToken;
      } else if (options.auth.type === 'client_credentials') {
        if (originalAuthClientId != null && originalAuthClientId.trim() !== '')
          authConfig.clientId = originalAuthClientId;
        if (originalAuthClientSecret != null && originalAuthClientSecret.trim() !== '')
          authConfig.clientSecret = originalAuthClientSecret;
      }
      config.server.auth = authConfig;
    }

    // Add custom headers if provided
    if (options.headers && Object.keys(options.headers).length > 0) {
      config.server.headers = options.headers;
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

    // Update description with tool count
    const baseDescription =
      typeof config.description === 'string' ? config.description : 'MCP Server';
    config.description = `${baseDescription}\n\nProvides ${probeResult.tools.length} tools for various operations.`;
  }
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

  template = stringify(config);

  // Write to grimoire directory
  const spellDir = getSpellDirectory();
  const fileName = `${options.name}.spell.yaml`;
  const filePath = join(spellDir, fileName);

  try {
    writeFileSync(filePath, template, 'utf-8');
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
