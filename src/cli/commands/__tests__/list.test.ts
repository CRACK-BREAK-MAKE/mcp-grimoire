import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { listCommand } from '../list';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import * as pathsModule from '../../../utils/paths';

describe('listCommand', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let getSpellDirectorySpy: ReturnType<typeof vi.spyOn>;
  let testDir: string;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`Process.exit called with code ${code}`);
    });

    // Create unique test directory
    testDir = join(tmpdir(), `grimoire-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Mock getSpellDirectory to return test directory
    getSpellDirectorySpy = vi.spyOn(pathsModule, 'getSpellDirectory').mockReturnValue(testDir);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    getSpellDirectorySpy.mockRestore();

    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('No Spells Found', () => {
    it('should show helpful message when directory is empty', async () => {
      // Act
      await listCommand({});

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No spells found'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('To add a spell:'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('grimoire example stdio'));
    });

    it('should show grimoire directory path', async () => {
      // Act
      await listCommand({});

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining(testDir));
    });

    it('should not exit process when no spells', async () => {
      // Act
      await listCommand({});

      // Assert
      expect(processExitSpy).not.toHaveBeenCalled();
    });
  });

  describe('Directory Does Not Exist', () => {
    beforeEach(() => {
      // Remove test directory to simulate non-existent grimoire
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should show error when directory does not exist', async () => {
      // Act & Assert
      await expect(async () => {
        await listCommand({});
      }).rejects.toThrow('Process.exit called with code 1');

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Directory not found'));
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Run the gateway once to create it')
      );
    });
  });

  describe('Simple List (Non-Verbose)', () => {
    beforeEach(() => {
      // Create test spell files
      writeFileSync(
        join(testDir, 'postgres.spell.yaml'),
        `name: postgres
version: 1.0.0
description: PostgreSQL database
keywords:
  - database
  - sql
  - postgres
server:
  transport: stdio
  command: npx
  args: ['-y', '@modelcontextprotocol/server-postgres']
`
      );

      writeFileSync(
        join(testDir, 'github.spell.yaml'),
        `name: github
version: 1.0.0
description: GitHub integration
keywords:
  - git
  - repository
  - github
  - issues
  - pull-requests
server:
  transport: sse
  url: http://localhost:8000/sse
`
      );
    });

    it('should list all spell files', async () => {
      // Act
      await listCommand({});

      // Assert
      const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).toContain('postgres');
      expect(output).toContain('github');
    });

    it('should show transport type for each spell', async () => {
      // Act
      await listCommand({});

      // Assert
      const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).toContain('stdio');
      expect(output).toContain('sse');
    });

    it('should show keyword count', async () => {
      // Act
      await listCommand({});

      // Assert
      const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).toMatch(/3 keywords/);
      expect(output).toMatch(/5 keywords/);
    });

    it('should show total spell count', async () => {
      // Act
      await listCommand({});

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Total: 2 spells'));
    });

    it('should suggest verbose flag', async () => {
      // Act
      await listCommand({});

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Use --verbose (-v) for more details')
      );
    });

    it('should show emoji icons', async () => {
      // Act
      await listCommand({});

      // Assert
      const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).toContain('📚');
      expect(output).toContain('🔮');
    });
  });

  describe('Verbose List', () => {
    beforeEach(() => {
      writeFileSync(
        join(testDir, 'stripe.spell.yaml'),
        `name: stripe
version: 2.1.0
description: |
  Stripe payment processing
  Multiple lines of description
keywords:
  - payment
  - subscription
  - stripe
  - billing
  - checkout
  - invoice
server:
  transport: http
  url: https://api.stripe.com/v1
`
      );
    });

    it('should show detailed information in verbose mode', async () => {
      // Act
      await listCommand({ verbose: true });

      // Assert
      const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).toContain('stripe');
      // New format includes ANSI codes, so check for just the content
      expect(output).toContain('stripe.spell.yaml');
      expect(output).toContain('2.1.0');
      expect(output).toContain('http');
      expect(output).toContain('Stripe payment processing');
      expect(output).toContain('payment, subscription, stripe, billing, checkout');
    });

    it('should truncate long keyword lists', async () => {
      // Act
      await listCommand({ verbose: true });

      // Assert
      const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).toContain('...');
    });

    it('should show first line of multi-line descriptions', async () => {
      // Act
      await listCommand({ verbose: true });

      // Assert
      const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).toContain('Stripe payment processing');
      expect(output).not.toContain('Multiple lines of description');
    });

    it('should not suggest verbose flag when already verbose', async () => {
      // Act
      await listCommand({ verbose: true });

      // Assert
      expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Use --verbose'));
    });
  });

  describe('Invalid Spell Files', () => {
    beforeEach(() => {
      // Valid spell
      writeFileSync(
        join(testDir, 'valid.spell.yaml'),
        `name: valid
version: 1.0.0
keywords: [test]
server:
  transport: stdio
  command: echo
`
      );

      // Invalid YAML
      writeFileSync(join(testDir, 'invalid.spell.yaml'), `name: invalid\n  bad: indentation:`);

      // Empty file
      writeFileSync(join(testDir, 'empty.spell.yaml'), '');
    });

    it('should show warning for invalid spell files', async () => {
      // Act
      await listCommand({});

      // Assert
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('invalid.spell.yaml: Failed to parse')
      );
    });

    it('should still list valid spells when some are invalid', async () => {
      // Act
      await listCommand({});

      // Assert
      const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).toContain('valid');
    });

    it('should count all spell files even if some fail to parse', async () => {
      // Act
      await listCommand({});

      // Assert
      // Note: list command counts all .spell.yaml files, not successfully parsed count
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Total: 3 spells'));
    });
  });

  describe('Edge Cases', () => {
    it('should ignore non-.spell.yaml files', async () => {
      // Arrange
      writeFileSync(join(testDir, 'readme.md'), '# Test');
      writeFileSync(join(testDir, 'config.json'), '{}');
      writeFileSync(
        join(testDir, 'real.spell.yaml'),
        'name: real\nversion: 1.0.0\nkeywords: [test]\nserver:\n  transport: stdio\n  command: echo'
      );

      // Act
      await listCommand({});

      // Assert
      const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).toContain('real');
      expect(output).not.toContain('readme');
      expect(output).not.toContain('config');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Total: 1 spells'));
    });

    it('should handle spell with minimal config', async () => {
      // Arrange
      writeFileSync(
        join(testDir, 'minimal.spell.yaml'),
        'name: minimal\nserver:\n  transport: stdio\n  command: echo'
      );

      // Act
      await listCommand({});

      // Assert
      const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).toContain('minimal');
    });

    it('should handle spell without name field', async () => {
      // Arrange
      writeFileSync(
        join(testDir, 'noname.spell.yaml'),
        'version: 1.0.0\nserver:\n  transport: stdio\n  command: echo'
      );

      // Act
      await listCommand({});

      // Assert
      const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).toContain('noname.spell.yaml');
    });

    it('should handle spell with very long name', async () => {
      // Arrange
      const longName = 'very-long-spell-name-that-exceeds-normal-padding';
      writeFileSync(
        join(testDir, 'long.spell.yaml'),
        `name: ${longName}\nversion: 1.0.0\nkeywords: [test]\nserver:\n  transport: stdio\n  command: echo`
      );

      // Act
      await listCommand({});

      // Assert
      const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).toContain(longName);
    });

    it('should handle spell with zero keywords', async () => {
      // Arrange
      writeFileSync(
        join(testDir, 'nokeywords.spell.yaml'),
        'name: nokeywords\nversion: 1.0.0\nkeywords: []\nserver:\n  transport: stdio\n  command: echo'
      );

      // Act
      await listCommand({});

      // Assert
      const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).toContain('nokeywords');
      expect(output).toMatch(/\(0 keywords\)/);
    });

    it('should handle spell with unknown transport', async () => {
      // Arrange
      writeFileSync(
        join(testDir, 'unknown.spell.yaml'),
        'name: unknown\nversion: 1.0.0\nkeywords: [test]\nserver:\n  transport: websocket\n  url: ws://localhost'
      );

      // Act
      await listCommand({});

      // Assert
      const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).toContain('unknown');
      expect(output).toContain('websocket');
    });
  });

  describe('Multiple Spells', () => {
    beforeEach(() => {
      // Create multiple test spells
      const spells = [
        { name: 'postgres', transport: 'stdio', keywords: 3 },
        { name: 'mysql', transport: 'stdio', keywords: 4 },
        { name: 'stripe', transport: 'sse', keywords: 5 },
        { name: 'github', transport: 'http', keywords: 6 },
        { name: 'analytics', transport: 'http', keywords: 7 },
      ];

      for (const spell of spells) {
        const keywords = Array.from({ length: spell.keywords }, (_, i) => `keyword${i + 1}`);
        writeFileSync(
          join(testDir, `${spell.name}.spell.yaml`),
          `name: ${spell.name}
version: 1.0.0
description: Test spell
keywords:
${keywords.map((k) => `  - ${k}`).join('\n')}
server:
  transport: ${spell.transport}
  command: echo
`
        );
      }
    });

    it('should list all spells', async () => {
      // Act
      await listCommand({});

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Total: 5 spells'));
    });

    it('should show all spell names', async () => {
      // Act
      await listCommand({});

      // Assert
      const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).toContain('postgres');
      expect(output).toContain('mysql');
      expect(output).toContain('stripe');
      expect(output).toContain('github');
      expect(output).toContain('analytics');
    });
  });
});
