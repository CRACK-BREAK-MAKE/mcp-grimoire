import { describe, expect, it } from 'vitest';
import { stdioTemplate } from '../stdio-template';
import { sseTemplate } from '../sse-template';
import { httpTemplate } from '../http-template';
import { parse } from 'yaml';
import type { SpellConfig } from '../../../core/types';

describe('Spell Templates', () => {
  describe('stdioTemplate', () => {
    it('should generate valid YAML', () => {
      // Act
      const template = stdioTemplate('test-spell');
      const parsed = parse(template);

      // Assert
      expect(parsed).toBeDefined();
      expect(typeof parsed).toBe('object');
    });

    it('should include correct spell name', () => {
      // Act
      const template = stdioTemplate('postgres');
      const config = parse(template) as SpellConfig;

      // Assert
      expect(config.name).toBe('postgres');
    });

    it('should capitalize name in description', () => {
      // Act
      const template = stdioTemplate('postgres');

      // Assert
      expect(template).toContain('# Postgres Spell Configuration');
      expect(template).toContain('## Postgres - Expert Guidance');
    });

    it('should handle hyphenated names', () => {
      // Act
      const template = stdioTemplate('cap-js');
      const config = parse(template) as SpellConfig;

      // Assert
      expect(config.name).toBe('cap-js');
      expect(template).toContain('# Cap-js Spell Configuration');
    });

    it('should include current date', () => {
      // Arrange
      const today = new Date().toISOString().split('T')[0];

      // Act
      const template = stdioTemplate('test');

      // Assert
      expect(template).toContain(`# Generated: ${today}`);
    });

    it('should set transport to stdio', () => {
      // Act
      const template = stdioTemplate('test');
      const config = parse(template) as SpellConfig;

      // Assert
      expect(config.server.transport).toBe('stdio');
    });

    it('should include required command and args fields', () => {
      // Act
      const template = stdioTemplate('test');
      const config = parse(template) as SpellConfig;

      // Assert
      expect(config.server.command).toBe('npx');
      expect(Array.isArray(config.server.args)).toBe(true);
      expect(config.server.args).toContain('-y');
    });

    it('should include at least 3 placeholder keywords', () => {
      // Act
      const template = stdioTemplate('test');
      const config = parse(template) as SpellConfig;

      // Assert
      expect(Array.isArray(config.keywords)).toBe(true);
      expect(config.keywords.length).toBeGreaterThanOrEqual(3);
    });

    it('should include version field', () => {
      // Act
      const template = stdioTemplate('test');
      const config = parse(template) as SpellConfig;

      // Assert
      expect(config.version).toBe('1.0.0');
    });

    it('should include steering section', () => {
      // Act
      const template = stdioTemplate('test');
      const config = parse(template) as SpellConfig;

      // Assert
      expect(config.steering).toBeDefined();
      expect(typeof config.steering).toBe('string');
      expect(config.steering).toContain('Expert Guidance');
      expect(config.steering).toContain('Best Practices');
    });

    it('should include description field', () => {
      // Act
      const template = stdioTemplate('test');
      const config = parse(template) as SpellConfig;

      // Assert
      expect(config.description).toBeDefined();
      expect(typeof config.description).toBe('string');
      expect(config.description.length).toBeGreaterThan(0);
    });

    it('should include env placeholder with comments', () => {
      // Act
      const template = stdioTemplate('test');

      // Assert
      expect(template).toContain('env:');
      expect(template).toContain('# API_KEY:');
    });
  });

  describe('sseTemplate', () => {
    it('should generate valid YAML', () => {
      // Act
      const template = sseTemplate('test-sse');
      const parsed = parse(template);

      // Assert
      expect(parsed).toBeDefined();
      expect(typeof parsed).toBe('object');
    });

    it('should include correct spell name', () => {
      // Act
      const template = sseTemplate('streaming');
      const config = parse(template) as SpellConfig;

      // Assert
      expect(config.name).toBe('streaming');
    });

    it('should set transport to sse', () => {
      // Act
      const template = sseTemplate('test');
      const config = parse(template) as SpellConfig;

      // Assert
      expect(config.server.transport).toBe('sse');
    });

    it('should include url field', () => {
      // Act
      const template = sseTemplate('test');
      const config = parse(template) as SpellConfig;

      // Assert
      expect(config.server.url).toBeDefined();
      expect(typeof config.server.url).toBe('string');
      expect(config.server.url).toContain('http');
    });

    it('should include default SSE endpoint', () => {
      // Act
      const template = sseTemplate('test');
      const config = parse(template) as SpellConfig;

      // Assert
      expect(config.server.url).toContain('sse');
    });

    it('should include streaming-related keywords', () => {
      // Act
      const template = sseTemplate('test');
      const config = parse(template) as SpellConfig;

      // Assert
      expect(config.keywords.length).toBeGreaterThanOrEqual(3);
    });

    it('should include SSE guidance in steering', () => {
      // Act
      const template = sseTemplate('test');
      const config = parse(template) as SpellConfig;

      // Assert
      expect(config.steering).toContain('SSE');
      expect(config.steering).toContain('streaming');
    });

    it('should include current date', () => {
      // Arrange
      const today = new Date().toISOString().split('T')[0];

      // Act
      const template = sseTemplate('test');

      // Assert
      expect(template).toContain(`# Generated: ${today}`);
    });
  });

  describe('httpTemplate', () => {
    it('should generate valid YAML', () => {
      // Act
      const template = httpTemplate('test-http');
      const parsed = parse(template);

      // Assert
      expect(parsed).toBeDefined();
      expect(typeof parsed).toBe('object');
    });

    it('should include correct spell name', () => {
      // Act
      const template = httpTemplate('api-service');
      const config = parse(template) as SpellConfig;

      // Assert
      expect(config.name).toBe('api-service');
    });

    it('should set transport to http', () => {
      // Act
      const template = httpTemplate('test');
      const config = parse(template) as SpellConfig;

      // Assert
      expect(config.server.transport).toBe('http');
    });

    it('should include url field', () => {
      // Act
      const template = httpTemplate('test');
      const config = parse(template) as SpellConfig;

      // Assert
      expect(config.server.url).toBeDefined();
      expect(typeof config.server.url).toBe('string');
      expect(config.server.url).toContain('http');
    });

    it('should include default HTTP endpoint', () => {
      // Act
      const template = httpTemplate('test');
      const config = parse(template) as SpellConfig;

      // Assert
      expect(config.server.url).toMatch(/http:\/\/.*:\d+/);
    });

    it('should include api-related keywords', () => {
      // Act
      const template = httpTemplate('test');
      const config = parse(template) as SpellConfig;

      // Assert
      expect(config.keywords.length).toBeGreaterThanOrEqual(3);
    });

    it('should include HTTP guidance in steering', () => {
      // Act
      const template = httpTemplate('test');
      const config = parse(template) as SpellConfig;

      // Assert
      expect(config.steering).toContain('HTTP');
    });

    it('should include current date', () => {
      // Arrange
      const today = new Date().toISOString().split('T')[0];

      // Act
      const template = httpTemplate('test');

      // Assert
      expect(template).toContain(`# Generated: ${today}`);
    });

    it('should mention HTTPS support in steering', () => {
      // Act
      const template = httpTemplate('test');

      // Assert
      expect(template.toLowerCase()).toContain('https');
    });
  });

  describe('Template Consistency', () => {
    it('all templates should have required fields', () => {
      // Arrange
      const templates = [
        { name: 'stdio', fn: stdioTemplate },
        { name: 'sse', fn: sseTemplate },
        { name: 'http', fn: httpTemplate },
      ];

      // Act & Assert
      for (const { name, fn } of templates) {
        const template = fn('test');
        const config = parse(template) as SpellConfig;

        expect(config.name, `${name} should have name`).toBe('test');
        expect(config.version, `${name} should have version`).toBe('1.0.0');
        expect(config.description, `${name} should have description`).toBeDefined();
        expect(config.keywords, `${name} should have keywords`).toBeDefined();
        expect(config.keywords.length, `${name} should have at least 3 keywords`).toBeGreaterThanOrEqual(3);
        expect(config.server, `${name} should have server`).toBeDefined();
        expect(config.server.transport, `${name} should have transport`).toBeDefined();
        expect(config.steering, `${name} should have steering`).toBeDefined();
      }
    });

    it('all templates should produce valid spell configurations', () => {
      // Arrange
      const templates = [stdioTemplate('test'), sseTemplate('test'), httpTemplate('test')];

      // Act & Assert
      for (const template of templates) {
        const config = parse(template) as SpellConfig;

        // Validate against SpellConfig type structure
        expect(typeof config.name).toBe('string');
        expect(typeof config.version).toBe('string');
        expect(typeof config.description).toBe('string');
        expect(Array.isArray(config.keywords)).toBe(true);
        expect(typeof config.server).toBe('object');
        expect(typeof config.server.transport).toBe('string');
      }
    });
  });
});
