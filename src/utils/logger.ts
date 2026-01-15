/**
 * Logger Utility - Observability & Transparency
 *
 * ARCHITECTURAL PRINCIPLE: Users must understand what the gateway is doing
 *
 * CRITICAL: This logger outputs to stderr so users can see what's happening
 * when running via npx or in MCP client logs (Claude Desktop, VSCode, etc)
 *
 * Features:
 * - Component-based logging (INTENT, SPAWN, TOOL, LIFECYCLE)
 * - Performance tracking (timing for key operations)
 * - Structured context (easy to parse and analyze)
 * - Multiple verbosity levels (INFO, DEBUG, TRACE)
 * - Always outputs important events (never silent by default)
 *
 * Logging Levels:
 * - INFO: User-facing events (intent resolved, tool called, spell spawned)
 * - DEBUG: Developer troubleshooting (confidence scores, alternatives, timing)
 * - TRACE: Deep inspection (full payloads, embeddings, internal state)
 *
 * Environment Variables:
 * - GRIMOIRE_DEBUG=true: Enable DEBUG level
 * - GRIMOIRE_TRACE=true: Enable TRACE level (implies DEBUG)
 *
 * Usage:
 * ```ts
 * import { logger } from './utils/logger';
 *
 * // Simple message
 * logger.info('INTENT', 'Resolved query to spell', {
 *   query: 'list users',
 *   spell: 'postgres',
 *   confidence: 0.95
 * });
 *
 * // Performance tracking
 * const timer = logger.startTimer();
 * await doWork();
 * logger.info('SPAWN', 'Spell spawned', {
 *   spell: 'postgres',
 *   ...timer.end()
 * });
 *
 * // Error with context
 * logger.error('LIFECYCLE', 'Failed to kill spell', error, {
 *   spell: 'mysql',
 *   pid: 12345
 * });
 * ```
 */

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

/**
 * Component identifiers for structured logging
 * Makes it easy to filter logs by component
 */
type Component =
  | 'STARTUP'   // Initialization, discovery
  | 'INTENT'    // Intent resolution
  | 'SPAWN'     // Process/connection spawning
  | 'TOOL'      // Tool invocation
  | 'LIFECYCLE' // Cleanup, turn tracking
  | 'MCP'       // MCP protocol details
  | 'WATCH'     // File watching
  | 'CACHE'     // Embedding cache
  | 'AUTH';     // Authentication (Bearer, OAuth)

interface LogContext {
  [key: string]: unknown;
}

/**
 * Performance timer for tracking operation duration
 */
interface Timer {
  end: () => { durationMs: number };
}

/**
 * Structured logger that ALWAYS outputs to stderr
 * Provides observability into gateway operations
 */
export class Logger {
  private isDebugMode = process.env.GRIMOIRE_DEBUG === 'true';
  private isTraceMode = process.env.GRIMOIRE_TRACE === 'true';
  private isTestMode = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

  /**
   * Start a performance timer
   * Returns a timer object with end() method
   */
  startTimer(): Timer {
    const start = Date.now();
    return {
      end: () => ({
        durationMs: Date.now() - start,
      }),
    };
  }

  /**
   * Log trace message (only when GRIMOIRE_TRACE=true)
   * Used for deep inspection: full payloads, embeddings, internal state
   */
  trace(component: Component, message: string, context?: LogContext): void {
    if (this.isTraceMode) {
      this.log('trace', component, message, context);
    }
  }

  /**
   * Log debug message (only when GRIMOIRE_DEBUG=true or GRIMOIRE_TRACE=true)
   * Used for troubleshooting: confidence scores, alternatives, timing
   */
  debug(component: Component, message: string, context?: LogContext): void {
    if (this.isDebugMode || this.isTraceMode) {
      this.log('debug', component, message, context);
    }
  }

  /**
   * Log informational message (ALWAYS shown)
   * User-facing events: intent resolved, tool called, spell spawned
   */
  info(component: Component, message: string, context?: LogContext): void {
    this.log('info', component, message, context);
  }

  /**
   * Log warning message (ALWAYS shown)
   * Non-critical issues that users should know about
   */
  warn(component: Component, message: string, context?: LogContext): void {
    this.log('warn', component, message, context);
  }

  /**
   * Log error message (ALWAYS shown)
   * Critical failures with full context for debugging
   */
  error(component: Component, message: string, error?: Error, context?: LogContext): void {
    const errorDetails = error
      ? {
          name: error.name,
          message: error.message,
          stack: this.isDebugMode || this.isTraceMode ? error.stack : undefined
        }
      : undefined;

    this.log('error', component, message, { error: errorDetails, ...context });
  }

  /**
   * Core logging function - outputs to stderr
   * Uses stderr so it appears in MCP client logs (Claude Desktop, VSCode, etc)
   */
  private log(level: LogLevel, component: Component, message: string, context?: LogContext): void {
    // In test mode, only show errors if debug mode is enabled
    // This reduces console pollution from expected test errors
    if (this.isTestMode && level === 'error' && !this.isDebugMode) {
      return;
    }

    const timestamp = new Date().toISOString();
    const levelStr = level.toUpperCase().padEnd(5);
    const componentStr = component.padEnd(10);

    // Format: [TIMESTAMP] LEVEL COMPONENT Message { context }
    const prefix = `[${timestamp}] ${levelStr} ${componentStr}`;

    if (context && Object.keys(context).length > 0) {
      // Structured logging with context
      console.error(`${prefix} ${message}`, context);
    } else {
      // Simple message
      console.error(`${prefix} ${message}`);
    }
  }
}

/**
 * Singleton logger instance
 */
export const logger = new Logger();
