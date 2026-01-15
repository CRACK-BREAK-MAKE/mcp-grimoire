/**
 * Example Command
 * Generate example spell template files
 */

import { writeFileSync } from 'fs';
import { stdioTemplate, sseTemplate, httpTemplate } from '../templates';

export interface ExampleOptions {
  output?: string;
}

export function exampleCommand(transport: string, options: ExampleOptions): void {
  // Validate transport type
  const validTransports = ['stdio', 'sse', 'http'];
  if (!validTransports.includes(transport)) {
    console.error(`Error: Invalid transport type "${transport}"`);
    console.error(`Valid options are: ${validTransports.join(', ')}`);
    process.exit(1);
  }

  // Generate template based on transport type
  const spellName = `example-${transport}`;
  let template: string;

  switch (transport) {
    case 'stdio':
      template = stdioTemplate(spellName);
      break;
    case 'sse':
      template = sseTemplate(spellName);
      break;
    case 'http':
      template = httpTemplate(spellName);
      break;
    default:
      throw new Error(`Unsupported transport: ${transport}`);
  }

  // Output to file or stdout
  if (options.output != null && options.output !== '') {
    try {
      writeFileSync(options.output, template, 'utf-8');
      console.warn(`✅ Spell template created: ${options.output}`);
      console.warn(`   Transport: ${transport}`);
      console.warn(`   Edit the file and update with your MCP server details.`);
    } catch (error) {
      console.error(
        `Error writing file: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      process.exit(1);
    }
  } else {
    // Output to stdout
    console.warn(template);
  }
}
