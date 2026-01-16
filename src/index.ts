#!/usr/bin/env node

/**
 * MCP Grimoire - Unified Entry Point
 *
 * This file serves as the single entry point for both:
 * 1. MCP Server mode (when called from mcp.json via npx)
 * 2. CLI mode (when called with command-line arguments)
 *
 * Detection logic:
 * - If stdin is a TTY AND there are CLI arguments → CLI mode
 * - If stdin is NOT a TTY (pipe/redirect) → MCP Server mode
 * - If no arguments → Show help and default to MCP Server mode
 */

import { GrimoireServer } from './presentation/gateway';

/**
 * Detect if we should run in MCP server mode or CLI mode
 */
function shouldRunAsMCPServer(): boolean {
  // If process.stdin is not a TTY, we're being called from MCP (stdio transport)
  // This happens when Claude Desktop spawns us with stdio pipes
  if (!process.stdin.isTTY) {
    return true;
  }

  // If we have command-line arguments (other than node and script name), run CLI
  const args = process.argv.slice(2);
  if (args.length > 0) {
    // Any argument at all means CLI mode (help, version, commands, etc.)
    return false;
  }

  // Default to MCP server mode (no args + TTY = MCP)
  return true;
}

async function runMCPServer(): Promise<void> {
  const gateway = new GrimoireServer();

  // Graceful shutdown
  process.on('SIGINT', () => {
    void gateway.shutdown().then(() => {
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    void gateway.shutdown().then(() => {
      process.exit(0);
    });
  });

  await gateway.start();
}

async function runCLI(): Promise<void> {
  // Dynamically import CLI to avoid loading Commander when not needed
  const { runCLI } = await import('./cli/run-cli');
  await runCLI();
}

async function main(): Promise<void> {
  if (shouldRunAsMCPServer()) {
    await runMCPServer();
  } else {
    await runCLI();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
