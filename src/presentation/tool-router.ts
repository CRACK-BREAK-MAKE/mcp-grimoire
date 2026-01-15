import type { Tool } from '../core/types';

/**
 * Routes tool calls to appropriate child MCP servers
 */
export class ToolRouter {
  // Map tool name to spell name
  private toolToSpell = new Map<string, string>();
  // Map spell name to tools
  private spellToTools = new Map<string, Tool[]>();

  /**
   * Register tools from a spell
   */
  registerTools(spellName: string, tools: Tool[]): void {
    // Store tools for this spell
    this.spellToTools.set(spellName, tools);

    // Map each tool to spell
    for (const tool of tools) {
      this.toolToSpell.set(tool.name, spellName);
    }
  }

  /**
   * Unregister tools for a spell
   */
  unregisterTools(spellName: string): void {
    // Remove tools mapping
    this.spellToTools.delete(spellName);

    // Remove all tools belonging to this spell
    const toDelete: string[] = [];

    for (const [toolName, spell] of this.toolToSpell) {
      if (spell === spellName) {
        toDelete.push(toolName);
      }
    }

    for (const toolName of toDelete) {
      this.toolToSpell.delete(toolName);
    }
  }

  /**
   * Find which spell owns a tool
   */
  findSpellForTool(toolName: string): string | undefined {
    return this.toolToSpell.get(toolName);
  }

  /**
   * Check if tool exists
   */
  hasTool(toolName: string): boolean {
    return this.toolToSpell.has(toolName);
  }

  /**
   * Get all active spell names
   */
  getActiveSpellNames(): string[] {
    return Array.from(this.spellToTools.keys());
  }

  /**
   * Get tools for a specific spell
   */
  getToolsForSpell(spellName: string): Tool[] {
    return this.spellToTools.get(spellName) || [];
  }
}
