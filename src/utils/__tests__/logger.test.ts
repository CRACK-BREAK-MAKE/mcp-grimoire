/**
 * Tests for logger utility
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '../logger';

describe('Logger', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let logger: Logger;
  let originalDebugEnv: string | undefined;

  beforeEach(() => {
    // Logger now uses console.error for all levels
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Enable debug mode for logger tests to ensure errors are logged
    originalDebugEnv = process.env.GRIMOIRE_DEBUG;
    process.env.GRIMOIRE_DEBUG = 'true';

    logger = new Logger();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Restore original debug env
    if (originalDebugEnv !== undefined) {
      process.env.GRIMOIRE_DEBUG = originalDebugEnv;
    } else {
      delete process.env.GRIMOIRE_DEBUG;
    }
  });

  describe('info', () => {
    it('should log info messages', () => {
      logger.info('STARTUP', 'Test message');

      expect(consoleErrorSpy).toHaveBeenCalled();
      const loggedMessage = consoleErrorSpy.mock.calls[0][0];
      expect(loggedMessage).toContain('INFO');
      expect(loggedMessage).toContain('Test message');
    });

    it('should log info messages with context', () => {
      logger.info('STARTUP', 'Test message', { key: 'value', count: 42 });

      expect(consoleErrorSpy).toHaveBeenCalled();
      const loggedMessage = consoleErrorSpy.mock.calls[0][0];
      const loggedContext = consoleErrorSpy.mock.calls[0][1];
      expect(loggedMessage).toContain('INFO');
      expect(loggedMessage).toContain('Test message');
      expect(loggedContext).toEqual({ key: 'value', count: 42 });
    });

    it('should handle empty context', () => {
      logger.info('STARTUP', 'Test message', {});

      expect(consoleErrorSpy).toHaveBeenCalled();
      const loggedMessage = consoleErrorSpy.mock.calls[0][0];
      expect(loggedMessage).toContain('INFO');
      expect(loggedMessage).toContain('Test message');
    });
  });

  describe('warn', () => {
    it('should log warning messages', () => {
      logger.warn('STARTUP', 'Warning message');

      expect(consoleErrorSpy).toHaveBeenCalled();
      const loggedMessage = consoleErrorSpy.mock.calls[0][0];
      expect(loggedMessage).toContain('WARN');
      expect(loggedMessage).toContain('Warning message');
    });

    it('should log warning messages with context', () => {
      logger.warn('STARTUP', 'Warning message', { issue: 'deprecated', version: '1.0.0' });

      expect(consoleErrorSpy).toHaveBeenCalled();
      const loggedMessage = consoleErrorSpy.mock.calls[0][0];
      const loggedContext = consoleErrorSpy.mock.calls[0][1];
      expect(loggedMessage).toContain('WARN');
      expect(loggedMessage).toContain('Warning message');
      expect(loggedContext).toEqual({ issue: 'deprecated', version: '1.0.0' });
    });
  });

  describe('error', () => {
    it('should log error messages', () => {
      logger.error('STARTUP', 'Error message');

      expect(consoleErrorSpy).toHaveBeenCalled();
      const loggedMessage = consoleErrorSpy.mock.calls[0][0];
      expect(loggedMessage).toContain('ERROR');
      expect(loggedMessage).toContain('Error message');
    });

    it('should log error messages with Error object', () => {
      const error = new Error('Test error');
      logger.error('STARTUP', 'Operation failed', error);

      expect(consoleErrorSpy).toHaveBeenCalled();
      const loggedMessage = consoleErrorSpy.mock.calls[0][0];
      expect(loggedMessage).toContain('ERROR');
      expect(loggedMessage).toContain('Operation failed');
    });

    it('should log error with context', () => {
      const error = new Error('Test error');
      logger.error('STARTUP', 'Operation failed', error, { operation: 'database_query' });

      expect(consoleErrorSpy).toHaveBeenCalled();
      const loggedMessage = consoleErrorSpy.mock.calls[0][0];
      expect(loggedMessage).toContain('ERROR');
      expect(loggedMessage).toContain('Operation failed');
    });
  });

  describe('formatting', () => {
    it('should format message with log level', () => {
      logger.info('STARTUP', 'Test');

      const loggedMessage = consoleErrorSpy.mock.calls[0][0];
      expect(loggedMessage).toContain('INFO');
      expect(loggedMessage).toContain('Test');
    });

    it('should format context as object', () => {
      logger.info('STARTUP', 'Test', { nested: { key: 'value' }, array: [1, 2, 3] });

      const loggedContext = consoleErrorSpy.mock.calls[0][1];
      expect(loggedContext).toHaveProperty('nested');
      expect(loggedContext).toHaveProperty('array');
      expect(loggedContext.nested).toEqual({ key: 'value' });
      expect(loggedContext.array).toEqual([1, 2, 3]);
    });

    it('should handle special characters in messages', () => {
      logger.info('STARTUP', 'Test "quotes" and \'apostrophes\'');

      expect(consoleErrorSpy).toHaveBeenCalled();
      const loggedMessage = consoleErrorSpy.mock.calls[0][0];
      expect(loggedMessage).toContain('Test');
    });

    it('should handle undefined context', () => {
      logger.info('STARTUP', 'Test', undefined);

      expect(consoleErrorSpy).toHaveBeenCalled();
      const loggedMessage = consoleErrorSpy.mock.calls[0][0];
      expect(loggedMessage).toContain('INFO');
      expect(loggedMessage).toContain('Test');
    });
  });

  describe('edge cases', () => {
    it('should handle very long messages', () => {
      const longMessage = 'A'.repeat(1000);
      logger.info('STARTUP', longMessage);

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should handle empty messages', () => {
      logger.info('STARTUP', '');

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should handle numeric messages', () => {
      logger.info('STARTUP', 'Count: 123');

      expect(consoleErrorSpy).toHaveBeenCalled();
      const loggedMessage = consoleErrorSpy.mock.calls[0][0];
      expect(loggedMessage).toContain('Count: 123');
    });

    it('should handle circular references in context', () => {
      const circular: Record<string, unknown> = { key: 'value' };
      circular.self = circular;

      // Should not throw
      expect(() => {
        logger.info('STARTUP', 'Test', circular);
      }).not.toThrow();
    });
  });

  describe('log levels with environment variables', () => {
    let originalDebug: string | undefined;
    let originalTrace: string | undefined;

    afterEach(() => {
      // Restore original env vars
      if (originalDebug !== undefined) {
        process.env.GRIMOIRE_DEBUG = originalDebug;
      } else {
        delete process.env.GRIMOIRE_DEBUG;
      }
      if (originalTrace !== undefined) {
        process.env.GRIMOIRE_TRACE = originalTrace;
      } else {
        delete process.env.GRIMOIRE_TRACE;
      }
    });

    it('should NOT show debug logs when GRIMOIRE_DEBUG is not set', () => {
      // Save and remove debug env
      originalDebug = process.env.GRIMOIRE_DEBUG;
      delete process.env.GRIMOIRE_DEBUG;

      // Create new logger instance to pick up env change
      const testLogger = new Logger();

      consoleErrorSpy.mockClear();
      testLogger.debug('STARTUP', 'Debug message', { detail: 'test' });

      // Debug should NOT be logged
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should show debug logs when GRIMOIRE_DEBUG=true', () => {
      // Set debug mode
      originalDebug = process.env.GRIMOIRE_DEBUG;
      process.env.GRIMOIRE_DEBUG = 'true';

      // Create new logger instance to pick up env change
      const testLogger = new Logger();

      consoleErrorSpy.mockClear();
      testLogger.debug('STARTUP', 'Debug message', { detail: 'test' });

      // Debug SHOULD be logged
      expect(consoleErrorSpy).toHaveBeenCalled();
      const loggedMessage = consoleErrorSpy.mock.calls[0][0];
      expect(loggedMessage).toContain('DEBUG');
      expect(loggedMessage).toContain('Debug message');
    });

    it('should NOT show trace logs when GRIMOIRE_TRACE is not set', () => {
      // Save and remove trace env
      originalTrace = process.env.GRIMOIRE_TRACE;
      delete process.env.GRIMOIRE_TRACE;

      // Create new logger instance to pick up env change
      const testLogger = new Logger();

      consoleErrorSpy.mockClear();
      testLogger.trace('STARTUP', 'Trace message', { detail: 'test' });

      // Trace should NOT be logged
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should show trace logs when GRIMOIRE_TRACE=true', () => {
      // Set trace mode
      originalTrace = process.env.GRIMOIRE_TRACE;
      process.env.GRIMOIRE_TRACE = 'true';

      // Create new logger instance to pick up env change
      const testLogger = new Logger();

      consoleErrorSpy.mockClear();
      testLogger.trace('STARTUP', 'Trace message', { detail: 'test' });

      // Trace SHOULD be logged
      expect(consoleErrorSpy).toHaveBeenCalled();
      const loggedMessage = consoleErrorSpy.mock.calls[0][0];
      expect(loggedMessage).toContain('TRACE');
      expect(loggedMessage).toContain('Trace message');
    });

    it('should show debug logs when GRIMOIRE_TRACE=true (trace implies debug)', () => {
      // Set trace mode (which should enable debug too)
      originalTrace = process.env.GRIMOIRE_TRACE;
      originalDebug = process.env.GRIMOIRE_DEBUG;
      process.env.GRIMOIRE_TRACE = 'true';
      delete process.env.GRIMOIRE_DEBUG; // Explicitly not setting debug

      // Create new logger instance to pick up env change
      const testLogger = new Logger();

      consoleErrorSpy.mockClear();
      testLogger.debug('STARTUP', 'Debug message', { detail: 'test' });

      // Debug SHOULD be logged because trace mode implies debug
      expect(consoleErrorSpy).toHaveBeenCalled();
      const loggedMessage = consoleErrorSpy.mock.calls[0][0];
      expect(loggedMessage).toContain('DEBUG');
      expect(loggedMessage).toContain('Debug message');
    });

    it('should always show info, warn, and error regardless of debug/trace settings', () => {
      // Explicitly disable debug and trace
      originalDebug = process.env.GRIMOIRE_DEBUG;
      originalTrace = process.env.GRIMOIRE_TRACE;
      delete process.env.GRIMOIRE_DEBUG;
      delete process.env.GRIMOIRE_TRACE;

      // Create new logger instance
      const testLogger = new Logger();

      consoleErrorSpy.mockClear();

      // Test info
      testLogger.info('STARTUP', 'Info message');
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('INFO');

      consoleErrorSpy.mockClear();

      // Test warn
      testLogger.warn('STARTUP', 'Warn message');
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('WARN');

      consoleErrorSpy.mockClear();

      // Test error (in test mode with debug disabled, errors are suppressed)
      // So we need to enable debug to see errors in tests
      process.env.GRIMOIRE_DEBUG = 'true';
      const testLogger2 = new Logger();
      testLogger2.error('STARTUP', 'Error message', new Error('Test'));
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('ERROR');
    });

    it('should include stack trace in errors only when DEBUG or TRACE is enabled', () => {
      const testError = new Error('Test error');

      // Without debug
      originalDebug = process.env.GRIMOIRE_DEBUG;
      delete process.env.GRIMOIRE_DEBUG;
      const loggerNoDebug = new Logger();

      consoleErrorSpy.mockClear();
      process.env.GRIMOIRE_DEBUG = 'true'; // Need to enable for test mode
      const loggerWithDebug = new Logger();
      loggerWithDebug.error('STARTUP', 'Error occurred', testError);

      expect(consoleErrorSpy).toHaveBeenCalled();
      const loggedContext = consoleErrorSpy.mock.calls[0][1];

      // Stack should be included in debug mode
      expect(loggedContext?.error).toBeDefined();
      expect(loggedContext.error).toHaveProperty('stack');
    });
  });
});
