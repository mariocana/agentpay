const RATE_LIMITED = /rate limit|429|too many requests/i;

export async function withRetry<T>(fn: () => Promise<T>, tries = 6): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (!RATE_LIMITED.test(e instanceof Error ? e.message : String(e))) throw e;
      await new Promise((r) => setTimeout(r, 600 * 2 ** i));
    }
  }
  throw lastError;
}
