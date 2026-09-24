const RETRYABLE = /rate limit|429|too many requests|failed to fetch|http request failed|network|socket|econnreset|etimedout|timeout/i;

export async function withRetry<T>(fn: () => Promise<T>, tries = 6): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (!RETRYABLE.test(e instanceof Error ? e.message : String(e))) throw e;
      await new Promise((r) => setTimeout(r, 600 * 2 ** i));
    }
  }
  throw lastError;
}
