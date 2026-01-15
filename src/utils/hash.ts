/**
 * Hash utilities for cache invalidation
 * Uses SHA-256 for security (not MD5)
 */

import { createHash } from 'crypto';
import type { SpellConfig } from '../core/types';

/**
 * Compute SHA-256 hash of spell configuration
 * Used for cache invalidation - detects when config changes
 *
 * Hash includes:
 * - description: Affects embedding generation
 * - keywords: Affects embedding generation
 *
 * @param config - spell configuration
 * @returns SHA-256 hash (hex string)
 */
export function computeSpellHash(config: SpellConfig): string {
  const content = `${config.description}|${config.keywords.join(',')}`;
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Compute SHA-256 hash of arbitrary text
 *
 * @param text - Input text
 * @returns SHA-256 hash (hex string)
 */
export function computeTextHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
