#!/usr/bin/env node

/**
 * MCP Grimoire CLI - Legacy Entry Point
 *
 * This file is maintained for backward compatibility with the "grimoire" bin command.
 * It simply delegates to the unified entry point in index.ts.
 *
 * Users can still run:
 * - `grimoire create`
 * - `grimoire list`
 * - etc.
 *
 * This will be routed through index.ts which detects CLI mode.
 */

import { runCLI } from './cli/run-cli';

runCLI().catch((error) => {
  console.error('CLI error:', error);
  process.exit(1);
});
