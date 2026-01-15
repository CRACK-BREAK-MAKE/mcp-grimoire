import type { SpellConfig } from '../core/types';
import type { ConfigLoader } from '../infrastructure/config-loader';
import { logger } from '../utils/logger';
import { getSpellDirectory } from '../utils/paths';

/**
 * Spell Discovery Engine
 * Scans and loads spell configurations at startup
 */
export class SpellDiscovery {
  private spells = new Map<string, SpellConfig>();

  constructor(
    private readonly configLoader: ConfigLoader,
    private readonly spellDirectory: string = getSpellDirectory()
  ) {}

  /**
   * Scan and load all spell configurations
   * @returns Number of spells loaded
   */
  async scan(): Promise<number> {
    logger.info('STARTUP', 'Scanning for spells', { directory: this.spellDirectory });

    this.spells = await this.configLoader.loadAll(this.spellDirectory);

    logger.info('STARTUP', 'Loaded spells', {
      count: this.spells.size,
      spells: Array.from(this.spells.keys()),
    });

    return this.spells.size;
  }

  /**
   * Get all loaded spell configurations
   */
  getSpells(): ReadonlyMap<string, SpellConfig> {
    return this.spells;
  }

  /**
   * Get specific spell configuration
   */
  getSpell(name: string): SpellConfig | undefined {
    return this.spells.get(name);
  }

  /**
   * Check if spell exists
   */
  hasSpell(name: string): boolean {
    return this.spells.has(name);
  }

  /**
   * Get the spell directory path
   */
  getSpellDirectory(): string {
    return this.spellDirectory;
  }
}
