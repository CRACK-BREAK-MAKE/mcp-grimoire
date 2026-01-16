/**
 * Cross-platform utilities tests
 * Tests command normalization for Windows compatibility
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { normalizeCommand } from '../cross-platform';

describe('Cross-platform utilities', () => {
  let originalPlatform: string;

  beforeEach(() => {
    originalPlatform = process.platform;
  });

  afterEach(() => {
    // Restore original platform
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      writable: true,
      configurable: true,
    });
  });

  describe('normalizeCommand', () => {
    describe('on Unix platforms', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', {
          value: 'darwin',
          writable: true,
          configurable: true,
        });
      });

      it('should not modify commands on Unix', () => {
        expect(normalizeCommand('tsx')).toBe('tsx');
        expect(normalizeCommand('node')).toBe('node');
        expect(normalizeCommand('python')).toBe('python');
      });

      it('should not add .cmd on Unix', () => {
        expect(normalizeCommand('npx')).toBe('npx');
        expect(normalizeCommand('pnpm')).toBe('pnpm');
      });
    });

    describe('on Windows', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', {
          value: 'win32',
          writable: true,
          configurable: true,
        });
      });

      it('should add .cmd to npm binaries on Windows', () => {
        expect(normalizeCommand('tsx')).toBe('tsx.cmd');
        expect(normalizeCommand('npx')).toBe('npx.cmd');
        expect(normalizeCommand('pnpm')).toBe('pnpm.cmd');
        expect(normalizeCommand('ts-node')).toBe('ts-node.cmd');
      });

      it('should not double-add .cmd if already present', () => {
        expect(normalizeCommand('tsx.cmd')).toBe('tsx.cmd');
        expect(normalizeCommand('TSX.CMD')).toBe('TSX.CMD');
      });

      it('should not modify non-npm commands on Windows', () => {
        expect(normalizeCommand('node')).toBe('node');
        expect(normalizeCommand('python')).toBe('python');
        expect(normalizeCommand('custom-binary')).toBe('custom-binary');
      });

      it('should handle full paths correctly', () => {
        expect(normalizeCommand('C:\\Users\\test\\node_modules\\.bin\\tsx')).toBe(
          'C:\\Users\\test\\node_modules\\.bin\\tsx.cmd'
        );
        expect(normalizeCommand('/usr/local/bin/tsx')).toBe('/usr/local/bin/tsx.cmd');
      });

      it('should be case-insensitive for npm binary detection', () => {
        expect(normalizeCommand('TSX')).toBe('TSX.cmd');
        expect(normalizeCommand('Npx')).toBe('Npx.cmd');
      });
    });

    describe('edge cases', () => {
      it('should handle empty strings', () => {
        expect(normalizeCommand('')).toBe('');
      });

      it('should handle commands with dots', () => {
        Object.defineProperty(process, 'platform', {
          value: 'win32',
          writable: true,
          configurable: true,
        });

        expect(normalizeCommand('tsx.exe')).toBe('tsx.exe');
        expect(normalizeCommand('custom.bin')).toBe('custom.bin');
      });
    });
  });
});
