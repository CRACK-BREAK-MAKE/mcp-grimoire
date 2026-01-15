/**
 * Unit tests for CLI prompt utilities
 * Tests color formatting, Spinner animation, and prompt functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatPrompt,
  formatDefault,
  formatError,
  formatSuccess,
  formatWarning,
  formatInfo,
  bold,
  dim,
  Spinner,
  parseArgs,
} from '../prompts';

describe('Color Formatters', () => {
  describe('formatPrompt', () => {
    it('should add cyan ? prefix', () => {
      const result = formatPrompt('What is your name?');
      expect(result).toContain('?');
      expect(result).toContain('What is your name?');
    });

    it('should handle empty message', () => {
      const result = formatPrompt('');
      expect(result).toContain('?');
    });
  });

  describe('formatError', () => {
    it('should add red ✗ prefix', () => {
      const result = formatError('Something went wrong');
      expect(result).toContain('✗');
      expect(result).toContain('Something went wrong');
    });

    it('should handle multiline messages', () => {
      const result = formatError('Error\nLine 2');
      expect(result).toContain('✗');
      expect(result).toContain('Error\nLine 2');
    });
  });

  describe('formatSuccess', () => {
    it('should add green ✓ prefix', () => {
      const result = formatSuccess('Operation completed');
      expect(result).toContain('✓');
      expect(result).toContain('Operation completed');
    });
  });

  describe('formatWarning', () => {
    it('should add yellow ⚠️ prefix', () => {
      const result = formatWarning('This is a warning');
      expect(result).toContain('⚠️');
      expect(result).toContain('This is a warning');
    });
  });

  describe('formatInfo', () => {
    it('should add cyan ℹ prefix', () => {
      const result = formatInfo('Here is some info');
      expect(result).toContain('ℹ');
      expect(result).toContain('Here is some info');
    });
  });

  describe('formatDefault', () => {
    it('should wrap value in parentheses', () => {
      const result = formatDefault('default value');
      expect(result).toContain('(');
      expect(result).toContain('default value');
      expect(result).toContain(')');
    });
  });

  describe('bold', () => {
    it('should wrap text with bold formatting', () => {
      const result = bold('Important text');
      expect(result).toContain('Important text');
    });

    it('should handle empty string with formatting codes', () => {
      const result = bold('');
      // Even empty strings get ANSI codes in TTY mode
      expect(result).toBeTruthy();
    });
  });

  describe('dim', () => {
    it('should wrap text with dim formatting', () => {
      const result = dim('Secondary text');
      expect(result).toContain('Secondary text');
    });

    it('should handle empty string with formatting codes', () => {
      const result = dim('');
      // Even empty strings get ANSI codes in TTY mode
      expect(result).toBeTruthy();
    });
  });
});

describe('Spinner', () => {
  let spinner: Spinner;
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spinner = new Spinner();
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
    vi.clearAllTimers();
  });

  describe('start', () => {
    it('should start animation with message', () => {
      vi.useFakeTimers();

      spinner.start('Loading...');

      // Wait for first frame
      vi.advanceTimersByTime(100);

      expect(stdoutWriteSpy).toHaveBeenCalled();
      const calls = stdoutWriteSpy.mock.calls;
      const hasLoadingMessage = calls.some((call) =>
        String(call[0]).includes('Loading...')
      );
      expect(hasLoadingMessage).toBe(true);

      vi.useRealTimers();
    });

    it('should animate through frames', () => {
      vi.useFakeTimers();

      spinner.start('Processing...');

      const callsBefore = stdoutWriteSpy.mock.calls.length;

      // Advance through multiple frames (80ms per frame)
      vi.advanceTimersByTime(320); // 4 frames

      const callsAfter = stdoutWriteSpy.mock.calls.length;
      expect(callsAfter).toBeGreaterThan(callsBefore);

      vi.useRealTimers();
    });
  });

  describe('stop', () => {
    it('should stop animation and clear line', () => {
      vi.useFakeTimers();

      spinner.start('Loading...');
      vi.advanceTimersByTime(200);

      stdoutWriteSpy.mockClear();
      spinner.stop('Done!');

      expect(stdoutWriteSpy).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should stop without message', () => {
      vi.useFakeTimers();

      spinner.start('Loading...');
      vi.advanceTimersByTime(200);

      stdoutWriteSpy.mockClear();
      spinner.stop();

      expect(stdoutWriteSpy).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should be safe to call stop multiple times', () => {
      vi.useFakeTimers();

      spinner.start('Loading...');
      spinner.stop();
      spinner.stop(); // Should not throw

      vi.useRealTimers();
    });
  });

  describe('fail', () => {
    it('should stop animation with error message', () => {
      vi.useFakeTimers();

      spinner.start('Loading...');
      vi.advanceTimersByTime(200);

      stdoutWriteSpy.mockClear();

      // Mock console.error for the error message
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      spinner.fail('Operation failed');

      expect(stdoutWriteSpy).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Operation failed'));

      consoleErrorSpy.mockRestore();
      vi.useRealTimers();
    });
  });

  describe('non-TTY behavior', () => {
    let originalIsTTY: boolean | undefined;

    beforeEach(() => {
      originalIsTTY = process.stdout.isTTY;
      // @ts-expect-error Testing non-TTY mode
      process.stdout.isTTY = false;
    });

    afterEach(() => {
      // @ts-expect-error Restoring original value
      process.stdout.isTTY = originalIsTTY;
    });

    it('should not animate in non-TTY mode', () => {
      vi.useFakeTimers();

      stdoutWriteSpy.mockClear();
      spinner.start('Loading...');

      // In non-TTY mode, should just print message once
      vi.advanceTimersByTime(500);

      // Should have written the message but not animated
      expect(stdoutWriteSpy).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });
  });
});

describe('parseArgs', () => {
  it('should parse simple space-separated args', () => {
    const result = parseArgs('arg1 arg2 arg3');
    expect(result).toEqual(['arg1', 'arg2', 'arg3']);
  });

  it('should handle quoted args with spaces', () => {
    const result = parseArgs('arg1 "arg with spaces" arg3');
    expect(result).toEqual(['arg1', 'arg with spaces', 'arg3']);
  });

  it('should handle empty string', () => {
    const result = parseArgs('');
    expect(result).toEqual([]);
  });

  it('should handle whitespace-only string', () => {
    const result = parseArgs('   ');
    expect(result).toEqual([]);
  });

  it('should handle mixed quoted and unquoted args', () => {
    const result = parseArgs('-y @modelcontextprotocol/server-example "C:\\Program Files\\Node"');
    expect(result).toEqual(['-y', '@modelcontextprotocol/server-example', 'C:\\Program Files\\Node']);
  });

  it('should handle consecutive quotes', () => {
    const result = parseArgs('"arg1" "arg2" "arg3"');
    expect(result).toEqual(['arg1', 'arg2', 'arg3']);
  });

  it('should handle args with equals signs', () => {
    const result = parseArgs('--flag=value arg2');
    expect(result).toEqual(['--flag=value', 'arg2']);
  });

  it('should handle single argument', () => {
    const result = parseArgs('single');
    expect(result).toEqual(['single']);
  });
});

describe('Integration: Color formatting in real scenarios', () => {
  it('should format error with file path correctly', () => {
    const filePath = '/path/to/file.yaml';
    const result = formatError(`File not found: ${filePath}`);
    expect(result).toContain('✗');
    expect(result).toContain(filePath);
  });

  it('should combine bold and dim', () => {
    const result = `${bold('Name:')} ${dim('value')}`;
    expect(result).toContain('Name:');
    expect(result).toContain('value');
  });

  it('should format success with details', () => {
    const name = 'postgres';
    const tools = 5;
    const result = formatSuccess(`Spell created: ${name} (${tools} tools)`);
    expect(result).toContain('✓');
    expect(result).toContain('postgres');
    expect(result).toContain('5 tools');
  });
});
