/**
 * Semantic Intent Resolver
 * Uses embeddings and cosine similarity to find most relevant spells
 *
 * Features:
 * - Generates embeddings for spell descriptions + keywords
 * - Uses cosine similarity for semantic matching
 * - Caches embeddings with SHA-256 hash invalidation
 * - Returns top-N matches with confidence scores
 *
 * Performance targets:
 * - Query resolution: < 100ms
 * - Index update: < 5ms per spell
 * - Similarity search: < 5ms for 100 spells
 *
 * See ADR-0007 for decision rationale
 */

import type { SpellConfig } from '../core/types';
import type { EmbeddingService } from '../infrastructure/embedding-service';
import type { EmbeddingStorage } from '../infrastructure/embedding-storage';
import { computeSpellHash } from '../utils/hash';
import { cosineSimilarity } from '../utils/vector-math';
import { logger } from '../utils/logger';

/**
 * Resolution result with confidence score
 */
export interface SemanticResult {
  spellName: string;
  similarity: number;
}

/**
 * Default confidence threshold
 * Results below this threshold are considered too weak
 *
 * Note: Semantic search alone has limitations (scores often 0.4-0.6 for good matches)
 * The Hybrid Resolver combines this with keyword matching for production robustness
 */
const DEFAULT_CONFIDENCE_THRESHOLD = 0.4;

/**
 * Semantic intent resolver
 * Uses ML embeddings for semantic similarity matching
 */
export class SemanticResolver {
  private readonly embeddingService: EmbeddingService;
  private readonly storage: EmbeddingStorage;

  /**
   * Create semantic resolver
   * @param embeddingService - Embedding generation service
   * @param storage - Persistent embedding storage
   */
  constructor(embeddingService: EmbeddingService, storage: EmbeddingStorage) {
    this.embeddingService = embeddingService;
    this.storage = storage;
  }

  /**
   * Index a spell configuration
   * Generates and caches embedding for the spell
   * Skips if embedding already exists and config unchanged
   *
   * @param config - spell configuration to index
   */
  public async indexSpell(config: SpellConfig): Promise<void> {
    // Compute hash for cache invalidation
    const hash = computeSpellHash(config);

    // Check if update needed
    if (!this.storage.needsUpdate(config.name, hash)) {
      logger.debug('CACHE', 'Spell embedding up to date', { spellName: config.name });
      return;
    }

    // Generate embedding
    const text = this.createEmbeddingText(config);
    const embedding = await this.embeddingService.embed(text);

    // Store with hash
    this.storage.set(config.name, embedding, hash);

    logger.info('CACHE', 'Spell indexed', {
      spellName: config.name,
      dimension: embedding.length,
      hash: hash.substring(0, 8),
    });
  }

  /**
   * Resolve query to most relevant spell
   * Returns top match above confidence threshold
   *
   * @param query - User query
   * @param minConfidence - Minimum confidence threshold (default: 0.3)
   * @returns spell name and similarity score, or null if no match
   */
  public async resolve(
    query: string,
    minConfidence: number = DEFAULT_CONFIDENCE_THRESHOLD
  ): Promise<SemanticResult | null> {
    const results = await this.resolveTopN(query, 1, minConfidence);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Resolve query to top N most relevant spells
   * Returns sorted list (highest similarity first)
   *
   * @param query - User query
   * @param topN - Number of results to return
   * @param minConfidence - Minimum confidence threshold (default: 0.3)
   * @returns Array of spell names with similarity scores
   */
  public async resolveTopN(
    query: string,
    topN: number = 5,
    minConfidence: number = DEFAULT_CONFIDENCE_THRESHOLD
  ): Promise<SemanticResult[]> {
    // Validate query
    if (!query || query.trim().length === 0) {
      throw new Error('Query cannot be empty');
    }

    // Generate query embedding
    const queryEmbedding = await this.embeddingService.embed(query);

    // Compute similarities for all indexed spells
    const results: SemanticResult[] = [];
    const indexedSpells = this.storage.getAll();

    for (const spellName of indexedSpells) {
      const spellEmbedding = this.storage.get(spellName);
      if (!spellEmbedding) {
        continue; // Should not happen, but defensive
      }

      // Compute cosine similarity
      const similarity = cosineSimilarity(queryEmbedding, spellEmbedding);

      // Only include if meets threshold
      if (similarity >= minConfidence) {
        results.push({ spellName: spellName, similarity });
      }
    }

    // Sort by similarity (descending) and take top N
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, topN);
  }

  /**
   * Remove spell from index
   * @param spellName - Name of spell to remove
   */
  public async removeSpell(spellName: string): Promise<void> {
    this.storage.delete(spellName);
    await this.storage.save();
    logger.info('CACHE', 'Spell removed from index', { spellName: spellName });
  }

  /**
   * Get list of all indexed spell names
   * @returns Array of spell names
   */
  public getIndexedSpells(): string[] {
    return this.storage.getAll();
  }

  /**
   * Create text for embedding from spell config
   * Combines description and keywords for richer semantic representation
   *
   * Note: Semantic similarity has inherent limitations (typical scores 0.4-0.6)
   * The Hybrid Resolver will boost accuracy by combining with keyword matching
   *
   * @param config - Spell configuration
   * @returns Combined text for embedding
   */
  private createEmbeddingText(config: SpellConfig): string {
    // Simple format: description + repeated keywords for emphasis
    const keywords = config.keywords.join(' ');
    return `${config.description} ${keywords} ${keywords}`;
  }
}
