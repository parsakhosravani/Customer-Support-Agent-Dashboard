export const EMBEDDING_DIMENSION = 32;

/**
 * Lightweight deterministic embedding for local/demo mode only.
 * Replace this with model-generated semantic embeddings in production.
 */
export function toEmbedding(text: string): number[] {
  const vector = Array.from({ length: EMBEDDING_DIMENSION }, () => 0);
  const normalized = text.toLowerCase();

  for (let i = 0; i < normalized.length; i += 1) {
    const code = normalized.charCodeAt(i);
    const index = code % EMBEDDING_DIMENSION;
    vector[index] += 1;
  }

  const magnitude = Math.hypot(...vector) || 1;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}

export function vectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}
