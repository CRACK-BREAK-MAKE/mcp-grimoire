/**
 * Unit tests for ProcessLifecycleManager
 * Tests process spawning, connection management, and cleanup
 * Following TDD: Testing critical lifecycle management component
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessLifecycleManager, ProcessSpawnError } from '../process-lifecycle';
import type { SpellConfig } from '../../core/types';

// Mock child_process and MCP SDK
vi.mock('child_process', () => ({
  spawn: vi.fn(() => {
    const EventEmitter = require('events');
    const mockProcess = new EventEmitter();
    mockProcess.pid = 12345;
    mockProcess.kill = vi.fn();
    mockProcess.stdout = new EventEmitter();
    mockProcess.stdin = { write: vi.fn(), end: vi.fn() };
    mockProcess.stderr = new EventEmitter();
    return mockProcess;
  }),
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class Client {
    connect = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
    listTools = vi.fn().mockResolvedValue({
      tools: [
        {
          name: 'test_tool',
          description: 'Test tool description',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    });
  },
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => {
  const { spawn } = require('child_process');
  return {
    StdioClientTransport: class StdioClientTransport {
      _process: any;

      constructor() {
        // Simulate the internal child process that StdioClientTransport creates
        this._process = spawn('echo', ['test']);
      }
    },
  };
});

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: class SSEClientTransport {},
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class StreamableHTTPClientTransport {},
}));

describe('ProcessLifecycleManager', () => {
  let manager: ProcessLifecycleManager;

  const testStdioConfig: SpellConfig = {
    name: 'test-stdio',
    version: '1.0.0',
    description: 'Test stdio power',
    keywords: ['test', 'stdio'],
    server: {
      transport: 'stdio',
      command: 'echo',
      args: ['test'],
    },
  };

  const testSSEConfig: SpellConfig = {
    name: 'test-sse',
    version: '1.0.0',
    description: 'Test SSE power',
    keywords: ['test', 'sse'],
    server: {
      transport: 'sse',
      url: 'http://localhost:3000/sse',
    },
  };

  const testHTTPConfig: SpellConfig = {
    name: 'test-http',
    version: '1.0.0',
    description: 'Test HTTP power',
    keywords: ['test', 'http'],
    server: {
      transport: 'http',
      url: 'http://localhost:3000/mcp',
    },
  };

  beforeEach(() => {
    manager = new ProcessLifecycleManager();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await manager.killAll();
  });

  describe('isActive', () => {
    it('should return false for inactive power', () => {
      expect(manager.isActive('test-power')).toBe(false);
    });

    it('should return true for active power', async () => {
      await manager.spawn('test-stdio', testStdioConfig);
      expect(manager.isActive('test-stdio')).toBe(true);
    });
  });

  describe('getTools', () => {
    it('should return empty array for inactive power', () => {
      expect(manager.getTools('nonexistent')).toEqual([]);
    });

    it('should return tools for active power', async () => {
      await manager.spawn('test-stdio', testStdioConfig);
      const tools = manager.getTools('test-stdio');

      expect(tools).toHaveLength(1);
      expect(tools[0]).toMatchObject({
        name: 'test_tool',
        description: 'Test tool description',
      });
    });

    it('should return a copy of tools array (not reference)', async () => {
      await manager.spawn('test-stdio', testStdioConfig);
      const tools1 = manager.getTools('test-stdio');
      const tools2 = manager.getTools('test-stdio');

      expect(tools1).toEqual(tools2);
      expect(tools1).not.toBe(tools2); // Different arrays
    });
  });

  describe('getActiveSpellNames', () => {
    it('should return empty array when no powers active', () => {
      expect(manager.getActiveSpellNames()).toEqual([]);
    });

    it('should return list of active power names', async () => {
      await manager.spawn('test-stdio', testStdioConfig);
      await manager.spawn('test-sse', testSSEConfig);

      const names = manager.getActiveSpellNames();
      expect(names).toHaveLength(2);
      expect(names).toContain('test-stdio');
      expect(names).toContain('test-sse');
    });
  });

  describe('spawn - stdio transport', () => {
    it('should spawn stdio power successfully', async () => {
      const tools = await manager.spawn('test-stdio', testStdioConfig);

      expect(tools).toBeDefined();
      expect(tools).toHaveLength(1);
      expect(manager.isActive('test-stdio')).toBe(true);
    });

    it('should return existing tools if already active', async () => {
      const tools1 = await manager.spawn('test-stdio', testStdioConfig);
      const tools2 = await manager.spawn('test-stdio', testStdioConfig);

      expect(tools1).toEqual(tools2);
    });

    it('should throw error if command missing', async () => {
      const invalidConfig: SpellConfig = {
        ...testStdioConfig,
        // @ts-ignore
        server: {
          transport: 'stdio',
          args: ['test'],
        },
      };

      await expect(manager.spawn('invalid', invalidConfig)).rejects.toThrow(ProcessSpawnError);
      await expect(manager.spawn('invalid', invalidConfig)).rejects.toThrow(
        'Stdio transport requires command and args'
      );
    });

    it('should throw error if args missing', async () => {
      const invalidConfig: SpellConfig = {
        ...testStdioConfig,
        // @ts-ignore
        server: {
          transport: 'stdio',
          command: 'echo',
        },
      };

      await expect(manager.spawn('invalid', invalidConfig)).rejects.toThrow(ProcessSpawnError);
    });

    it('should pass environment variables to child process', async () => {
      const configWithEnv: SpellConfig = {
        ...testStdioConfig,
        server: {
          transport: 'stdio',
          command: 'echo',
          args: ['test'],
          env: {
            TEST_VAR: 'test-value',
          },
        },
      };

      await manager.spawn('test-with-env', configWithEnv);
      expect(manager.isActive('test-with-env')).toBe(true);
    });
  });

  describe('spawn - SSE transport', () => {
    it('should connect to SSE server successfully', async () => {
      const tools = await manager.spawn('test-sse', testSSEConfig);

      expect(tools).toBeDefined();
      expect(tools).toHaveLength(1);
      expect(manager.isActive('test-sse')).toBe(true);
    });

    it('should throw error if url missing', async () => {
      const invalidConfig: SpellConfig = {
        ...testSSEConfig,
        // @ts-ignore
        server: {
          transport: 'sse',
        },
      };

      await expect(manager.spawn('invalid', invalidConfig)).rejects.toThrow(ProcessSpawnError);
      await expect(manager.spawn('invalid', invalidConfig)).rejects.toThrow(
        'SSE transport requires url'
      );
    });
  });

  describe('spawn - HTTP transport', () => {
    it('should connect to HTTP server successfully', async () => {
      const tools = await manager.spawn('test-http', testHTTPConfig);

      expect(tools).toBeDefined();
      expect(tools).toHaveLength(1);
      expect(manager.isActive('test-http')).toBe(true);
    });

    it('should throw error if url missing', async () => {
      const invalidConfig: SpellConfig = {
        ...testHTTPConfig,
        // @ts-ignore
        server: {
          transport: 'http',
        },
      };

      await expect(manager.spawn('invalid', invalidConfig)).rejects.toThrow(ProcessSpawnError);
      await expect(manager.spawn('invalid', invalidConfig)).rejects.toThrow(
        'HTTP transport requires url'
      );
    });
  });

  describe('spawn - unknown transport', () => {
    it('should throw error for unknown transport', async () => {
      const invalidConfig: SpellConfig = {
        ...testStdioConfig,
        server: {
          // @ts-expect-error - Testing invalid transport
          transport: 'unknown',
          command: 'echo',
          args: ['test'],
        },
      };

      await expect(manager.spawn('invalid', invalidConfig)).rejects.toThrow(ProcessSpawnError);
      await expect(manager.spawn('invalid', invalidConfig)).rejects.toThrow(
        'Unknown transport: unknown'
      );
    });
  });

  describe('spawn - default transport', () => {
    it('should default to stdio transport if not specified', async () => {
      const configNoTransport: SpellConfig = {
        ...testStdioConfig,
        server: {
          command: 'echo',
          args: ['test'],
        },
      };

      const tools = await manager.spawn('default-stdio', configNoTransport);
      expect(tools).toBeDefined();
      expect(manager.isActive('default-stdio')).toBe(true);
    });
  });

  describe('kill', () => {
    it('should kill active power successfully', async () => {
      await manager.spawn('test-stdio', testStdioConfig);
      expect(manager.isActive('test-stdio')).toBe(true);

      const result = await manager.kill('test-stdio');

      expect(result).toBe(true);
      expect(manager.isActive('test-stdio')).toBe(false);
    });

    it('should return false for non-existent power', async () => {
      const result = await manager.kill('nonexistent');
      expect(result).toBe(false);
    });

    it('should return false when power not active', async () => {
      const result = await manager.kill('test-stdio');
      expect(result).toBe(false);
    });

    it('should kill child process for stdio transport', async () => {
      // Spawn a stdio server
      await manager.spawn('test-stdio', testStdioConfig);

      // Get the connection to verify process exists
      const connection = (manager as any).connections.get('test-stdio');
      expect(connection).toBeDefined();
      expect(connection.process).toBeDefined();

      // Spy on the process.kill method
      const killSpy = vi.spyOn(connection.process, 'kill');

      // Kill the power
      const result = await manager.kill('test-stdio');

      // Verify kill was called on the child process
      expect(result).toBe(true);
      expect(killSpy).toHaveBeenCalled();
    });

    it('should not attempt to kill process for SSE transport', async () => {
      await manager.spawn('test-sse', testSSEConfig);
      const result = await manager.kill('test-sse');

      expect(result).toBe(true);
      expect(manager.isActive('test-sse')).toBe(false);
    });
  });

  describe('killAll', () => {
    it('should kill all active powers', async () => {
      await manager.spawn('test-stdio', testStdioConfig);
      await manager.spawn('test-sse', testSSEConfig);
      await manager.spawn('test-http', testHTTPConfig);

      expect(manager.getActiveSpellNames()).toHaveLength(3);

      await manager.killAll();

      expect(manager.getActiveSpellNames()).toHaveLength(0);
      expect(manager.isActive('test-stdio')).toBe(false);
      expect(manager.isActive('test-sse')).toBe(false);
      expect(manager.isActive('test-http')).toBe(false);
    });

    it('should handle empty active powers list', async () => {
      await expect(manager.killAll()).resolves.not.toThrow();
    });
  });

  describe('ProcessSpawnError', () => {
    it('should create error with message and power name', () => {
      const error = new ProcessSpawnError('Test error', 'test-power');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ProcessSpawnError);
      expect(error.message).toBe('Test error');
      expect(error.spellName).toBe('test-power');
      expect(error.name).toBe('ProcessSpawnError');
    });
  });

  describe('integration scenarios', () => {
    it('should handle spawn-kill-spawn cycle', async () => {
      // First spawn
      await manager.spawn('test-stdio', testStdioConfig);
      expect(manager.isActive('test-stdio')).toBe(true);
      const tools1 = manager.getTools('test-stdio');

      // Kill
      await manager.kill('test-stdio');
      expect(manager.isActive('test-stdio')).toBe(false);

      // Re-spawn
      await manager.spawn('test-stdio', testStdioConfig);
      expect(manager.isActive('test-stdio')).toBe(true);
      const tools2 = manager.getTools('test-stdio');

      expect(tools1).toEqual(tools2);
    });

    it('should handle multiple powers of different transports', async () => {
      await manager.spawn('stdio-1', testStdioConfig);
      await manager.spawn('sse-1', testSSEConfig);
      await manager.spawn('http-1', testHTTPConfig);

      expect(manager.getActiveSpellNames()).toHaveLength(3);

      const stdioTools = manager.getTools('stdio-1');
      const sseTools = manager.getTools('sse-1');
      const httpTools = manager.getTools('http-1');

      expect(stdioTools).toHaveLength(1);
      expect(sseTools).toHaveLength(1);
      expect(httpTools).toHaveLength(1);
    });

    it('should prevent duplicate activations', async () => {
      await manager.spawn('test-stdio', testStdioConfig);
      const names1 = manager.getActiveSpellNames();

      // Try to spawn again
      await manager.spawn('test-stdio', testStdioConfig);
      const names2 = manager.getActiveSpellNames();

      expect(names1).toEqual(names2);
      expect(names2).toHaveLength(1);
    });
  });
});
