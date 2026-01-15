/**
 * Vector Mathematics Utilities
 * Used for cosine similarity calculations in semantic search
 *
 * Performance: Optimized for 384-dimensional embeddings
 * - dotProduct: O(n)
 * - magnitude: O(n)
 * - cosineSimilarity: O(n)
 * - 100 similarities in <50ms for 384-dim vectors
 */

/**
 * Calculate the dot product of two vectors
 * Formula: v1 · v2 = Σ(v1[i] * v2[i])
 *
 * @param v1 - First vector
 * @param v2 - Second vector
 * @returns Dot product (scalar)
 * @throws Error if vectors have different lengths or are empty
 */
export function dotProduct(v1: number[], v2: number[]): number {
  if (v1.length === 0 || v2.length === 0) {
    throw new Error('Vectors cannot be empty');
  }

  if (v1.length !== v2.length) {
    throw new Error(
      `Vectors must have the same length (got ${v1.length} and ${v2.length})`
    );
  }

  let sum = 0;
  for (let i = 0; i < v1.length; i++) {
    sum += v1[i] * v2[i];
  }

  return sum;
}

/**
 * Calculate the magnitude (L2 norm) of a vector
 * Formula: ||v|| = sqrt(Σ(v[i]^2))
 *
 * @param v - Input vector
 * @returns Magnitude (scalar)
 * @throws Error if vector is empty
 */
export function magnitude(v: number[]): number {
  if (v.length === 0) {
    throw new Error('Vector cannot be empty');
  }

  let sumSquares = 0;
  for (let i = 0; i < v.length; i++) {
    sumSquares += v[i] * v[i];
  }

  return Math.sqrt(sumSquares);
}

/**
 * Calculate cosine similarity between two vectors
 * Formula: cos(θ) = (v1 · v2) / (||v1|| * ||v2||)
 *
 * Returns:
 *  1.0  = identical direction (very similar)
 *  0.0  = orthogonal (unrelated)
 * -1.0  = opposite direction (very dissimilar)
 *
 * @param v1 - First vector
 * @param v2 - Second vector
 * @returns Cosine similarity [-1, 1]
 * @throws Error if vectors have different lengths, are empty, or are zero vectors
 */
export function cosineSimilarity(v1: number[], v2: number[]): number {
  // Calculate dot product (will validate lengths and emptiness)
  const dot = dotProduct(v1, v2);

  // Calculate magnitudes
  const mag1 = magnitude(v1);
  const mag2 = magnitude(v2);

  // Check for zero vectors
  if (mag1 === 0 || mag2 === 0) {
    throw new Error('Zero vector has no direction');
  }

  // Cosine similarity
  return dot / (mag1 * mag2);
}

/**
 * Normalize a vector to unit length (magnitude = 1)
 * Formula: v_normalized = v / ||v||
 *
 * Useful for:
 * - Pre-computing normalized embeddings for faster similarity
 * - When cosine similarity = dot product (for normalized vectors)
 *
 * @param v - Input vector
 * @returns Normalized vector (new array)
 * @throws Error if vector is empty or zero vector
 */
export function normalizeVector(v: number[]): number[] {
  if (v.length === 0) {
    throw new Error('Vector cannot be empty');
  }

  const mag = magnitude(v);

  if (mag === 0) {
    throw new Error('Cannot normalize zero vector');
  }

  // Return new array (don't modify original)
  return v.map((component) => component / mag);
}
