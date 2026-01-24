import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createCommand } from '../create';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parse } from 'yaml';
import type { SpellConfig } from '../../../core/types';
import * as pathsModule from '../../../utils/paths';

describe('createCommand', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let getSpellDirectorySpy: ReturnType<typeof vi.spyOn>;
  let testDir: string;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      // Only throw on non-zero exit codes (errors)
      // Exit code 0 (success) is expected and should not fail tests
      if (code !== 0) {
        throw new Error(`Process.exit called with code ${code}`);
      }
      // For exit code 0, just return (don't actually exit or throw)
      return undefined as never;
    });

    testDir = join(tmpdir(), `grimoire-create-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    getSpellDirectorySpy = vi.spyOn(pathsModule, 'getSpellDirectory').mockReturnValue(testDir);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    getSpellDirectorySpy.mockRestore();

    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Missing Required Options', () => {
    it('should fail when name is missing', async () => {
      // Act & Assert
      await expect(async () => {
        await createCommand({ transport: 'stdio', command: 'npx', interactive: false });
      }).rejects.toThrow('--name (-n) is required');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('--name (-n) is required')
      );
    });

    it('should fail when transport is missing', async () => {
      // Act & Assert
      await expect(async () => {
        await createCommand({ name: 'test', interactive: false });
      }).rejects.toThrow('--transport (-t) is required');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('--transport (-t) is required')
      );
    });

    it('should show valid transports when transport is missing', async () => {
      // Act & Assert
      await expect(async () => {
        await createCommand({ name: 'test', interactive: false });
      }).rejects.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Valid transports: stdio, sse, http')
      );
    });
  });

  describe('Invalid Transport', () => {
    it('should reject invalid transport type', async () => {
      // Act & Assert
      await expect(async () => {
        await createCommand({ name: 'test', transport: 'invalid', interactive: false });
      }).rejects.toThrow('Invalid transport "invalid"');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid transport "invalid"')
      );
    });

    it('should reject websocket transport', async () => {
      // Act & Assert
      await expect(async () => {
        await createCommand({ name: 'test', transport: 'websocket', interactive: false });
      }).rejects.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Valid options: stdio, sse, http')
      );
    });

    it('should reject empty transport', async () => {
      // Act & Assert
      await expect(async () => {
        await createCommand({ name: 'test', transport: '', interactive: false });
      }).rejects.toThrow();
    });
  });

  describe('Invalid Spell Name', () => {
    it('should reject uppercase letters', async () => {
      // Act & Assert
      await expect(async () => {
        await createCommand({
          name: 'TestSpell',
          transport: 'stdio',
          command: 'npx',
          interactive: false,
        });
      }).rejects.toThrow('Spell name must be lowercase alphanumeric');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Spell name must be lowercase alphanumeric with hyphens only')
      );
    });

    it('should reject underscores', async () => {
      // Act & Assert
      await expect(async () => {
        await createCommand({
          name: 'test_spell',
          transport: 'stdio',
          command: 'npx',
          interactive: false,
        });
      }).rejects.toThrow();
    });

    it('should reject spaces', async () => {
      // Act & Assert
      await expect(async () => {
        await createCommand({
          name: 'test spell',
          transport: 'stdio',
          command: 'npx',
          interactive: false,
        });
      }).rejects.toThrow();
    });

    it('should reject names starting with hyphen', async () => {
      // Act & Assert
      await expect(async () => {
        await createCommand({
          name: '-test',
          transport: 'stdio',
          command: 'npx',
          interactive: false,
        });
      }).rejects.toThrow();
    });

    it('should reject special characters', async () => {
      // Act & Assert
      await expect(async () => {
        await createCommand({
          name: 'test@spell',
          transport: 'stdio',
          command: 'npx',
          interactive: false,
        });
      }).rejects.toThrow();
    });

    it('should show example valid names', async () => {
      // Act & Assert
      await expect(async () => {
        await createCommand({
          name: 'Invalid_Name',
          transport: 'stdio',
          command: 'npx',
          interactive: false,
        });
      }).rejects.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Example: my-spell, postgres, github-api')
      );
    });
  });

  describe('Valid Spell Creation', () => {
    it('should create stdio spell successfully', async () => {
      // Act
      await createCommand({
        name: 'postgres',
        transport: 'stdio',
        command: 'npx',
        interactive: false,
      });

      // Assert
      const filePath = join(testDir, 'postgres.spell.yaml');
      expect(existsSync(filePath)).toBe(true);

      const content = readFileSync(filePath, 'utf-8');
      const config = parse(content) as SpellConfig;
      expect(config.name).toBe('postgres');
      expect(config.server.transport).toBe('stdio');
    });

    it('should create sse spell successfully', async () => {
      // Act
      await createCommand({
        name: 'streaming',
        transport: 'sse',
        url: 'http://localhost:3000',
        probe: false,
        interactive: false,
      });

      // Assert
      const filePath = join(testDir, 'streaming.spell.yaml');
      expect(existsSync(filePath)).toBe(true);

      const content = readFileSync(filePath, 'utf-8');
      const config = parse(content) as SpellConfig;
      expect(config.name).toBe('streaming');
      expect(config.server.transport).toBe('sse');
    });

    it('should create http spell successfully', async () => {
      // Act
      await createCommand({
        name: 'api',
        transport: 'http',
        url: 'http://localhost:3000',
        probe: false,
        interactive: false,
      });

      // Assert
      const filePath = join(testDir, 'api.spell.yaml');
      expect(existsSync(filePath)).toBe(true);

      const content = readFileSync(filePath, 'utf-8');
      const config = parse(content) as SpellConfig;
      expect(config.name).toBe('api');
      expect(config.server.transport).toBe('http');
    });

    it('should accept hyphenated names', async () => {
      // Act
      await createCommand({
        name: 'github-api',
        transport: 'stdio',
        command: 'npx',
        interactive: false,
      });

      // Assert
      const filePath = join(testDir, 'github-api.spell.yaml');
      expect(existsSync(filePath)).toBe(true);
    });

    it('should accept numeric characters in name', async () => {
      // Act
      await createCommand({
        name: 'test123',
        transport: 'stdio',
        command: 'npx',
        interactive: false,
      });

      // Assert
      const filePath = join(testDir, 'test123.spell.yaml');
      expect(existsSync(filePath)).toBe(true);
    });

    it('should accept name starting with digit', async () => {
      // Act
      await createCommand({
        name: '3dtools',
        transport: 'stdio',
        command: 'npx',
        interactive: false,
      });

      // Assert
      const filePath = join(testDir, '3dtools.spell.yaml');
      expect(existsSync(filePath)).toBe(true);
    });
  });

  describe('Success Messages', () => {
    it('should show success message with file path', async () => {
      // Act
      await createCommand({ name: 'test', transport: 'stdio', command: 'npx', interactive: false });

      // Assert
      // New format uses formatSuccess() which produces "✓ Spell created:"
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Spell created:'));
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(join(testDir, 'test.spell.yaml'))
      );
    });

    it('should show spell details', async () => {
      // Act
      await createCommand({
        name: 'postgres',
        transport: 'sse',
        url: 'http://localhost:3000',
        probe: false,
        interactive: false,
      });

      // Assert
      // New format uses dim() for labels
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('postgres'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('sse'));
    });

    it('should show next steps', async () => {
      // Act
      await createCommand({ name: 'test', transport: 'stdio', command: 'npx', interactive: false });

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('📝 Next steps:'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Edit the file'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Verify server.command'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Add relevant keywords'));
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Customize the steering section')
      );
    });

    it('should show validate command suggestion', async () => {
      // Act
      await createCommand({ name: 'test', transport: 'stdio', command: 'npx', interactive: false });

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('grimoire validate'));
    });
  });

  describe('File Creation', () => {
    it('should create file with correct name', async () => {
      // Act
      await createCommand({
        name: 'myspell',
        transport: 'stdio',
        command: 'npx',
        interactive: false,
      });

      // Assert
      expect(existsSync(join(testDir, 'myspell.spell.yaml'))).toBe(true);
    });

    it('should create file with .spell.yaml extension', async () => {
      // Act
      await createCommand({ name: 'test', transport: 'stdio', command: 'npx', interactive: false });

      // Assert
      const filePath = join(testDir, 'test.spell.yaml');
      expect(existsSync(filePath)).toBe(true);
      expect(filePath.endsWith('.spell.yaml')).toBe(true);
    });

    it('should create file with valid YAML content', async () => {
      // Act
      await createCommand({ name: 'test', transport: 'stdio', command: 'npx', interactive: false });

      // Assert
      const filePath = join(testDir, 'test.spell.yaml');
      const content = readFileSync(filePath, 'utf-8');
      const config = parse(content);
      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
    });

    it('should create file with correct permissions', async () => {
      // Act
      await createCommand({ name: 'test', transport: 'stdio', command: 'npx', interactive: false });

      // Assert
      const filePath = join(testDir, 'test.spell.yaml');
      expect(existsSync(filePath)).toBe(true);
      // File is readable
      expect(() => readFileSync(filePath, 'utf-8')).not.toThrow();
    });
  });

  describe('Template Content', () => {
    it('should generate template with correct spell name', async () => {
      // Act
      await createCommand({
        name: 'postgres',
        transport: 'stdio',
        command: 'npx',
        interactive: false,
      });

      // Assert
      const filePath = join(testDir, 'postgres.spell.yaml');
      const content = readFileSync(filePath, 'utf-8');
      const config = parse(content) as SpellConfig;
      expect(config.name).toBe('postgres');
    });

    it('should generate template with version', async () => {
      // Act
      await createCommand({ name: 'test', transport: 'stdio', command: 'npx', interactive: false });

      // Assert
      const filePath = join(testDir, 'test.spell.yaml');
      const content = readFileSync(filePath, 'utf-8');
      const config = parse(content) as SpellConfig;
      expect(config.version).toBe('1.0.0');
    });

    it('should generate template with keywords', async () => {
      // Act
      await createCommand({ name: 'test', transport: 'stdio', command: 'npx', interactive: false });

      // Assert
      const filePath = join(testDir, 'test.spell.yaml');
      const content = readFileSync(filePath, 'utf-8');
      const config = parse(content) as SpellConfig;
      expect(Array.isArray(config.keywords)).toBe(true);
      expect(config.keywords.length).toBeGreaterThanOrEqual(3);
    });

    it('should generate template with steering section', async () => {
      // Act
      await createCommand({ name: 'test', transport: 'stdio', command: 'npx', interactive: false });

      // Assert
      const filePath = join(testDir, 'test.spell.yaml');
      const content = readFileSync(filePath, 'utf-8');
      const config = parse(content) as SpellConfig;
      expect(config.steering).toBeDefined();
      expect(typeof config.steering).toBe('string');
    });
  });

  describe('Error Handling', () => {
    it('should fail gracefully when directory does not exist', async () => {
      // Arrange
      getSpellDirectorySpy.mockReturnValue('/nonexistent/directory');

      // Act & Assert
      await expect(async () => {
        await createCommand({
          name: 'test',
          transport: 'stdio',
          command: 'npx',
          interactive: false,
        });
      }).rejects.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Directory not found'));
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Run "grimoire" once to create the directory')
      );
    });

    it('should handle write errors gracefully', async () => {
      // Arrange
      getSpellDirectorySpy.mockReturnValue('/root/forbidden');

      // Act & Assert
      await expect(async () => {
        await createCommand({
          name: 'test',
          transport: 'stdio',
          command: 'npx',
          interactive: false,
        });
      }).rejects.toThrow();
    });
  });

  describe('Multiple Spells', () => {
    it('should allow creating multiple spells', async () => {
      // Act
      await createCommand({
        name: 'spell1',
        transport: 'stdio',
        command: 'npx',
        interactive: false,
      });
      await createCommand({
        name: 'spell2',
        transport: 'sse',
        url: 'http://localhost:3000',
        probe: false,
        interactive: false,
      });
      await createCommand({
        name: 'spell3',
        transport: 'http',
        url: 'http://localhost:3000',
        probe: false,
        interactive: false,
      });

      // Assert
      expect(existsSync(join(testDir, 'spell1.spell.yaml'))).toBe(true);
      expect(existsSync(join(testDir, 'spell2.spell.yaml'))).toBe(true);
      expect(existsSync(join(testDir, 'spell3.spell.yaml'))).toBe(true);
    });

    it('should create spells with different transports', async () => {
      // Act
      await createCommand({
        name: 'stdio-test',
        transport: 'stdio',
        command: 'npx',
        interactive: false,
      });
      await createCommand({
        name: 'sse-test',
        transport: 'sse',
        url: 'http://localhost:3000',
        probe: false,
        interactive: false,
      });
      await createCommand({
        name: 'http-test',
        transport: 'http',
        url: 'http://localhost:3000',
        probe: false,
        interactive: false,
      });

      // Assert
      const stdioConfig = parse(
        readFileSync(join(testDir, 'stdio-test.spell.yaml'), 'utf-8')
      ) as SpellConfig;
      const sseConfig = parse(
        readFileSync(join(testDir, 'sse-test.spell.yaml'), 'utf-8')
      ) as SpellConfig;
      const httpConfig = parse(
        readFileSync(join(testDir, 'http-test.spell.yaml'), 'utf-8')
      ) as SpellConfig;

      expect(stdioConfig.server.transport).toBe('stdio');
      expect(sseConfig.server.transport).toBe('sse');
      expect(httpConfig.server.transport).toBe('http');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long spell names', async () => {
      // Arrange
      const longName = 'very-long-spell-name-that-is-still-valid';

      // Act
      await createCommand({
        name: longName,
        transport: 'stdio',
        command: 'npx',
        interactive: false,
      });

      // Assert
      expect(existsSync(join(testDir, `${longName}.spell.yaml`))).toBe(true);
    });

    it('should handle single character name', async () => {
      // Act
      await createCommand({ name: 'a', transport: 'stdio', command: 'npx', interactive: false });

      // Assert
      expect(existsSync(join(testDir, 'a.spell.yaml'))).toBe(true);
    });

    it('should handle name with many hyphens', async () => {
      // Act
      await createCommand({
        name: 'my-super-long-spell-name',
        transport: 'stdio',
        command: 'npx',
        interactive: false,
      });

      // Assert
      expect(existsSync(join(testDir, 'my-super-long-spell-name.spell.yaml'))).toBe(true);
    });
  });

  describe('Probe Feature', () => {
    it('should fail probe when command is required but missing', async () => {
      // Act & Assert
      await expect(async () => {
        await createCommand({
          name: 'test',
          transport: 'stdio',
          probe: true,
          interactive: false,
        });
      }).rejects.toThrow('--command is required for stdio transport');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('--command is required')
      );
    });

    it('should fail probe when url is required but missing for sse', async () => {
      // Act & Assert
      await expect(async () => {
        await createCommand({
          name: 'test',
          transport: 'sse',
          probe: true,
          interactive: false,
        });
      }).rejects.toThrow('--url is required for sse transport');

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('--url is required'));
    });

    it('should fail probe when url is required but missing for http', async () => {
      // Act & Assert
      await expect(async () => {
        await createCommand({
          name: 'test',
          transport: 'http',
          probe: true,
          interactive: false,
        });
      }).rejects.toThrow('--url is required for http transport');

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('--url is required'));
    });

    it('should set command and args when provided without probe', async () => {
      // Act
      await createCommand({
        name: 'test',
        transport: 'stdio',
        command: 'echo',
        args: ['hello'],
        interactive: false,
      });

      // Assert
      const filePath = join(testDir, 'test.spell.yaml');
      const content = readFileSync(filePath, 'utf-8');
      const config = parse(content) as SpellConfig;
      expect(config.server.command).toBe('echo');
      expect(config.server.args).toEqual(['hello']);
    });

    it('should set url when provided for sse', async () => {
      // Act
      await createCommand({
        name: 'test',
        transport: 'sse',
        url: 'http://localhost:3000/sse',
        interactive: false,
        probe: false, // Disable probe for unit test (no server running)
      });

      // Assert
      const filePath = join(testDir, 'test.spell.yaml');
      const content = readFileSync(filePath, 'utf-8');
      const config = parse(content) as any;
      expect(config.server.url).toBe('http://localhost:3000/sse');
    });

    it('should set url when provided for http', async () => {
      // Act
      await createCommand({
        name: 'test',
        transport: 'http',
        url: 'http://localhost:3000/api',
        interactive: false,
        probe: false, // Disable probe for unit test (no server running)
      });

      // Assert
      const filePath = join(testDir, 'test.spell.yaml');
      const content = readFileSync(filePath, 'utf-8');
      const config = parse(content) as any;
      expect(config.server.url).toBe('http://localhost:3000/api');
    });

    it('should show probe tip when not using probe with stdio', async () => {
      // Act
      await createCommand({
        name: 'test',
        transport: 'stdio',
        command: 'npx',
        interactive: false,
      });

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Use --probe to test'));
    });

    // Note: Testing successful probe requires an actual MCP server running
    // This is better suited for integration tests
  });
});
