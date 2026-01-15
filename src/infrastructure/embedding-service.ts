/**
 * Embedding Service
 * Uses @xenova/transformers with all-MiniLM-L6-v2 model
 * Generates 384-dimensional sentence embeddings for semantic search
 *
 * Model: Xenova/all-MiniLM-L6-v2
 * - Size: ~23MB (quantized)
 * - Dimension: 384
 * - Speed: ~50ms per embedding (after model load)
 * - Quality: Optimized for semantic similarity
 *
 * Singleton pattern ensures model is loaded only once
 */

import { pipeline, type FeatureExtractionPipeline } from '@xenova/transformers';

/**
 * Model information
 */
export interface ModelInfo {
  name: string;
  dimension: number;
  version: string;
}

/**
 * Embedding service for generating sentence embeddings
 * Uses singleton pattern to cache model across calls
 */
export class EmbeddingService {
  private static instance: EmbeddingService | null = null;
  private static initPromise: Promise<EmbeddingService> | null = null;

  private model: FeatureExtractionPipeline | null = null;
  private readonly modelName = 'Xenova/all-MiniLM-L6-v2';
  private readonly dimension = 384;

  /**
   * Private constructor - use getInstance() instead
   */
  private constructor() {}

  /**
   * Get singleton instance of EmbeddingService
   * Lazy-loads the model on first call
   *
   * @returns Promise resolving to EmbeddingService instance
   */
  public static async getInstance(): Promise<EmbeddingService> {
    // Return existing instance if already initialized
    if (EmbeddingService.instance) {
      return EmbeddingService.instance;
    }

    // If initialization is in progress, wait for it
    if (EmbeddingService.initPromise) {
      return EmbeddingService.initPromise;
    }

    // Start initialization
    EmbeddingService.initPromise = (async (): Promise<EmbeddingService> => {
      const service = new EmbeddingService();
      await service.initialize();
      EmbeddingService.instance = service;
      EmbeddingService.initPromise = null;
      return service;
    })();

    return EmbeddingService.initPromise;
  }

  /**
   * Initialize the model
   * Downloads model on first run (~23MB)
   * Subsequent runs load from cache
   */
  private async initialize(): Promise<void> {
    try {
      this.model = await pipeline('feature-extraction', this.modelName, {
        // Quantized model for smaller size and faster inference
        quantized: true,
      });
    } catch (error) {
      throw new Error(
        `Failed to initialize embedding model: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generate embedding for a single text
   *
   * @param text - Input text to embed
   * @returns 384-dimensional embedding vector
   * @throws Error if text is invalid or model not initialized
   */
  public async embed(text: string): Promise<number[]> {
    // Validate input
    if (text === null || text === undefined) {
      throw new Error('Text cannot be null or undefined');
    }

    if (typeof text !== 'string') {
      throw new Error(`Text must be a string, got ${typeof text}`);
    }

    if (!this.model) {
      throw new Error('Model not initialized. Call getInstance() first.');
    }

    try {
      // Generate embedding
      const output = await this.model(text, {
        pooling: 'mean', // Mean pooling for sentence embeddings
        normalize: true, // Normalize to unit length for cosine similarity
      });

      // Extract float32 array and convert to regular array
      const embedding = Array.from(output.data as Float32Array);

      // Validate output dimension
      if (embedding.length !== this.dimension) {
        throw new Error(
          `Expected ${this.dimension}-dim embedding, got ${embedding.length}`
        );
      }

      return embedding;
    } catch (error) {
      throw new Error(
        `Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generate embeddings for multiple texts (batch processing)
   * More efficient than calling embed() multiple times
   *
   * @param texts - Array of texts to embed
   * @returns Array of 384-dimensional embedding vectors
   */
  public async embedBatch(texts: string[]): Promise<number[][]> {
    if (!Array.isArray(texts)) {
      throw new Error('Texts must be an array');
    }

    if (texts.length === 0) {
      return [];
    }

    // Validate all texts
    for (let i = 0; i < texts.length; i++) {
      if (typeof texts[i] !== 'string') {
        throw new Error(`Text at index ${i} must be a string, got ${typeof texts[i]}`);
      }
    }

    if (!this.model) {
      throw new Error('Model not initialized. Call getInstance() first.');
    }

    try {
      // Process batch
      const output = await this.model(texts, {
        pooling: 'mean',
        normalize: true,
      });

      // Convert to array of arrays
      const embeddings: number[][] = [];
      const data = output.data as Float32Array;

      for (let i = 0; i < texts.length; i++) {
        const start = i * this.dimension;
        const end = start + this.dimension;
        embeddings.push(Array.from(data.slice(start, end)));
      }

      return embeddings;
    } catch (error) {
      throw new Error(
        `Failed to generate batch embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get information about the loaded model
   *
   * @returns Model metadata
   */
  public getModelInfo(): ModelInfo {
    return {
      name: this.modelName,
      dimension: this.dimension,
      version: 'v2.17.2', // @xenova/transformers version
    };
  }

  /**
   * Check if model is initialized
   */
  public isInitialized(): boolean {
    return this.model !== null;
  }
}
