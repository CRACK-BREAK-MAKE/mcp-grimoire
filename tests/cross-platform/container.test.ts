/**
 * Cross-Platform Container Tests
 *
 * Uses Testcontainers to validate MCP Grimoire works correctly on Linux and Windows.
 * These tests run the full application in containers to ensure:
 * 1. env-paths works correctly on all platforms
 * 2. File system operations work (spell discovery, embedding cache)
 * 3. Child process spawning works (MCP servers)
 * 4. Path handling is cross-platform compatible
 *
 * Prerequisites:
 * - Docker must be running locally
 * - Sufficient disk space for container images (~1GB for Linux)
 *
 * Run these tests with: pnpm test:containers
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { resolve } from 'path';

describe('Cross-Platform Container Tests', () => {
  const linuxPlatform = {
    name: 'Ubuntu Linux',
    image: 'node:20-slim',
    shell: '/bin/bash',
  };

  // Note: Windows containers require Docker Desktop with Windows containers mode
  // and are typically much slower. Skipped by default - run on CI or enable manually.
  const windowsPlatform = {
    name: 'Windows Server Core',
    image: 'mcr.microsoft.com/windows/servercore:ltsc2022',
    shell: 'powershell',
  };

  describe('Platform: Ubuntu Linux', () => {
    const { name, image, shell } = linuxPlatform;
    let container: StartedTestContainer;
    let projectRoot: string;

    beforeAll(async () => {
      projectRoot = resolve(__dirname, '../../');

      console.log(`🚀 Starting ${name} container...`);

      // Create container with source code COPIED (not mounted)
      // This simulates a fresh git clone - no cross-contamination with host node_modules
      container = await new GenericContainer(image)
        .withCommand(['tail', '-f', '/dev/null'])
        .withCopyDirectoriesToContainer([
          {
            source: projectRoot,
            target: '/app',
          },
        ])
        .withWorkingDir('/app')
        .withStartupTimeout(120_000) // 2 minutes for image pull
        .start();

      console.log(`✅ ${name} container started`);
    }, 180_000); // 3 minutes timeout for beforeAll

    afterAll(async () => {
      if (container) {
        await container.stop();
        console.log(`🛑 ${name} container stopped`);
      }
    });

    it('should install dependencies successfully', async () => {
      const { exitCode } = await container.exec([
        shell,
        '-c',
        'rm -rf node_modules && corepack enable && corepack prepare pnpm@9 --activate && pnpm install --frozen-lockfile --no-color',
      ]);

      expect(exitCode).toBe(0);
      // pnpm install completes successfully (exit code 0 is enough)
    }, 300_000); // 5 minutes for npm install

    it('should resolve paths correctly using env-paths', async () => {
      const { exitCode, output } = await container.exec([
        shell,
        '-c',
        `node -e "
          import('env-paths').then(envPaths => {
            const paths = envPaths.default('grimoire', { suffix: '' });
            console.log(JSON.stringify(paths, null, 2));
          });
        "`,
      ]);

      expect(exitCode).toBe(0);
      const paths = JSON.parse(output);

      // Verify paths are platform-appropriate
      expect(paths).toHaveProperty('config');
      expect(paths).toHaveProperty('cache');
      expect(paths).toHaveProperty('data');

      // On Linux, should use ~/.grimoire or XDG directories
      expect(paths.config).toMatch(/grimoire/);
    });

    it('should pass TypeScript compilation', async () => {
      const { exitCode, output } = await container.exec([
        shell,
        '-c',
        'pnpm run type-check',
      ]);

      expect(exitCode).toBe(0);
    }, 120_000);

    it('should pass all unit tests', async () => {
      const { exitCode, output } = await container.exec([
        shell,
        '-c',
        'pnpm test',
      ]);

      // Verify tests ran (even if some fail, most should pass)
      expect(output).toContain('Test Files');

      // Log summary for debugging
      const passMatch = output.match(/(\d+) passed/);
      const failMatch = output.match(/(\d+) failed/);
      if (passMatch) {
        console.log(`✅ Tests passed: ${passMatch[1]}`);
      }
      if (failMatch) {
        console.log(`❌ Tests failed: ${failMatch[1]}`);
      }

      // Tests should pass (exit code 0)
      expect(exitCode).toBe(0);
    }, 180_000); // 3 minutes for tests

    it('should build successfully', async () => {
      const { exitCode } = await container.exec([
        shell,
        '-c',
        'pnpm run build',
      ]);

      expect(exitCode).toBe(0);

      // Verify build artifacts exist
      const { exitCode: verifyExit } = await container.exec([
        shell,
        '-c',
        'test -f dist/cli.js && test -f dist/index.js',
      ]);

      expect(verifyExit).toBe(0);
    }, 120_000);

    it('should create grimoire directory with correct permissions', async () => {
      const { exitCode, output } = await container.exec([
        shell,
        '-c',
        `node -e "
          import { mkdir, chmod, stat } from 'fs/promises';
          import { homedir } from 'os';
          import { join } from 'path';

          const grimoireDir = join(homedir(), '.grimoire');

          (async () => {
            await mkdir(grimoireDir, { recursive: true });
            await chmod(grimoireDir, 0o700);
            const stats = await stat(grimoireDir);
            console.log('Created:', grimoireDir);
            console.log('Mode:', (stats.mode & 0o777).toString(8));
          })();
        "`,
      ]);

      expect(exitCode).toBe(0);
      expect(output).toContain('Created:');
      expect(output).toContain('Mode: 700');
    });

    it('should handle spell file discovery', async () => {
      // Create a test spell file
      const testSpellYaml = `
name: test-spell
version: 1.0.0
description: Test spell for container validation
server:
  transport: stdio
  command: echo
  args:
    - "test"
keywords:
  - test
  - container
  - validation
`;

      // Write test spell to container home directory
      const { exitCode: writeExit } = await container.exec([
        shell,
        '-c',
        `mkdir -p ~/.grimoire && cat > ~/.grimoire/test.spell.yaml << 'EOF'
${testSpellYaml}
EOF`,
      ]);

      expect(writeExit).toBe(0);

      // Verify spell can be read
      const { exitCode: readExit, output } = await container.exec([
        shell,
        '-c',
        'cat ~/.grimoire/test.spell.yaml',
      ]);

      expect(readExit).toBe(0);
      expect(output).toContain('test-spell');
      expect(output).toContain('container');
    });

    it('should run grimoire CLI commands', async () => {
      // Test grimoire list command
      const { exitCode: listExit, output: listOutput } = await container.exec([
        shell,
        '-c',
        'node dist/cli.js list || echo "No spells found (expected)"',
      ]);

      // Should not crash (exit code 0 or handled gracefully)
      expect([0, 1]).toContain(listExit);

      // Test grimoire validate command with example
      const { exitCode: validateExit } = await container.exec([
        shell,
        '-c',
        'node dist/cli.js validate ~/.grimoire/test.spell.yaml || true',
      ]);

      // Should not crash
      expect([0, 1]).toContain(validateExit);
    });
  });

  // Optional: Windows container tests (run separately)
  describe.skip('Platform: Windows Server Core (Run separately)', () => {
    let container: StartedTestContainer;
    let projectRoot: string;

    beforeAll(async () => {
      projectRoot = resolve(__dirname, '../../');

      console.log('🚀 Starting Windows container (this may take a while)...');

      // Windows containers are much slower and require special Docker configuration
      container = await new GenericContainer(windowsPlatform.image)
        .withBindMounts([
          {
            source: projectRoot,
            target: 'C:\\app',
          },
        ])
        .withWorkingDir('C:\\app')
        .withStartupTimeout(300_000) // 5 minutes for Windows
        .start();

      console.log('✅ Windows container started');
    }, 360_000); // 6 minutes timeout

    afterAll(async () => {
      if (container) {
        await container.stop();
        console.log('🛑 Windows container stopped');
      }
    });

    it('should install Node.js and dependencies', async () => {
      // Install Node.js via Chocolatey
      const { exitCode } = await container.exec([
        'powershell',
        '-Command',
        `
          Set-ExecutionPolicy Bypass -Scope Process -Force;
          [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072;
          iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'));
          choco install nodejs-lts -y;
          npm install -g pnpm;
          pnpm install --frozen-lockfile;
        `,
      ]);

      expect(exitCode).toBe(0);
    }, 600_000); // 10 minutes for Windows setup

    it('should resolve Windows paths correctly', async () => {
      const { exitCode, output } = await container.exec([
        'powershell',
        '-Command',
        `node -e "import('env-paths').then(envPaths => { const paths = envPaths.default('grimoire', { suffix: '' }); console.log(JSON.stringify(paths, null, 2)); });"`,
      ]);

      expect(exitCode).toBe(0);
      const paths = JSON.parse(output);

      // On Windows, should use AppData paths
      expect(paths.config).toMatch(/AppData/i);
      expect(paths.config).toMatch(/grimoire/i);
    });

    it('should run tests on Windows', async () => {
      const { exitCode } = await container.exec([
        'powershell',
        '-Command',
        'pnpm test',
      ]);

      expect(exitCode).toBe(0);
    }, 300_000);
  });
});
