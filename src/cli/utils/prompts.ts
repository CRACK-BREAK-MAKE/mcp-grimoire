/**
 * Lightweight interactive prompts using Node.js built-in readline
 * No external dependencies - keeps startup fast
 */

import readline from 'readline';

/**
 * ANSI color codes (built-in, no dependencies)
 * Following SRP: Color formatting is separate concern
 */
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
} as const;

/**
 * Check if terminal supports colors
 */
function supportsColor(): boolean {
  return process.stdout.isTTY !== false;
}

/**
 * Format prompt message with cyan ? prefix
 * Following SRP: Each formatter does ONE thing
 */
export function formatPrompt(message: string): string {
  if (!supportsColor()) return `? ${message}`;
  return `${colors.cyan}${colors.bold}?${colors.reset} ${message}`;
}

/**
 * Format default value hint (dim text)
 */
export function formatDefault(value: string): string {
  if (!supportsColor()) return `(${value})`;
  return `${colors.dim}(${value})${colors.reset}`;
}

/**
 * Format error message with red ✗ prefix
 */
export function formatError(message: string): string {
  if (!supportsColor()) return `✗ ${message}`;
  return `${colors.red}✗${colors.reset} ${message}`;
}

/**
 * Format success message with green ✓ prefix
 */
export function formatSuccess(message: string): string {
  if (!supportsColor()) return `✓ ${message}`;
  return `${colors.green}✓${colors.reset} ${message}`;
}

/**
 * Format warning message with yellow ⚠️ prefix
 */
export function formatWarning(message: string): string {
  if (!supportsColor()) return `⚠️  ${message}`;
  return `${colors.yellow}⚠️ ${colors.reset} ${message}`;
}

/**
 * Format info message with cyan ℹ prefix
 */
export function formatInfo(message: string): string {
  if (!supportsColor()) return `ℹ ${message}`;
  return `${colors.cyan}ℹ${colors.reset} ${message}`;
}

/**
 * Apply bold formatting
 */
export function bold(text: string): string {
  if (!supportsColor()) return text;
  return `${colors.bold}${text}${colors.reset}`;
}

/**
 * Apply dim formatting
 */
export function dim(text: string): string {
  if (!supportsColor()) return text;
  return `${colors.dim}${text}${colors.reset}`;
}

/**
 * Spinner for long-running operations
 * Following SRP: Only manages animation state
 */
export class Spinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private interval: NodeJS.Timeout | null = null;
  private frameIndex = 0;
  private message = '';

  /**
   * Start spinner animation
   */
  start(message: string): void {
    this.message = message;
    this.frameIndex = 0;

    if (!supportsColor()) {
      // No animation in non-TTY, just print message
      process.stdout.write(`${message}\n`);
      return;
    }

    this.interval = setInterval(() => {
      const frame = this.frames[this.frameIndex];
      process.stdout.write(`\r${colors.cyan}${frame}${colors.reset} ${this.message}`);
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
    }, 80);
  }

  /**
   * Stop spinner with success message
   */
  stop(message?: string): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    // Clear the line
    if (supportsColor()) {
      process.stdout.write('\r\x1b[K');
    }

    if (message != null && message !== '') {
      console.warn(formatSuccess(message));
    }
  }

  /**
   * Stop spinner with failure message
   */
  fail(message: string): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    // Clear the line
    if (supportsColor()) {
      process.stdout.write('\r\x1b[K');
    }

    console.error(formatError(message));
  }
}

interface PromptOptions {
  message: string;
  default?: string;
  validate?: (value: string) => string | true;
  hint?: string; // Optional hint shown above the prompt
}

interface SelectOption {
  label: string;
  value: string;
  description?: string;
}

interface SelectOptions {
  message: string;
  options: SelectOption[];
  default?: string;
}

interface ConfirmOptions {
  message: string;
  default?: boolean;
}

/**
 * Create readline interface
 */
function createInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Text prompt with color formatting
 */
export async function text(options: PromptOptions): Promise<string> {
  const rl = createInterface();

  return new Promise((resolve) => {
    // Show hint if provided
    if (options.hint != null && options.hint !== '') {
      process.stdout.write(`${dim(options.hint)}\n`);
    }

    const promptText = formatPrompt(options.message);
    const defaultText =
      options.default != null && options.default !== '' ? ` ${formatDefault(options.default)}` : '';
    rl.question(`${promptText}${defaultText}: `, (answer) => {
      rl.close();

      const value = answer.trim() !== '' ? answer.trim() : (options.default ?? '');

      if (options.validate != null) {
        const validation = options.validate(value);
        if (validation !== true) {
          console.error(formatError(validation));
          // Retry
          resolve(text(options));
          return;
        }
      }

      resolve(value);
    });
  });
}

/**
 * Select prompt with colored options
 */
export async function select(options: SelectOptions): Promise<string> {
  console.warn(`\n${formatPrompt(options.message)}\n`);

  options.options.forEach((opt, index) => {
    const num = supportsColor() ? `${colors.cyan}${index + 1}${colors.reset}` : `${index + 1}`;
    const label = bold(opt.label);
    const description = opt.description != null ? dim(`\n     ${opt.description}`) : '';
    const isDefault =
      opt.value === options.default
        ? supportsColor()
          ? ` ${colors.green}(default)${colors.reset}`
          : ' (default)'
        : '';

    console.warn(`  ${num}. ${label}${isDefault}${description}`);
  });

  const rl = createInterface();

  return new Promise((resolve) => {
    const defaultNum =
      options.default != null && options.default !== ''
        ? options.options.findIndex((o) => o.value === options.default) + 1
        : 1;

    const promptText = dim(`Select (1-${options.options.length}) [${defaultNum}]`);
    rl.question(`\n${promptText}: `, (answer) => {
      rl.close();

      const num = parseInt(answer.trim(), 10) !== 0 ? parseInt(answer.trim(), 10) : defaultNum;
      const selected = options.options[num - 1];

      if (selected == null) {
        console.error(formatError(`Invalid selection. Please choose 1-${options.options.length}`));
        resolve(select(options));
        return;
      }

      console.warn(formatSuccess(`Selected: ${selected.label}\n`));
      resolve(selected.value);
    });
  });
}

/**
 * Confirm prompt with colored formatting
 */
export async function confirm(options: ConfirmOptions): Promise<boolean> {
  const rl = createInterface();

  return new Promise((resolve) => {
    const defaultText = options.default === true ? ' (Y/n)' : ' (y/N)';
    const promptText = formatPrompt(options.message);
    rl.question(`${promptText}${dim(defaultText)}: `, (answer) => {
      rl.close();

      const input = answer.trim().toLowerCase();

      if (input === '') {
        resolve(options.default === true);
        return;
      }

      if (input === 'y' || input === 'yes') {
        resolve(true);
        return;
      }

      if (input === 'n' || input === 'no') {
        resolve(false);
        return;
      }

      console.error(formatError(`Please answer 'y' or 'n'`));
      resolve(confirm(options));
    });
  });
}

/**
 * Multiline text input with visual separator
 */
export async function multiline(options: PromptOptions): Promise<string> {
  /* eslint-disable no-console */
  console.log(`\n${formatPrompt(options.message)}`);
  console.log(dim('(Enter a blank line when done)'));
  console.log(dim('─'.repeat(50)));
  /* eslint-enable no-console */

  const rl = createInterface();
  const lines: string[] = [];

  return new Promise((resolve) => {
    rl.on('line', (line) => {
      if (line.trim() === '') {
        /* eslint-disable-next-line no-console */
        console.log(dim('─'.repeat(50)));
        rl.close();
        resolve(lines.join('\n'));
      } else {
        lines.push(line);
      }
    });
  });
}

/**
 * Parse command arguments respecting quotes
 */
export function parseArgs(argsString: string): string[] {
  if (!argsString || argsString.trim() === '') {
    return [];
  }

  // Match content inside quotes OR non-whitespace sequences
  const matches = argsString.match(/(?:[^\s"]+|"[^"]*")+/g);
  if (!matches) {
    return [];
  }

  // Remove surrounding quotes
  return matches.map((arg) => arg.replace(/^"|"$/g, ''));
}
