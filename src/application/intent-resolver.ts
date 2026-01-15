import type { SpellConfig, IntentResolutionResult } from '../core/types';

/**
 * Interface for intent resolution strategies
 */
export interface IntentResolver {
  /**
   * Resolve user query to spell name
   * @param query User's natural language query
   * @param spells Available spell configurations
   * @returns Resolution result with confidence
   */
  resolve(query: string, spells: ReadonlyMap<string, SpellConfig>): IntentResolutionResult;
}

/**
 * Keyword-based intent resolver
 * Matches query against spell keywords using simple string matching
 */
export class KeywordResolver implements IntentResolver {
  resolve(query: string, spells: ReadonlyMap<string, SpellConfig>): IntentResolutionResult {
    // Validate input
    if (!query || query.trim().length === 0) {
      return {
        status: 'not_found',
        query: query,
      };
    }

    const normalizedQuery = this.normalizeQuery(query);
    const scores: Array<{ name: string; score: number }> = [];

    // Score each spell
    for (const [name, config] of spells) {
      const score = this.calculateScore(normalizedQuery, config.keywords);
      if (score > 0) {
        scores.push({ name, score });
      }
    }

    // No matches
    if (scores.length === 0) {
      return {
        status: 'not_found',
        query: query,
      };
    }

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    const winner = scores[0];
    const confidence = this.calculateConfidence(winner.score, scores);

    return {
      status: 'found',
      spellName: winner.name,
      confidence: confidence,
    };
  }

  /**
   * Normalize query for matching
   */
  private normalizeQuery(query: string): string {
    return query.toLowerCase().trim();
  }

  /**
   * Calculate match score for a spell
   * @returns Number of matched keywords
   */
  private calculateScore(query: string, keywords: ReadonlyArray<string>): number {
    let score = 0;

    for (const keyword of keywords) {
      if (query.includes(keyword.toLowerCase())) {
        score++;
      }
    }

    return score;
  }

  /**
   * Calculate confidence (0-1) based on scores
   * High confidence if winner has significantly more matches
   */
  private calculateConfidence(
    winnerScore: number,
    allScores: Array<{ name: string; score: number }>
  ): number {
    if (allScores.length === 1) {
      return 1.0; // Only one match, 100% confident
    }

    const secondScore = allScores[1].score;

    if (secondScore === 0) {
      return 1.0; // Clear winner
    }

    // Confidence decreases if runner-up is close
    const ratio = winnerScore / secondScore;
    return Math.min(ratio / 2, 1.0);
  }
}
