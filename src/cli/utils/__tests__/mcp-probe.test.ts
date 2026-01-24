import { describe, expect, it } from 'vitest';
import { probeMCPServer, generateSteeringFromTools } from '../mcp-probe';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

describe('generateSteeringFromTools', () => {
  it('should generate steering with tool descriptions', () => {
    const tools: Tool[] = [
      {
        name: 'test_echo',
        description: 'Echoes back the input',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
          required: ['message'],
        },
      },
      {
        name: 'test_add',
        description: 'Adds two numbers',
        inputSchema: {
          type: 'object',
          properties: {
            a: { type: 'number' },
            b: { type: 'number' },
          },
          required: ['a', 'b'],
        },
      },
    ];

    const steering = generateSteeringFromTools('test-server', tools);

    // Compact format: title with "When to Use", keywords line, tools list
    expect(steering).toContain('# test-server - When to Use');
    expect(steering).toContain('Use when user needs: test, server operations');
    expect(steering).toContain('**Available Tools (2)**:');
    expect(steering).toContain('test_echo');
    expect(steering).toContain('test_add');
  });

  it('should handle tools with optional parameters', () => {
    const tools: Tool[] = [
      {
        name: 'test_query',
        description: 'Queries database',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            limit: { type: 'number' },
            offset: { type: 'number' },
          },
          required: ['query'],
        },
      },
    ];

    const steering = generateSteeringFromTools('db', tools);

    // Compact format only lists tool names, no parameter details
    expect(steering).toContain('# db - When to Use');
    expect(steering).toContain('**Available Tools (1)**:');
    expect(steering).toContain('test_query');
  });

  it('should include server info when provided', () => {
    const tools: Tool[] = [
      {
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ];

    const steering = generateSteeringFromTools('server', tools, {
      name: 'Test Server',
      version: '1.0.0',
    });

    // Compact format includes server name and version in title
    expect(steering).toContain('# Test Server (v1.0.0) - When to Use');
    expect(steering).toContain('**Available Tools (1)**:');
    expect(steering).toContain('test_tool');
  });

  it('should group tools by prefix', () => {
    const tools: Tool[] = [
      {
        name: 'file_read',
        description: 'Read file',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'file_write',
        description: 'Write file',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'db_query',
        description: 'Query database',
        inputSchema: { type: 'object', properties: {} },
      },
    ];

    const steering = generateSteeringFromTools('multi', tools);

    // Compact format groups tools by prefix
    expect(steering).toContain('# multi - When to Use');
    expect(steering).toContain('**Available Tools (3)**:');
    expect(steering).toContain('**file**:');
    expect(steering).toContain('**db**:');
    expect(steering).toContain('file_read');
    expect(steering).toContain('file_write');
    expect(steering).toContain('db_query');
  });

  it('should add tip for many tools', () => {
    const tools: Tool[] = Array.from({ length: 10 }, (_, i) => ({
      name: `tool_${i}`,
      description: `Tool ${i}`,
      inputSchema: { type: 'object', properties: {} },
    }));

    const steering = generateSteeringFromTools('many', tools);

    // Compact format lists up to 15 tools, shows count
    expect(steering).toContain('# many - When to Use');
    expect(steering).toContain('**Available Tools (10)**:');
    expect(steering).toContain('tool_0');
    expect(steering).toContain('tool_9');
  });
});

describe('probeMCPServer', () => {
  it('should fail when SSE URL is unreachable', async () => {
    const result = await probeMCPServer({
      name: 'test',
      server: {
        transport: 'sse',
        url: 'http://localhost:3000',
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('should fail when command is missing for stdio', async () => {
    const result = await probeMCPServer({
      name: 'test',
      server: {
        transport: 'stdio',
        args: [],
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Stdio transport requires command');
  });

  it('should fail when command does not exist', async () => {
    const result = await probeMCPServer({
      name: 'test',
      server: {
        transport: 'stdio',
        command: 'nonexistent-command-12345',
        args: [],
      },
    });

    expect(result.success).toBe(false);
    // Windows returns different error (Connection closed) vs Unix (ENOENT/Command not found)
    expect(result.error).toMatch(/Command not found|Connection closed|ENOENT/);
  });

  // Note: Testing successful probe requires an actual MCP server running
  // This is better suited for integration tests
});
