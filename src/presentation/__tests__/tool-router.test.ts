import {ToolRouter} from '../tool-router';
import type {Tool} from '../../core/types';
import {beforeEach, describe, expect, it} from 'vitest';

describe('ToolRouter', () => {
  let router: ToolRouter;

  beforeEach(() => {
    router = new ToolRouter();
  });

  describe('registerTools', () => {
    it('should register tools for a power', () => {
      const tools: Tool[] = [
        {
          name: 'query_db',
          description: 'Query database',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'list_tables',
          description: 'List tables',
          inputSchema: { type: 'object', properties: {} },
        },
      ];

      router.registerTools('postgres', tools);

      expect(router.findSpellForTool('query_db')).toBe('postgres');
      expect(router.findSpellForTool('list_tables')).toBe('postgres');
    });

    it('should register tools for multiple powers', () => {
      const postgresTools: Tool[] = [
        {
          name: 'query_db',
          description: 'Query database',
          inputSchema: { type: 'object', properties: {} },
        },
      ];

      const stripeTools: Tool[] = [
        {
          name: 'create_subscription',
          description: 'Create subscription',
          inputSchema: { type: 'object', properties: {} },
        },
      ];

      router.registerTools('postgres', postgresTools);
      router.registerTools('stripe', stripeTools);

      expect(router.findSpellForTool('query_db')).toBe('postgres');
      expect(router.findSpellForTool('create_subscription')).toBe('stripe');
    });

    it('should handle empty tools array', () => {
      router.registerTools('postgres', []);

      expect(router.findSpellForTool('any_tool')).toBeUndefined();
    });
  });

  describe('unregisterTools', () => {
    it('should unregister all tools for a power', () => {
      const tools: Tool[] = [
        {
          name: 'query_db',
          description: 'Query database',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'list_tables',
          description: 'List tables',
          inputSchema: { type: 'object', properties: {} },
        },
      ];

      router.registerTools('postgres', tools);
      router.unregisterTools('postgres');

      expect(router.findSpellForTool('query_db')).toBeUndefined();
      expect(router.findSpellForTool('list_tables')).toBeUndefined();
    });

    it('should only unregister tools for specified power', () => {
      const postgresTools: Tool[] = [
        {
          name: 'query_db',
          description: 'Query',
          inputSchema: { type: 'object', properties: {} },
        },
      ];

      const stripeTools: Tool[] = [
        {
          name: 'create_sub',
          description: 'Create',
          inputSchema: { type: 'object', properties: {} },
        },
      ];

      router.registerTools('postgres', postgresTools);
      router.registerTools('stripe', stripeTools);

      router.unregisterTools('postgres');

      expect(router.findSpellForTool('query_db')).toBeUndefined();
      expect(router.findSpellForTool('create_sub')).toBe('stripe');
    });

    it('should handle unregistering non-existent power', () => {
      expect(() => {
        router.unregisterTools('nonexistent');
      }).not.toThrow();
    });
  });

  describe('findPowerForTool', () => {
    it('should return power name for registered tool', () => {
      const tools: Tool[] = [
        {
          name: 'query_db',
          description: 'Query',
          inputSchema: { type: 'object', properties: {} },
        },
      ];

      router.registerTools('postgres', tools);

      expect(router.findSpellForTool('query_db')).toBe('postgres');
    });

    it('should return undefined for unregistered tool', () => {
      expect(router.findSpellForTool('unknown_tool')).toBeUndefined();
    });

    it('should return undefined after unregistering', () => {
      const tools: Tool[] = [
        {
          name: 'query_db',
          description: 'Query',
          inputSchema: { type: 'object', properties: {} },
        },
      ];

      router.registerTools('postgres', tools);
      router.unregisterTools('postgres');

      expect(router.findSpellForTool('query_db')).toBeUndefined();
    });
  });

  describe('hasTool', () => {
    it('should return true for registered tool', () => {
      const tools: Tool[] = [
        {
          name: 'query_db',
          description: 'Query',
          inputSchema: { type: 'object', properties: {} },
        },
      ];

      router.registerTools('postgres', tools);

      expect(router.hasTool('query_db')).toBe(true);
    });

    it('should return false for unregistered tool', () => {
      expect(router.hasTool('unknown_tool')).toBe(false);
    });

    it('should return false after unregistering', () => {
      const tools: Tool[] = [
        {
          name: 'query_db',
          description: 'Query',
          inputSchema: { type: 'object', properties: {} },
        },
      ];

      router.registerTools('postgres', tools);
      router.unregisterTools('postgres');

      expect(router.hasTool('query_db')).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle tool name conflicts (last registration wins)', () => {
      const postgresTools: Tool[] = [
        {
          name: 'list',
          description: 'List tables',
          inputSchema: { type: 'object', properties: {} },
        },
      ];

      const stripeTools: Tool[] = [
        {
          name: 'list',
          description: 'List subscriptions',
          inputSchema: { type: 'object', properties: {} },
        },
      ];

      router.registerTools('postgres', postgresTools);
      router.registerTools('stripe', stripeTools);

      // Stripe's registration should overwrite
      expect(router.findSpellForTool('list')).toBe('stripe');
    });
  });
});
