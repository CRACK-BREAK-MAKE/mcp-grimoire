/**
 * CLI Command Runner
 * Extracted from cli.ts to enable dynamic import from unified entry point
 */

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  createCommand,
  listCommand,
  exampleCommand,
  validateCommand,
  type CreateOptions,
  type ListOptions,
  type ExampleOptions,
} from './commands';

/**
 * Run the CLI with Commander
 */
export async function runCLI(): Promise<void> {
  // Read version from package.json
  const packageJson = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8')) as {
    version: string;
  };

  const program = new Command();

  program
    .name('grimoire')
    .description('Your spellbook for MCP servers - intelligent orchestration with lazy loading')
    .version(packageJson.version)
    .showHelpAfterError('(Run with --help for usage information)');

  // Create command
  program
    .command('create')
    .description('Create a new spell configuration')
    .option('-n, --name <name>', 'Spell name')
    .option('-t, --transport <type>', 'Transport type (stdio|sse|http)')
    .option('--command <command>', 'Server command (for stdio transport)')
    .option('--args <args...>', 'Server command arguments (for stdio transport)')
    .option('--url <url>', 'Server URL (for sse/http transport)')
    .option('--env <env...>', 'Environment variables for stdio (KEY=value format)')
    .option(
      '--auth-type <type>',
      'Authentication type (bearer|basic|client_credentials|private_key_jwt|static_private_key_jwt)'
    )
    .option('--auth-token <token>', 'Bearer token for authentication')
    .option('--auth-username <username>', 'Username for Basic Auth')
    .option('--auth-password <password>', 'Password for Basic Auth')
    .option('--auth-client-id <id>', 'OAuth client ID')
    .option('--auth-client-secret <secret>', 'OAuth client secret')
    .option('--auth-token-url <url>', 'OAuth token URL')
    .option('--auth-scope <scope>', 'OAuth scope')
    .option('--auth-private-key <key>', 'Private key (PEM) for private_key_jwt')
    .option('--auth-algorithm <alg>', 'Algorithm for JWT signing (RS256|ES256|HS256)')
    .option('--auth-jwt-assertion <jwt>', 'Pre-built JWT assertion for static_private_key_jwt')
    .option('--probe', 'Probe the MCP server to validate and auto-generate steering')
    .option('--no-interactive', 'Non-interactive mode (uses defaults)')
    .action(async (options: CreateOptions) => {
      try {
        await createCommand(options);
      } catch {
        // Error already logged by createCommand, just exit
        process.exit(1);
      }
    });

  // List command
  program
    .command('list')
    .description('List all installed spells')
    .option('-v, --verbose', 'Show full details')
    .action((options: ListOptions) => {
      listCommand(options);
    });

  // Example command
  program
    .command('example')
    .description('Generate an example spell template')
    .argument('<transport>', 'Transport type: stdio, sse, or http')
    .option('-o, --output <path>', 'Output file path')
    .action((transport: string, options: ExampleOptions) => {
      exampleCommand(transport, options);
    });

  // Validate command
  program
    .command('validate')
    .description('Validate a spell configuration file')
    .argument('<file>', 'Path to spell YAML file')
    .action((file: string) => {
      validateCommand(file);
    });

  // Show help if no command provided
  if (process.argv.length === 2) {
    console.error('\n🔮 Welcome to MCP Grimoire!\n');
    program.help();
  }

  await program.parseAsync();
}
