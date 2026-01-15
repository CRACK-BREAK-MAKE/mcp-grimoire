/**
 * List Command
 * List all installed spells in the grimoire directory
 */

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import { getSpellDirectory } from '../../utils/paths';
import type { SpellConfig } from '../../core/types';
import { formatError, formatSuccess, formatInfo, formatWarning, bold, dim } from '../utils/prompts';

export interface ListOptions {
  verbose?: boolean;
}

export function listCommand(options: ListOptions): void {
  const spellDir = getSpellDirectory();

  try {
    // Read all files in grimoire directory
    const files = readdirSync(spellDir);
    const spellFiles = files.filter((f) => f.endsWith('.spell.yaml'));

    /* eslint-disable no-console */
    if (spellFiles.length === 0) {
      console.log(formatInfo(`No spells found in ${spellDir}`));
      console.log(`\n${bold('To add a spell:')}`);
      console.log('  grimoire example stdio -o ~/.grimoire/myspell.spell.yaml');
      console.log('  # Then edit the file with your MCP server details');
      return;
    }

    console.log(`\n${bold('📚 Spells in')} ${dim(spellDir)}\n`);

    // List spells
    for (const file of spellFiles) {
      const filePath = join(spellDir, file);

      try {
        const content = readFileSync(filePath, 'utf-8');
        const config = parse(content) as SpellConfig;

        if (options.verbose === true) {
          // Verbose output with details
          console.log(`\n🔮 ${bold(config.name ?? file)}`);
          console.log(`   ${dim('File:')} ${file}`);
          console.log(`   ${dim('Version:')} ${config.version || 'N/A'}`);
          console.log(`   ${dim('Transport:')} ${config.server?.transport || 'N/A'}`);
          console.log(`   ${dim('Description:')} ${config.description?.split('\n')[0] || 'N/A'}`);
          console.log(
            `   ${dim('Keywords:')} ${config.keywords?.slice(0, 5).join(', ') || 'N/A'}${config.keywords?.length > 5 ? '...' : ''}`
          );
        } else {
          // Simple output
          const transport = config.server?.transport || 'unknown';
          const keywordCount = config.keywords?.length || 0;
          console.log(
            `  🔮 ${bold(config.name?.padEnd(25) || file.padEnd(25))} ${dim(`[${transport.padEnd(6)}]`)} ${dim(`(${keywordCount} keywords)`)}`
          );
        }
      } catch (error) {
        console.error(
          formatWarning(`${file}: Failed to parse (${error instanceof Error ? error.message : 'unknown error'})`)
        );
      }
    }

    console.log(`\n${formatSuccess(`Total: ${spellFiles.length} spells`)}`);

    if (options.verbose !== true) {
      console.log(`\n${dim('Use --verbose (-v) for more details')}`);
    }
    /* eslint-enable no-console */
  } catch (error) {
     
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error(formatError(`Directory not found: ${spellDir}`));
      console.error('Run the gateway once to create it automatically.');
    } else {
      console.error(formatError(error instanceof Error ? error.message : 'Unknown error'));
    }
     
    process.exit(1);
  }
}
