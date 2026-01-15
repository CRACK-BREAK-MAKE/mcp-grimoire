import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { parse as parseYAML } from 'yaml';
import { ConfigurationError, isSpellConfig, validateSpellConfig } from '../core/spell-config';
import type { SpellConfig } from '../core/types';


/**
 * Interface for loading spell configurations
 */
export interface ConfigLoader {
  /**
   * Load all spell configs from a directory
   * @param directory Path to scan (e.g., (os.home)/.grimoire/)
   * @returns Map of spell name to config
   */
  loadAll(directory: string): Promise<Map<string, SpellConfig>>;

  /**
   * Load single spell config from file
   * @param filePath Path to .spell.yaml file
   */
  loadOne(filePath: string): Promise<SpellConfig>;
}

/**
 * YAML-based configuration loader
 * Scans directory for *.spell.yaml files
 */
export class YAMLConfigLoader implements ConfigLoader {
  async loadAll(directory: string): Promise<Map<string, SpellConfig>> {
    const configs = new Map<string, SpellConfig>();

    try {
      const files = await readdir(directory);
      const spellFiles = files.filter((f) => f.endsWith('.spell.yaml'));

      for (const file of spellFiles) {
        const filePath = join(directory, file);

        try {
          const config = await this.loadOne(filePath);

          // Check for duplicate names
          if (configs.has(config.name)) {
            console.warn(`Skipping duplicate spell name: ${config.name} in ${file}`);
            continue;
          }

          configs.set(config.name, config);
        } catch (error) {
          if (error instanceof ConfigurationError) {
            console.warn(`Skipping invalid config ${file}:`, error.message);
          } else {
            console.error(`Failed to load ${file}:`, error);
          }
          // Continue loading other files
        }
      }

      return configs;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Directory doesn't exist, return empty
        return configs;
      }
      throw error;
    }
  }

  async loadOne(filePath: string): Promise<SpellConfig> {
    const content = await readFile(filePath, 'utf-8');
    const parsed = parseYAML(content) as unknown;

    if (!isSpellConfig(parsed)) {
      throw new ConfigurationError(`Invalid config structure in ${filePath}`);
    }

    validateSpellConfig(parsed);

    return parsed;
  }
}
