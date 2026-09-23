import { parseUnits } from "viem";

/** Worker's quote for a task, in USDC (6 decimals). Flat base plus a per-length component, capped. */
export function quoteForTask(task: string): bigint {
  const base = 0.01;
  const perHundredChars = 0.005;
  const usd = Math.min(0.5, base + (task.length / 100) * perHundredChars);
  return parseUnits(usd.toFixed(6), 6);
}
