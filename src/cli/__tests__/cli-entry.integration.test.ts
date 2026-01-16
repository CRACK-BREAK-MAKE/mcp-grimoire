/**
 * CLI Entry Point Integration Test
 * Tests cli.ts entry point with all command routing and signal handling
 *
 * Coverage targets:
 * - cli.ts: 0% → 80%+ (all metrics)
 * - Command registration (lines 36-111)
 * - SIGINT/SIGTERM handlers (lines 43-53)
 * - Help display logic (lines 114-117)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { spawn, execSync, type ChildProcess } from 'child_process';
import { join } from 'path';
import { readFileSync } from 'fs';

describe('CLI Entry Point (cli.ts)', () => {
  const cliBin = join(process.cwd(), 'dist/cli.js');
  const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
  const expectedVersion = packageJson.version;

  // Build CLI before running tests
  beforeAll(() => {
    execSync('pnpm run build', { stdio: 'pipe' });
  });

  /**
   * Test 1: Help display when no command provided
   * Coverage: Lines 114-117 (help display logic)
   */
  it('should show help when no command provided', (done) => {
    const child = spawn('node', [cliBin]);
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('exit', (code) => {
      try {
        // CLI prints to stderr for help
        expect(stderr).toContain('Welcome to MCP Grimoire');
        expect(stderr).toContain('start');
        expect(stderr).toContain('create');
        expect(stderr).toContain('list');
        expect(stderr).toContain('validate');
        expect(stderr).toContain('example');
        expect(code).toBe(0);
        done();
      } catch (error) {
        done(error);
      }
    });
  }, 10000);

  /**
   * Test 2: Version flag
   * Coverage: Lines 32 (version registration)
   */
  it('should show version with --version flag', (done) => {
    const child = spawn('node', [cliBin, '--version']);
    let stdout = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.on('exit', (code) => {
      try {
        expect(stdout.trim()).toBe(expectedVersion);
        expect(code).toBe(0);
        done();
      } catch (error) {
        done(error);
      }
    });
  }, 10000);

  /**
   * Test 3: Help flag
   * Coverage: Lines 29-33 (help flag handling)
   */
  it('should show help with --help flag', (done) => {
    const child = spawn('node', [cliBin, '--help']);
    let stdout = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.on('exit', (code) => {
      try {
        expect(stdout).toContain('Your spellbook for MCP servers');
        expect(stdout).toContain('Commands:');
        expect(code).toBe(0);
        done();
      } catch (error) {
        done(error);
      }
    });
  }, 10000);

  /**
   * Test 4: Start command with SIGINT shutdown
   * Coverage: Lines 36-56 (start command + SIGINT handler)
   */
  it('should start gateway and handle SIGINT gracefully', (done) => {
    const child = spawn('node', [cliBin, 'start']);
    let stderr = '';
    let startupDetected = false;

    child.stderr?.on('data', (data) => {
      stderr += data.toString();

      // Wait for startup banner
      if (stderr.includes('MCP Grimoire') && !startupDetected) {
        startupDetected = true;
        // Send SIGINT after startup
        setTimeout(() => {
          child.kill('SIGINT');
        }, 500);
      }
    });

    child.on('exit', (code) => {
      try {
        expect(stderr).toContain('MCP Grimoire');
        expect(code).toBe(0); // Graceful shutdown
        done();
      } catch (error) {
        done(error);
      }
    });
  }, 15000);

  /**
   * Test 5: Start command with SIGTERM shutdown
   * Coverage: Lines 49-53 (SIGTERM handler)
   */
  it('should start gateway and handle SIGTERM gracefully', (done) => {
    const child = spawn('node', [cliBin, 'start']);
    let stderr = '';
    let startupDetected = false;

    child.stderr?.on('data', (data) => {
      stderr += data.toString();

      // Wait for startup banner
      if (stderr.includes('MCP Grimoire') && !startupDetected) {
        startupDetected = true;
        // Send SIGTERM after startup
        setTimeout(() => {
          child.kill('SIGTERM');
        }, 500);
      }
    });

    child.on('exit', (code) => {
      try {
        expect(stderr).toContain('MCP Grimoire');
        expect(code).toBe(0); // Graceful shutdown
        done();
      } catch (error) {
        done(error);
      }
    });
  }, 15000);

  /**
   * Test 6: Create command help routing
   * Coverage: Lines 58-83 (create command registration)
   */
  it('should route to create command and show help', (done) => {
    const child = spawn('node', [cliBin, 'create', '--help']);
    let stdout = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.on('exit', (code) => {
      try {
        expect(stdout).toContain('Create a new spell configuration');
        expect(stdout).toContain('--name');
        expect(stdout).toContain('--transport');
        expect(stdout).toContain('--command');
        expect(code).toBe(0);
        done();
      } catch (error) {
        done(error);
      }
    });
  }, 10000);

  /**
   * Test 7: List command routing
   * Coverage: Lines 85-92 (list command registration)
   */
  it('should route to list command', (done) => {
    const child = spawn('node', [cliBin, 'list']);
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('exit', (code) => {
      try {
        // List command should execute successfully (may find 0 or more spells)
        expect(code).toBe(0);
        // Output should be present (either list or "no spells found" message)
        const output = stdout + stderr;
        expect(output.length).toBeGreaterThan(0);
        done();
      } catch (error) {
        done(error);
      }
    });
  }, 10000);

  /**
   * Test 8: Example command routing
   * Coverage: Lines 94-102 (example command registration)
   */
  it('should route to example command and show help', (done) => {
    const child = spawn('node', [cliBin, 'example', '--help']);
    let stdout = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.on('exit', (code) => {
      try {
        expect(stdout).toContain('Generate an example spell template');
        expect(stdout).toContain('transport');
        expect(code).toBe(0);
        done();
      } catch (error) {
        done(error);
      }
    });
  }, 10000);

  /**
   * Test 9: Validate command routing
   * Coverage: Lines 104-111 (validate command registration)
   */
  it('should route to validate command and show help', (done) => {
    const child = spawn('node', [cliBin, 'validate', '--help']);
    let stdout = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.on('exit', (code) => {
      try {
        expect(stdout).toContain('Validate a spell configuration file');
        expect(stdout).toContain('file');
        expect(code).toBe(0);
        done();
      } catch (error) {
        done(error);
      }
    });
  }, 10000);

  /**
   * Test 10: Invalid command error
   * Coverage: Error handling in commander parsing
   */
  it('should show error for unknown command', (done) => {
    const child = spawn('node', [cliBin, 'unknown-command']);
    let stderr = '';

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('exit', (code) => {
      try {
        expect(stderr).toContain('unknown command');
        expect(code).toBe(1);
        done();
      } catch (error) {
        done(error);
      }
    });
  }, 10000);
});
