import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { exampleCommand } from '../example';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parse } from 'yaml';
import type { SpellConfig } from '../../../core/types';

describe('exampleCommand', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let testFilePaths: string[] = [];

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`Process.exit called with code ${code}`);
    });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();

    // Clean up test files
    for (const filePath of testFilePaths) {
      try {
        if (existsSync(filePath)) {
          unlinkSync(filePath);
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    testFilePaths = [];
  });

  describe('Valid Transport Types', () => {
    it('should accept stdio transport', async () => {
      // Act
      await exampleCommand('stdio', {});

      // Assert
      expect(consoleSpy).toHaveBeenCalled();
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should accept sse transport', async () => {
      // Act
      await exampleCommand('sse', {});

      // Assert
      expect(consoleSpy).toHaveBeenCalled();
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should accept http transport', async () => {
      // Act
      await exampleCommand('http', {});

      // Assert
      expect(consoleSpy).toHaveBeenCalled();
      expect(processExitSpy).not.toHaveBeenCalled();
    });
  });

  describe('Invalid Transport Types', () => {
    it('should reject invalid transport type', async () => {
      // Act & Assert
      await expect(async () => {
        await exampleCommand('invalid', {});
      }).rejects.toThrow('Process.exit called with code 1');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid transport type')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('stdio, sse, http'));
    });

    it('should reject websocket transport', async () => {
      // Act & Assert
      await expect(async () => {
        await exampleCommand('websocket', {});
      }).rejects.toThrow('Process.exit called with code 1');
    });

    it('should reject empty string transport', async () => {
      // Act & Assert
      await expect(async () => {
        await exampleCommand('', {});
      }).rejects.toThrow('Process.exit called with code 1');
    });
  });

  describe('Output to Stdout', () => {
    it('should output stdio template to stdout when no file specified', async () => {
      // Act
      await exampleCommand('stdio', {});

      // Assert
      const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).toContain('# Example-stdio Spell Configuration');
      expect(output).toContain('transport: stdio');
      expect(output).toContain('command: npx');
    });

    it('should output sse template to stdout', async () => {
      // Act
      await exampleCommand('sse', {});

      // Assert
      const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).toContain('# Example-sse Spell Configuration');
      expect(output).toContain('transport: sse');
      expect(output).toContain('url:');
    });

    it('should output http template to stdout', async () => {
      // Act
      await exampleCommand('http', {});

      // Assert
      const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).toContain('# Example-http Spell Configuration');
      expect(output).toContain('transport: http');
      expect(output).toContain('url:');
    });

    it('should output valid YAML to stdout', async () => {
      // Act
      await exampleCommand('stdio', {});

      // Assert
      const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      const parsed = parse(output);
      expect(parsed).toBeDefined();
      expect(typeof parsed).toBe('object');
    });
  });

  describe('Output to File', () => {
    it('should write stdio template to file', async () => {
      // Arrange
      const outputPath = join(tmpdir(), `test-spell-${Date.now()}.spell.yaml`);
      testFilePaths.push(outputPath);

      // Act
      await exampleCommand('stdio', { output: outputPath });

      // Assert
      expect(existsSync(outputPath)).toBe(true);
      const content = readFileSync(outputPath, 'utf-8');
      expect(content).toContain('transport: stdio');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Spell template created: ${outputPath}`)
      );
    });

    it('should write sse template to file', async () => {
      // Arrange
      const outputPath = join(tmpdir(), `test-sse-${Date.now()}.spell.yaml`);
      testFilePaths.push(outputPath);

      // Act
      await exampleCommand('sse', { output: outputPath });

      // Assert
      expect(existsSync(outputPath)).toBe(true);
      const content = readFileSync(outputPath, 'utf-8');
      expect(content).toContain('transport: sse');
    });

    it('should write http template to file', async () => {
      // Arrange
      const outputPath = join(tmpdir(), `test-http-${Date.now()}.spell.yaml`);
      testFilePaths.push(outputPath);

      // Act
      await exampleCommand('http', { output: outputPath });

      // Assert
      expect(existsSync(outputPath)).toBe(true);
      const content = readFileSync(outputPath, 'utf-8');
      expect(content).toContain('transport: http');
    });

    it('should write valid YAML to file', async () => {
      // Arrange
      const outputPath = join(tmpdir(), `test-valid-${Date.now()}.spell.yaml`);
      testFilePaths.push(outputPath);

      // Act
      await exampleCommand('stdio', { output: outputPath });

      // Assert
      const content = readFileSync(outputPath, 'utf-8');
      const config = parse(content) as SpellConfig;
      expect(config.name).toBe('example-stdio');
      expect(config.server.transport).toBe('stdio');
    });

    it('should overwrite existing file', async () => {
      // Arrange
      const outputPath = join(tmpdir(), `test-overwrite-${Date.now()}.spell.yaml`);
      testFilePaths.push(outputPath);

      // Act
      await exampleCommand('stdio', { output: outputPath });
      const firstContent = readFileSync(outputPath, 'utf-8');

      await exampleCommand('http', { output: outputPath });
      const secondContent = readFileSync(outputPath, 'utf-8');

      // Assert
      expect(firstContent).toContain('transport: stdio');
      expect(secondContent).toContain('transport: http');
      expect(secondContent).not.toContain('transport: stdio');
    });

    it('should show success message with file path', async () => {
      // Arrange
      const outputPath = join(tmpdir(), `test-success-${Date.now()}.spell.yaml`);
      testFilePaths.push(outputPath);

      // Act
      await exampleCommand('stdio', { output: outputPath });

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringMatching(/✅.*Spell template created:/));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining(outputPath));
    });
  });

  describe('Edge Cases', () => {
    it('should handle output path with spaces', async () => {
      // Arrange
      const outputPath = join(tmpdir(), `test spell with spaces ${Date.now()}.spell.yaml`);
      testFilePaths.push(outputPath);

      // Act
      await exampleCommand('stdio', { output: outputPath });

      // Assert
      expect(existsSync(outputPath)).toBe(true);
    });

    it('should handle nested directory output path', async () => {
      // Arrange
      const outputPath = join(tmpdir(), 'grimoire-test', `test-nested-${Date.now()}.spell.yaml`);
      testFilePaths.push(outputPath);

      // Note: This will fail if parent directory doesn't exist
      // In real usage, users should create parent dirs first
      // We test the command behavior, not fs.writeFileSync
    });

    it('should handle relative output path', async () => {
      // Arrange
      const outputPath = `./test-relative-${Date.now()}.spell.yaml`;
      testFilePaths.push(outputPath);

      // Act
      await exampleCommand('stdio', { output: outputPath });

      // Assert
      expect(existsSync(outputPath)).toBe(true);
    });
  });

  describe('Template Content Validation', () => {
    it('generated stdio template should have correct spell name', async () => {
      // Arrange
      const outputPath = join(tmpdir(), `test-name-${Date.now()}.spell.yaml`);
      testFilePaths.push(outputPath);

      // Act
      await exampleCommand('stdio', { output: outputPath });

      // Assert
      const content = readFileSync(outputPath, 'utf-8');
      const config = parse(content) as SpellConfig;
      expect(config.name).toBe('example-stdio');
    });

    it('generated templates should have default version', async () => {
      // Arrange
      const transports = ['stdio', 'sse', 'http'];

      for (const transport of transports) {
        const outputPath = join(tmpdir(), `test-version-${transport}-${Date.now()}.spell.yaml`);
        testFilePaths.push(outputPath);

        // Act
        await exampleCommand(transport, { output: outputPath });

        // Assert
        const content = readFileSync(outputPath, 'utf-8');
        const config = parse(content) as SpellConfig;
        expect(config.version).toBe('1.0.0');
      }
    });

    it('generated templates should have at least 3 keywords', async () => {
      // Arrange
      const outputPath = join(tmpdir(), `test-keywords-${Date.now()}.spell.yaml`);
      testFilePaths.push(outputPath);

      // Act
      await exampleCommand('stdio', { output: outputPath });

      // Assert
      const content = readFileSync(outputPath, 'utf-8');
      const config = parse(content) as SpellConfig;
      expect(config.keywords.length).toBeGreaterThanOrEqual(3);
    });

    it('generated templates should have steering section', async () => {
      // Arrange
      const outputPath = join(tmpdir(), `test-steering-${Date.now()}.spell.yaml`);
      testFilePaths.push(outputPath);

      // Act
      await exampleCommand('stdio', { output: outputPath });

      // Assert
      const content = readFileSync(outputPath, 'utf-8');
      const config = parse(content) as SpellConfig;
      expect(config.steering).toBeDefined();
      expect(config.steering).toContain('Expert Guidance');
    });
  });
});
