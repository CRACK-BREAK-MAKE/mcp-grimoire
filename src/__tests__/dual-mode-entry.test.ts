/**
 * Dual-Mode Entry Point Tests
 *
 * These tests verify the package works in both modes:
 * 1. MCP Server mode (via npx in mcp.json)
 * 2. CLI mode (via terminal commands)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import { existsSync } from 'fs';

describe('Dual-Mode Package', () => {
  beforeAll(() => {
    // Build before testing if dist doesn't exist
    if (!existsSync('dist')) {
      console.log('Building project for tests...');
      execSync('pnpm run build', { stdio: 'inherit' });
    }
  });
  describe('CLI Mode (grimoire binary)', () => {
    it('should show version', () => {
      const result = execSync('node dist/cli.js --version', { encoding: 'utf-8' });
      expect(result.trim()).toMatch(/^\d+\.\d+\.\d+(-beta\.\d+|-rc\.\d+)?$/);
    });

    it('should show help', () => {
      const result = execSync('node dist/cli.js --help', { encoding: 'utf-8' });
      expect(result).toContain('grimoire');
      expect(result).toContain('create');
      expect(result).toContain('list');
    });

    it('should list spells (or show empty message)', () => {
      const result = execSync('node dist/cli.js list', { encoding: 'utf-8' });
      // Either shows spell list or "No spells found" message
      const hasContent = result.includes('Spells') || result.includes('No spells found');
      expect(hasContent).toBe(true);
    });
  });

  describe('Package Configuration', () => {
    it('should have correct bin entries', () => {
      const pkg = require('../../package.json');

      expect(pkg.bin).toEqual({
        grimoire: './dist/cli.js',
        'mcp-grimoire': './dist/index.js',
      });
    });

    it('should have main entry pointing to index', () => {
      const pkg = require('../../package.json');
      expect(pkg.main).toBe('dist/index.js');
    });
  });
});
