/**
 * Cross-platform utilities for command execution
 * Handles Windows-specific requirements for spawning processes
 */

/**
 * Normalize command for cross-platform execution
 * On Windows, npm binaries need .cmd extension
 *
 * @param command - The command to normalize (e.g., 'tsx', 'node', 'python')
 * @returns Normalized command for the current platform
 *
 * @example
 * // On Unix:
 * normalizeCommand('tsx') // => 'tsx'
 *
 * // On Windows:
 * normalizeCommand('tsx') // => 'tsx.cmd'
 */
export function normalizeCommand(command: string): string {
  // Only normalize on Windows
  if (process.platform !== 'win32') {
    return command;
  }

  // List of npm/node binaries that need .cmd on Windows
  const npmBinaries = ['tsx', 'ts-node', 'node-ts', 'tsc', 'npm', 'npx', 'pnpm', 'yarn', 'bun'];

  // Check if command (without path) is an npm binary
  const parts = command.split(/[/\\]/);
  const commandName = parts[parts.length - 1] ?? command;

  if (npmBinaries.includes(commandName.toLowerCase())) {
    // If it already has .cmd, don't add it again
    if (commandName.toLowerCase().endsWith('.cmd')) {
      return command;
    }
    // Add .cmd extension
    return command + '.cmd';
  }

  return command;
}
