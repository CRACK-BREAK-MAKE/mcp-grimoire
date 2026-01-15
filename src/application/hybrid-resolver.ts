/**
 * Hybrid Intent Resolver
 * Combines keyword matching with semantic search for robust intent resolution
 *
 * Strategy:
 * 1. Keyword Matching (Primary): Fast, high-confidence exact matches
 * 2. Semantic Search (Fallback): Handles abstract/conceptual queries
 * 3. Hybrid Scoring: Combines both when applicable
 *
 * Confidence Scoring:
 * - Keyword match: 0.9-1.0 (boosted for production reliability)
 * - Semantic match: 0.3-0.6 (realistic for embedding model)
 * - Hybrid: 0.7-0.9 (keyword + semantic combined)
 *
 * Performance targets:
 * - Resolution: < 100ms
 * - Top-N: < 100ms
 */

import type { SpellConfig } from '../core/types';
import type { EmbeddingService } from '../infrastructure/embedding-service';
import type { EmbeddingStorage } from '../infrastructure/embedding-storage';
import { computeSpellHash } from '../utils/hash';
import { cosineSimilarity } from '../utils/vector-math';
import { logger } from '../utils/logger';

/**
 * Match type for resolution result
 */
export type MatchType = 'keyword' | 'semantic' | 'hybrid';

/**
 * Hybrid resolution result with confidence and match type
 */
export interface HybridResult {
  spellName: string;
  confidence: number;
  matchType: MatchType;
}

/**
 * Spell configuration with indexed keywords
 */
interface IndexedSpell {
  config: SpellConfig;
  normalizedKeywords: Set<string>;
}

/**
 * Default minimum confidence threshold
 */
const DEFAULT_MIN_CONFIDENCE = 0.3;

/**
 * Keyword match confidence boost
 * Keyword matches get high confidence for production reliability
 */
const KEYWORD_MATCH_BASE_CONFIDENCE = 0.9;

/**
 * Hybrid resolver - combines keyword + semantic matching
 */
export class HybridResolver {
  private readonly embeddingService: EmbeddingService;
  private readonly storage: EmbeddingStorage;
  private readonly indexedSpells: Map<string, IndexedSpell> = new Map();

  constructor(embeddingService: EmbeddingService, storage: EmbeddingStorage) {
    this.embeddingService = embeddingService;
    this.storage = storage;
  }

  /**
   * Index a spell configuration
   * Generates embedding and indexes keywords for hybrid matching
   */
  public async indexSpell(config: SpellConfig): Promise<void> {
    // Generate and store embedding
    const hash = computeSpellHash(config);

    if (!this.storage.needsUpdate(config.name, hash)) {
      logger.debug('CACHE', 'Spell already indexed', { spellName: config.name });
      // But still update in-memory index for keywords
      this.indexKeywords(config);
      return;
    }

    // Generate embedding for semantic search
    const text = this.createEmbeddingText(config);
    const embedding = await this.embeddingService.embed(text);
    this.storage.set(config.name, embedding, hash);

    // Save embeddings to disk (atomic write)
    await this.storage.save();

    // Index keywords for fast matching
    this.indexKeywords(config);

    logger.info('CACHE', 'Spell indexed (hybrid)', {
      spellName: config.name,
      keywordCount: config.keywords.length,
      hash: hash.substring(0, 8),
    });
  }

  /**
   * Resolve query to most relevant spell
   * Uses hybrid keyword + semantic matching
   */
  public async resolve(
    query: string,
    minConfidence: number = DEFAULT_MIN_CONFIDENCE
  ): Promise<HybridResult | null> {
    const results = await this.resolveTopN(query, 1, minConfidence);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Resolve query to top N most relevant spells
   * Returns results sorted by confidence (descending)
   */
  public async resolveTopN(
    query: string,
    topN: number = 5,
    minConfidence: number = DEFAULT_MIN_CONFIDENCE
  ): Promise<HybridResult[]> {
    if (!query || query.trim().length === 0) {
      throw new Error('Query cannot be empty');
    }

    const normalizedQuery = this.normalizeText(query);
    const queryWords = normalizedQuery.split(/\s+/);

    // Step 1: Keyword matching scores
    const keywordScores = this.computeKeywordScores(queryWords);

    // Step 2: Semantic matching scores (if embeddings available)
    const semanticScores = await this.computeSemanticScores(query);

    // Step 3: Combine scores and determine match types
    const results: HybridResult[] = [];

    for (const spellName of this.getAllSpellNames()) {
      const keywordData = keywordScores.get(spellName);
      const keywordScore = keywordData?.score ?? 0;
      const matchCount = keywordData?.matchCount ?? 0;
      // exactCount is available for future enhancements (e.g., boosting exact matches)
      // const exactCount = keywordData?.exactCount ?? 0;

      const semanticScore = semanticScores.get(spellName) ?? 0;

      let confidence: number;
      let matchType: MatchType;

      // Determine match type and confidence based on scores and match counts
      // Strategy: Strong keyword (2+ matches) → pure keyword
      //           Weak keyword (1 match) + semantic → hybrid
      //           Only semantic → semantic fallback

      if (matchCount >= 2 && keywordScore > 0.5) {
        // Strong keyword match (multiple keywords matched) - pure keyword
        matchType = 'keyword';
        confidence = keywordScore;
      } else if (matchCount === 1 && keywordScore > 0.5 && semanticScore > 0.35) {
        // Weak keyword (single match) + semantic contribution - hybrid
        matchType = 'hybrid';
        confidence = Math.max(keywordScore, 0.7) + semanticScore * 0.2; // Boost with semantic
      } else if (keywordScore > 0.5) {
        // Moderate keyword match without semantic boost
        matchType = 'keyword';
        confidence = keywordScore;
      } else if (semanticScore > 0.3) {
        // Semantic match only
        matchType = 'semantic';
        confidence = semanticScore;
      } else {
        // No strong match
        continue;
      }

      // Cap confidence at 1.0
      confidence = Math.min(confidence, 1.0);

      if (confidence >= minConfidence) {
        results.push({ spellName: spellName, confidence, matchType });
      }
    }

    // Sort by confidence descending and return top N
    results.sort((a, b) => b.confidence - a.confidence);
    return results.slice(0, topN);
  }

  /**
   * Remove spell from index
   */
  public async removeSpell(spellName: string): Promise<void> {
    this.storage.delete(spellName);
    this.indexedSpells.delete(spellName);

    // Save embeddings to disk (atomic write)
    await this.storage.save();

    logger.info('CACHE', 'Spell removed from hybrid index', { spellName: spellName });
  }

  /**
   * Get all indexed spell names
   */
  public getIndexedSpells(): string[] {
    return Array.from(this.indexedSpells.keys());
  }

  /**
   * Get all spell names from both keyword index and embedding storage
   */
  private getAllSpellNames(): Set<string> {
    const names = new Set<string>();

    // From keyword index
    for (const name of this.indexedSpells.keys()) {
      names.add(name);
    }

    // From embedding storage
    for (const name of this.storage.getAll()) {
      names.add(name);
    }

    return names;
  }

  /**
   * Index keywords for fast matching
   */
  private indexKeywords(config: SpellConfig): void {
    const normalizedKeywords = new Set(
      config.keywords.map((k) => this.normalizeText(k))
    );

    this.indexedSpells.set(config.name, {
      config,
      normalizedKeywords,
    });
  }

  /**
   * Common stop words to filter out
   * These words are too common to be meaningful in keyword matching
   */
  private readonly STOP_WORDS = new Set([
    'the',
    'a',
    'an',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'by',
    'from',
    'as',
    'is',
    'was',
    'are',
    'be',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'should',
    'could',
    'may',
    'might',
    'can',
    'my',
    'i',
    'you',
    'we',
    'they',
    'it',
    'this',
    'that',
    'these',
    'those',
    'about',
  ]);

  /**
   * Compute keyword matching scores for all spells
   * Returns confidence scores based on keyword overlap
   * Also returns match count and exact match count for hybrid decision-making
   */
  private computeKeywordScores(
    queryWords: string[]
  ): Map<string, { score: number; matchCount: number; exactCount: number }> {
    const scores = new Map<
      string,
      { score: number; matchCount: number; exactCount: number }
    >();

    // Filter stop words and short words from query
    const meaningfulWords = queryWords.filter(
      (word) => word.length > 2 && !this.STOP_WORDS.has(word)
    );

    // If no meaningful words, return empty scores
    if (meaningfulWords.length === 0) {
      return scores;
    }

    for (const [spellName, indexed] of this.indexedSpells) {
      let matchCount = 0;
      let exactMatchCount = 0;

      // Count keyword matches (including partial matches)
      for (const queryWord of meaningfulWords) {
        for (const keyword of indexed.normalizedKeywords) {
          // Skip short keywords (too generic)
          if (keyword.length <= 2) continue;

          // Exact match (highest priority)
          if (queryWord === keyword) {
            matchCount++;
            exactMatchCount++;
            break;
          }

          // Substring match (lower priority)
          // Only match if query word is significant part of keyword or vice versa
          if (keyword.includes(queryWord) && queryWord.length >= 3) {
            matchCount++;
            break;
          }
          if (queryWord.includes(keyword) && keyword.length >= 3) {
            matchCount++;
            break;
          }
        }
      }

      if (matchCount > 0) {
        // Base confidence from keyword matching
        // Use meaningful words for ratio to avoid inflating single-word matches
        const matchRatio = matchCount / Math.max(meaningfulWords.length, 1);

        // Boost for exact matches
        const exactBoost = exactMatchCount > 0 ? 0.05 : 0;

        // Penalize if only 1 match out of many query words (weak match)
        const weakMatchPenalty = matchCount === 1 && meaningfulWords.length > 3 ? 0.1 : 0;

        const confidence =
          KEYWORD_MATCH_BASE_CONFIDENCE +
          matchRatio * 0.1 +
          exactBoost -
          weakMatchPenalty;

        scores.set(spellName, {
          score: Math.min(confidence, 1.0),
          matchCount,
          exactCount: exactMatchCount,
        });
      }
    }

    return scores;
  }

  /**
   * Compute semantic similarity scores for all spells
   * Returns similarity scores from embeddings
   */
  private async computeSemanticScores(query: string): Promise<Map<string, number>> {
    const scores = new Map<string, number>();

    try {
      const queryEmbedding = await this.embeddingService.embed(query);

      for (const spellName of this.storage.getAll()) {
        const spellEmbedding = this.storage.get(spellName);
        if (!spellEmbedding) continue;

        const similarity = cosineSimilarity(queryEmbedding, spellEmbedding);
        scores.set(spellName, similarity);
      }
    } catch (error) {
      logger.warn('CACHE', 'Semantic scoring failed, using keyword-only', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    return scores;
  }

  /**
   * Normalize text for matching
   * Lowercase and remove extra whitespace
   */
  private normalizeText(text: string): string {
    return text.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Create embedding text from spell config
   * Same format as SemanticResolver for consistency
   */
  private createEmbeddingText(config: SpellConfig): string {
    const keywords = config.keywords.join(' ');
    return `${config.description} ${keywords} ${keywords}`;
  }
}
