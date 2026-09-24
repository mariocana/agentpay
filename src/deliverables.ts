// Content-addressed deliverable store. The keccak256 of the canonical JSON payload is what
// the provider commits onchain via submit(jobId, deliverable).
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { keccak256, toHex, type Hex } from "viem";

const DIR = new URL("../data/deliverables/", import.meta.url);

export interface Deliverable {
  jobId: string;
  task: string;
  output: string;
  model: string;
  producedAt: string;
  provider: string;
}

export function canonical(d: Deliverable): string {
  return JSON.stringify(d, Object.keys(d).sort());
}

export function hashDeliverable(d: Deliverable): Hex {
  return keccak256(toHex(canonical(d)));
}

export function storeDeliverable(d: Deliverable): Hex {
  mkdirSync(DIR, { recursive: true });
  const h = hashDeliverable(d);
  writeFileSync(new URL(`${h}.json`, DIR), canonical(d));
  return h;
}

export function loadDeliverable(hash: Hex): Deliverable | null {
  const p = new URL(`${hash}.json`, DIR);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as Deliverable;
}

/** Fetch from the worker's HTTP endpoint (falls back to local disk when running on the same machine). */
export async function fetchDeliverable(hash: Hex, workerUrl?: string): Promise<Deliverable | null> {
  if (workerUrl) {
    try {
      const res = await fetch(`${workerUrl.replace(/\/$/, "")}/deliverables/${hash}`);
      if (res.ok) return (await res.json()) as Deliverable;
    } catch {
      /* fall through */
    }
  }
  return loadDeliverable(hash);
}

export function findByJobId(jobId: string): Deliverable | null {
  if (!existsSync(DIR)) return null;
  for (const f of readdirSync(DIR)) {
    if (!f.endsWith(".json")) continue;
    try {
      const d = JSON.parse(readFileSync(new URL(f, DIR), "utf8")) as Deliverable;
      if (d.jobId === jobId) return d;
    } catch {
      continue;
    }
  }
  return null;
}
