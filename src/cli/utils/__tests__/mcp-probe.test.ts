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

    // New format uses # for title and "Test server" (not "Test-server")
    expect(steering).toContain('# Test server - Expert Guidance');
    expect(steering).toContain('## Tools (2)'); // New format
    expect(steering).toContain('## When to Use'); // New section
    expect(steering).toContain('## Workflow'); // New section
    expect(steering).toContain('## Key Practices'); // New section
    expect(steering).toContain('test_echo');
    expect(steering).toContain('Echoes back the input');
    expect(steering).toContain('Required: message');
    expect(steering).toContain('test_add');
    expect(steering).toContain('Adds two numbers');
    expect(steering).toContain('Required: a, b');
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

    expect(steering).toContain('Required: query');
    // Note: New compact format only shows required params, optional are omitted for brevity
    // This matches our <500 token constraint
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

    // Server info removed in new compact format to save tokens
    // Focus is on tools and best practices only
    expect(steering).toContain('# Server - Expert Guidance');
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

    // New format still groups tools but uses simpler format
    expect(steering).toContain('**file**:'); // Groups are still shown
    expect(steering).toContain('**db**:');
    expect(steering).toContain('file_read');
    expect(steering).toContain('db_query');
  });

  it('should add tip for many tools', () => {
    const tools: Tool[] = Array.from({ length: 10 }, (_, i) => ({
      name: `tool_${i}`,
      description: `Tool ${i}`,
      inputSchema: { type: 'object', properties: {} },
    }));

    const steering = generateSteeringFromTools('many', tools);

    // New format uses emoji-based tip for many tools
    expect(steering).toContain('10 tools available - read descriptions carefully');
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
    expect(result.error).toContain('Command not found');
  });

  // Note: Testing successful probe requires an actual MCP server running
  // This is better suited for integration tests
});
