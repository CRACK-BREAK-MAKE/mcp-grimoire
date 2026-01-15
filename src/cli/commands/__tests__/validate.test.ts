import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { validateCommand } from '../validate';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('validateCommand', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let testDir: string;
  let testFilePaths: string[] = [];

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`Process.exit called with code ${code}`);
    });

    testDir = join(tmpdir(), `grimoire-validate-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    processExitSpy.mockRestore();

    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }

    for (const filePath of testFilePaths) {
      try {
        if (existsSync(filePath)) {
          rmSync(filePath);
        }
      } catch {
        // Ignore cleanup errors
      }
    }
    testFilePaths = [];
  });

  describe('Valid Spell Files', () => {
    it('should pass validation for valid stdio spell', async () => {
      // Arrange
      const filePath = join(testDir, 'valid-stdio.spell.yaml');
      writeFileSync(
        filePath,
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
  args:
    - '-y'
    - '@modelcontextprotocol/server-postgres'
`
      );

      // Act
      await validateCommand(filePath);

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Validation Passed'));
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should pass validation for valid sse spell', async () => {
      // Arrange
      const filePath = join(testDir, 'valid-sse.spell.yaml');
      writeFileSync(
        filePath,
        `name: streaming
version: 1.0.0
description: SSE server
keywords:
  - stream
  - sse
  - realtime
server:
  transport: sse
  url: http://localhost:8000/sse
`
      );

      // Act
      await validateCommand(filePath);

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Validation Passed'));
    });

    it('should pass validation for valid http spell', async () => {
      // Arrange
      const filePath = join(testDir, 'valid-http.spell.yaml');
      writeFileSync(
        filePath,
        `name: api
version: 1.0.0
description: HTTP API
keywords:
  - api
  - http
  - rest
server:
  transport: http
  url: http://localhost:3000/api
`
      );

      // Act
      await validateCommand(filePath);

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Validation Passed'));
    });

    it('should pass validation with optional steering field', async () => {
      // Arrange
      const filePath = join(testDir, 'with-steering.spell.yaml');
      writeFileSync(
        filePath,
        `name: test
version: 1.0.0
description: Test
keywords: [a, b, c]
server:
  transport: stdio
  command: echo
steering: |
  Expert guidance here
`
      );

      // Act
      await validateCommand(filePath);

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Validation Passed'));
    });
  });

  describe('Missing Required Fields', () => {
    it('should fail when name is missing', async () => {
      // Arrange
      const filePath = join(testDir, 'no-name.spell.yaml');
      writeFileSync(
        filePath,
        `version: 1.0.0
description: Test
keywords: [a, b, c]
server:
  transport: stdio
  command: echo
`
      );

      // Act & Assert
      await expect(async () => {
        await validateCommand(filePath);
      }).rejects.toThrow('Process.exit called with code 1');

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Validation Failed'));
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing required field: name')
      );
    });

    it('should fail when version is missing', async () => {
      // Arrange
      const filePath = join(testDir, 'no-version.spell.yaml');
      writeFileSync(
        filePath,
        `name: test
description: Test
keywords: [a, b, c]
server:
  transport: stdio
  command: echo
`
      );

      // Act & Assert
      await expect(async () => {
        await validateCommand(filePath);
      }).rejects.toThrow('Process.exit called with code 1');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing required field: version')
      );
    });

    it('should fail when keywords is missing', async () => {
      // Arrange
      const filePath = join(testDir, 'no-keywords.spell.yaml');
      writeFileSync(
        filePath,
        `name: test
version: 1.0.0
description: Test
server:
  transport: stdio
  command: echo
`
      );

      // Act & Assert
      await expect(async () => {
        await validateCommand(filePath);
      }).rejects.toThrow('Process.exit called with code 1');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing required field: keywords')
      );
    });

    it('should fail when server is missing', async () => {
      // Arrange
      const filePath = join(testDir, 'no-server.spell.yaml');
      writeFileSync(
        filePath,
        `name: test
version: 1.0.0
description: Test
keywords: [a, b, c]
`
      );

      // Act & Assert
      await expect(async () => {
        await validateCommand(filePath);
      }).rejects.toThrow('Process.exit called with code 1');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing required field: server')
      );
    });

    it('should fail when server.transport is missing', async () => {
      // Arrange
      const filePath = join(testDir, 'no-transport.spell.yaml');
      writeFileSync(
        filePath,
        `name: test
version: 1.0.0
description: Test
keywords: [a, b, c]
server:
  command: echo
`
      );

      // Act & Assert
      await expect(async () => {
        await validateCommand(filePath);
      }).rejects.toThrow('Process.exit called with code 1');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing required field: server.transport')
      );
    });
  });

  describe('Field Validation', () => {
    it('should fail when name is not a string', async () => {
      // Arrange
      const filePath = join(testDir, 'invalid-name-type.spell.yaml');
      writeFileSync(
        filePath,
        `name: 123
version: 1.0.0
keywords: [a, b, c]
server:
  transport: stdio
  command: echo
`
      );

      // Act & Assert
      await expect(async () => {
        await validateCommand(filePath);
      }).rejects.toThrow('Process.exit called with code 1');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Field "name" must be a string')
      );
    });

    it('should fail when name has invalid characters', async () => {
      // Arrange
      const filePath = join(testDir, 'invalid-name-chars.spell.yaml');
      writeFileSync(
        filePath,
        `name: Invalid_Name
version: 1.0.0
keywords: [a, b, c]
server:
  transport: stdio
  command: echo
`
      );

      // Act & Assert
      await expect(async () => {
        await validateCommand(filePath);
      }).rejects.toThrow('Process.exit called with code 1');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Field "name" must be lowercase alphanumeric with hyphens only')
      );
    });

    it('should fail when keywords has less than 3 items', async () => {
      // Arrange
      const filePath = join(testDir, 'few-keywords.spell.yaml');
      writeFileSync(
        filePath,
        `name: test
version: 1.0.0
keywords: [a, b]
server:
  transport: stdio
  command: echo
`
      );

      // Act & Assert
      await expect(async () => {
        await validateCommand(filePath);
      }).rejects.toThrow('Process.exit called with code 1');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Field "keywords" must have at least 3 items')
      );
    });

    it('should fail when keywords is not an array', async () => {
      // Arrange
      const filePath = join(testDir, 'keywords-not-array.spell.yaml');
      writeFileSync(
        filePath,
        `name: test
version: 1.0.0
keywords: "not an array"
server:
  transport: stdio
  command: echo
`
      );

      // Act & Assert
      await expect(async () => {
        await validateCommand(filePath);
      }).rejects.toThrow('Process.exit called with code 1');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing required field: keywords (must be array)')
      );
    });

    it('should fail when transport is invalid', async () => {
      // Arrange
      const filePath = join(testDir, 'invalid-transport.spell.yaml');
      writeFileSync(
        filePath,
        `name: test
version: 1.0.0
keywords: [a, b, c]
server:
  transport: websocket
  url: ws://localhost
`
      );

      // Act & Assert
      await expect(async () => {
        await validateCommand(filePath);
      }).rejects.toThrow('Process.exit called with code 1');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Field "server.transport" must be one of: stdio, sse, http')
      );
    });

    it('should fail when keywords contains non-strings', async () => {
      // Arrange
      const filePath = join(testDir, 'non-string-keywords.spell.yaml');
      writeFileSync(
        filePath,
        `name: test
version: 1.0.0
keywords: [a, b, 123]
server:
  transport: stdio
  command: echo
`
      );

      // Act & Assert
      await expect(async () => {
        await validateCommand(filePath);
      }).rejects.toThrow('Process.exit called with code 1');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('All keywords must be strings')
      );
    });

    it('should fail when steering is not a string', async () => {
      // Arrange
      const filePath = join(testDir, 'invalid-steering.spell.yaml');
      writeFileSync(
        filePath,
        `name: test
version: 1.0.0
keywords: [a, b, c]
server:
  transport: stdio
  command: echo
steering: 123
`
      );

      // Act & Assert
      await expect(async () => {
        await validateCommand(filePath);
      }).rejects.toThrow('Process.exit called with code 1');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Field "steering" must be a string if provided')
      );
    });
  });

  describe('Transport-Specific Validation', () => {
    it('should fail when stdio is missing command field', async () => {
      // Arrange
      const filePath = join(testDir, 'stdio-no-command.spell.yaml');
      writeFileSync(
        filePath,
        `name: test
version: 1.0.0
keywords: [a, b, c]
server:
  transport: stdio
  args: []
`
      );

      // Act & Assert
      await expect(async () => {
        await validateCommand(filePath);
      }).rejects.toThrow('Process.exit called with code 1');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing required field for stdio: server.command')
      );
    });

    it('should fail when sse is missing url field', async () => {
      // Arrange
      const filePath = join(testDir, 'sse-no-url.spell.yaml');
      writeFileSync(
        filePath,
        `name: test
version: 1.0.0
keywords: [a, b, c]
server:
  transport: sse
`
      );

      // Act & Assert
      await expect(async () => {
        await validateCommand(filePath);
      }).rejects.toThrow('Process.exit called with code 1');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing required field for sse: server.url')
      );
    });

    it('should fail when http is missing url field', async () => {
      // Arrange
      const filePath = join(testDir, 'http-no-url.spell.yaml');
      writeFileSync(
        filePath,
        `name: test
version: 1.0.0
keywords: [a, b, c]
server:
  transport: http
`
      );

      // Act & Assert
      await expect(async () => {
        await validateCommand(filePath);
      }).rejects.toThrow('Process.exit called with code 1');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing required field for http: server.url')
      );
    });
  });

  describe('Warnings', () => {
    it('should warn when description is missing', async () => {
      // Arrange
      const filePath = join(testDir, 'no-description.spell.yaml');
      writeFileSync(
        filePath,
        `name: test
version: 1.0.0
keywords: [a, b, c]
server:
  transport: stdio
  command: echo
`
      );

      // Act
      await validateCommand(filePath);

      // Assert
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Warnings:'));
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing recommended field: description')
      );
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Validation Passed'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('warning(s) found (non-critical)'));
    });

    it('should warn when stdio is missing args field', async () => {
      // Arrange
      const filePath = join(testDir, 'stdio-no-args.spell.yaml');
      writeFileSync(
        filePath,
        `name: test
version: 1.0.0
keywords: [a, b, c]
server:
  transport: stdio
  command: echo
`
      );

      // Act
      await validateCommand(filePath);

      // Assert
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing recommended field for stdio: server.args')
      );
    });

    it('should warn when keywords has more than 20 items', async () => {
      // Arrange
      const manyKeywords = Array.from({ length: 25 }, (_, i) => `keyword${i + 1}`);
      const filePath = join(testDir, 'many-keywords.spell.yaml');
      writeFileSync(
        filePath,
        `name: test
version: 1.0.0
keywords:
${manyKeywords.map((k) => `  - ${k}`).join('\n')}
server:
  transport: stdio
  command: echo
`
      );

      // Act
      await validateCommand(filePath);

      // Assert
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Field "keywords" has more than 20 items (recommended max)')
      );
    });
  });

  describe('File Errors', () => {
    it('should fail when file does not exist', async () => {
      // Arrange
      const filePath = join(testDir, 'nonexistent.spell.yaml');

      // Act & Assert
      await expect(async () => {
        await validateCommand(filePath);
      }).rejects.toThrow('Process.exit called with code 1');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`File not found: ${filePath}`)
      );
    });

    it('should fail on invalid YAML syntax', async () => {
      // Arrange
      const filePath = join(testDir, 'invalid-yaml.spell.yaml');
      writeFileSync(
        filePath,
        `name: test
  bad: indentation:
    very: wrong:
`
      );

      // Act & Assert
      await expect(async () => {
        await validateCommand(filePath);
      }).rejects.toThrow('Process.exit called with code 1');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('YAML Parse Error:')
      );
    });

    it('should fail when file is not an object', async () => {
      // Arrange
      const filePath = join(testDir, 'not-object.spell.yaml');
      writeFileSync(filePath, 'just a string');

      // Act & Assert
      await expect(async () => {
        await validateCommand(filePath);
      }).rejects.toThrow('Process.exit called with code 1');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Configuration must be an object')
      );
    });

    it('should fail when file is empty', async () => {
      // Arrange
      const filePath = join(testDir, 'empty.spell.yaml');
      writeFileSync(filePath, '');

      // Act & Assert
      await expect(async () => {
        await validateCommand(filePath);
      }).rejects.toThrow('Process.exit called with code 1');
    });
  });

  describe('Success Messages', () => {
    it('should show success message with file path', async () => {
      // Arrange
      const filePath = join(testDir, 'success.spell.yaml');
      writeFileSync(
        filePath,
        `name: success
version: 1.0.0
description: Test spell
keywords: [a, b, c]
server:
  transport: stdio
  command: echo
  args: []
`
      );

      // Act
      await validateCommand(filePath);

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Validation Passed'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining(filePath));
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No errors or warnings found')
      );
    });
  });

  describe('Multiple Errors', () => {
    it('should report all errors at once', async () => {
      // Arrange
      const filePath = join(testDir, 'multiple-errors.spell.yaml');
      writeFileSync(
        filePath,
        `name: Invalid_Name
keywords: [a]
server:
  transport: invalid
`
      );

      // Act & Assert
      await expect(async () => {
        await validateCommand(filePath);
      }).rejects.toThrow('Process.exit called with code 1');

      const errorCalls = consoleErrorSpy.mock.calls.map((call) => call.join(' '));
      const allErrors = errorCalls.join('\n');

      expect(allErrors).toContain('Field "name" must be lowercase alphanumeric');
      expect(allErrors).toContain('Missing required field: version');
      expect(allErrors).toContain('Field "keywords" must have at least 3 items');
      expect(allErrors).toContain('Field "server.transport" must be one of');
    });
  });
});
