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
  // Strategy: Check args FIRST, then TTY
  // This matches the recommended dual-mode pattern for MCP servers

  // STEP 1: If we have command-line arguments → CLI mode
  const args = process.argv.slice(2);
  if (args.length > 0) {
    return false; // CLI mode (e.g., --help, create, list)
  }

  // STEP 2: No arguments - check if running in terminal vs piped
  // - If TTY (terminal): User ran `npx mcp-grimoire` with no args → Show CLI help
  // - If NOT TTY (piped): MCP client is connecting via stdio → Start MCP server
  if (process.stdin.isTTY) {
    return false; // Terminal → Show CLI help instead of hanging
  }

  // STEP 3: Default to MCP server (stdin is piped from MCP client)
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
  const isMCPMode = shouldRunAsMCPServer();

  // Debug output
  if (process.env.GRIMOIRE_DEBUG === 'true') {
    console.error('[DEBUG] Mode detection:', {
      isTTY: process.stdin.isTTY ?? 'undefined',
      args: process.argv.slice(2),
      runAsMCPServer: isMCPMode,
    });
  }

  if (isMCPMode) {
    await runMCPServer();
  } else {
    await runCLI();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
