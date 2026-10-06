export const STALE_PROCESSING_MS = 5 * 60 * 1000;

/** A document stuck in "processing" for too long can be retried. */
export function isProcessingStale(startedAt: string | null, now: Date = new Date()): boolean {
  if (!startedAt) return false;
  return now.getTime() - new Date(startedAt).getTime() > STALE_PROCESSING_MS;
}
