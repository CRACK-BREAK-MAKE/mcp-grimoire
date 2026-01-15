import {SteeringInjector} from '../steering-injector';
import type {Tool} from '../../core/types';
import {beforeEach, describe, expect, it} from 'vitest';

describe('SteeringInjector', () => {
  let injector: SteeringInjector;

  beforeEach(() => {
    injector = new SteeringInjector();
  });

  describe('inject', () => {
    it('should inject steering into tool descriptions', () => {
      const tools: Tool[] = [
        {
          name: 'query_database',
          description: 'Execute a SQL query',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } },
          },
        },
      ];

      const steering = 'Always use parameterized queries';

      const result = injector.inject(tools, steering);

      expect(result).toHaveLength(1);
      expect(result[0].description).toContain('Execute a SQL query');
      expect(result[0].description).toContain('--- EXPERT GUIDANCE ---');
      expect(result[0].description).toContain('Always use parameterized queries');
    });

    it('should inject steering into multiple tools', () => {
      const tools: Tool[] = [
        {
          name: 'tool1',
          description: 'First tool',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'tool2',
          description: 'Second tool',
          inputSchema: { type: 'object', properties: {} },
        },
      ];

      const steering = 'Use with care';

      const result = injector.inject(tools, steering);

      expect(result).toHaveLength(2);
      expect(result[0].description).toContain('--- EXPERT GUIDANCE ---');
      expect(result[1].description).toContain('--- EXPERT GUIDANCE ---');
    });

    it('should return unmodified tools when steering is undefined', () => {
      const tools: Tool[] = [
        {
          name: 'tool1',
          description: 'Original description',
          inputSchema: { type: 'object', properties: {} },
        },
      ];

      const result = injector.inject(tools, undefined);

      expect(result).toHaveLength(1);
      expect(result[0].description).toBe('Original description');
      expect(result[0].description).not.toContain('--- EXPERT GUIDANCE ---');
    });

    it('should return unmodified tools when steering is empty string', () => {
      const tools: Tool[] = [
        {
          name: 'tool1',
          description: 'Original description',
          inputSchema: { type: 'object', properties: {} },
        },
      ];

      const result = injector.inject(tools, '');

      expect(result).toHaveLength(1);
      expect(result[0].description).toBe('Original description');
    });

    it('should return unmodified tools when steering is whitespace only', () => {
      const tools: Tool[] = [
        {
          name: 'tool1',
          description: 'Original description',
          inputSchema: { type: 'object', properties: {} },
        },
      ];

      const result = injector.inject(tools, '   \n  ');

      expect(result).toHaveLength(1);
      expect(result[0].description).toBe('Original description');
    });

    it('should handle empty tools array', () => {
      const result = injector.inject([], 'Some steering');

      expect(result).toEqual([]);
    });

    it('should not mutate original tool objects', () => {
      const tools: Tool[] = [
        {
          name: 'tool1',
          description: 'Original',
          inputSchema: { type: 'object', properties: {} },
        },
      ];

      const originalDescription = tools[0].description;

      injector.inject(tools, 'Steering');

      // Original should be unchanged
      expect(tools[0].description).toBe(originalDescription);
    });

    it('should preserve tool name and inputSchema', () => {
      const tools: Tool[] = [
        {
          name: 'query_db',
          description: 'Execute query',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
          },
        },
      ];

      const result = injector.inject(tools, 'Use carefully');

      expect(result[0].name).toBe('query_db');
      expect(result[0].inputSchema).toEqual(tools[0].inputSchema);
    });
  });
});
