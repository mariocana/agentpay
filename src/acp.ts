// ERC-8183 (Agentic Commerce) helpers over the AgenticCommerce contract.
import { decodeEventLog, keccak256, toHex, type Address, type Hex } from "viem";
import { agenticCommerceAbi } from "./abi/agenticCommerce.js";
import { erc20Abi } from "./abi/erc20.js";
import { erc8183Address, USDC, JOB_STATUS, txUrl } from "./config.js";
import { publicClient, type Wallet } from "./clients.js";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
export const ZERO_BYTES32 = `0x${"0".repeat(64)}` as Hex;

const acp = () => ({ address: erc8183Address(), abi: agenticCommerceAbi }) as const;

export interface Job {
  id: bigint;
  client: Address;
  provider: Address;
  evaluator: Address;
  description: string;
  budget: bigint;
  expiredAt: bigint;
  status: (typeof JOB_STATUS)[number];
  hook: Address;
}

export async function getJob(jobId: bigint): Promise<Job> {
  const j = await publicClient.readContract({ ...acp(), functionName: "getJob", args: [jobId] });
  return { ...j, status: JOB_STATUS[j.status] ?? "Open" };
}

export async function jobCounter(): Promise<bigint> {
  return publicClient.readContract({ ...acp(), functionName: "jobCounter" });
}

async function send(wallet: Wallet, label: string, request: () => Promise<Hex>): Promise<Hex> {
  const hash = await request();
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} reverted: ${txUrl(hash)}`);
  return hash;
}

/** Client: create a job for a known provider. The client is also the evaluator. */
export async function createJob(
  wallet: Wallet,
  params: { provider: Address; description: string; ttlSeconds?: number; evaluator?: Address },
): Promise<{ jobId: bigint; hash: Hex }> {
  const block = await publicClient.getBlock();
  // Contract requires expiredAt > now + 5 minutes.
  const expiredAt = block.timestamp + BigInt(params.ttlSeconds ?? 3600);
  const hash = await send(wallet, "createJob", () =>
    wallet.writeContract({
      ...acp(),
      functionName: "createJob",
      args: [params.provider, params.evaluator ?? wallet.account.address, expiredAt, params.description, ZERO_ADDRESS],
    }),
  );
  const receipt = await publicClient.getTransactionReceipt({ hash });
  for (const log of receipt.logs) {
    try {
      const ev = decodeEventLog({ abi: agenticCommerceAbi, data: log.data, topics: log.topics });
      if (ev.eventName === "JobCreated") return { jobId: ev.args.jobId, hash };
    } catch {
      /* not ours */
    }
  }
  throw new Error("JobCreated event not found");
}

/** Provider: quote a price for an Open job. */
export function setBudget(wallet: Wallet, jobId: bigint, amount: bigint) {
  return send(wallet, "setBudget", () =>
    wallet.writeContract({ ...acp(), functionName: "setBudget", args: [jobId, amount, "0x"] }),
  );
}

/** Client: approve USDC (if needed) and move the job to Funded. */
export async function fund(wallet: Wallet, jobId: bigint): Promise<Hex> {
  const job = await getJob(jobId);
  const owner = wallet.account.address;
  const allowance = await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "allowance", args: [owner, erc8183Address()] });
  if (allowance < job.budget) {
    await send(wallet, "approve", () =>
      wallet.writeContract({ address: USDC, abi: erc20Abi, functionName: "approve", args: [erc8183Address(), job.budget] }),
    );
  }
  return send(wallet, "fund", () => wallet.writeContract({ ...acp(), functionName: "fund", args: [jobId, "0x"] }));
}

/** Provider: submit the deliverable commitment (keccak256 of the deliverable payload). */
export function submit(wallet: Wallet, jobId: bigint, deliverableHash: Hex) {
  return send(wallet, "submit", () =>
    wallet.writeContract({ ...acp(), functionName: "submit", args: [jobId, deliverableHash, "0x"] }),
  );
}

/** Evaluator: release escrow to the provider. `reason` is an attestation hash. */
export function complete(wallet: Wallet, jobId: bigint, reason: string) {
  return send(wallet, "complete", () =>
    wallet.writeContract({ ...acp(), functionName: "complete", args: [jobId, keccak256(toHex(reason)), "0x"] }),
  );
}

/** Client (Open) or evaluator (Funded/Submitted): refund escrow to the client. */
export function reject(wallet: Wallet, jobId: bigint, reason: string) {
  return send(wallet, "reject", () =>
    wallet.writeContract({ ...acp(), functionName: "reject", args: [jobId, keccak256(toHex(reason)), "0x"] }),
  );
}

export async function usdcBalance(addr: Address): Promise<bigint> {
  return publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [addr] });
}

/** Poll until the job reaches one of `statuses` (Arc finality is sub-second, polling is cheap). */
export async function waitForStatus(jobId: bigint, statuses: Job["status"][], timeoutMs = 10 * 60_000, intervalMs = 1500): Promise<Job> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await getJob(jobId);
    if (statuses.includes(job.status)) return job;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`job ${jobId} did not reach ${statuses.join("/")} within ${timeoutMs}ms`);
}

/** Subscribe to AgenticCommerce events (polling-based, works on plain HTTP RPC). */
export function watchEvents(onLogs: (logs: WatchedLog[]) => void, fromBlock?: bigint) {
  return publicClient.watchContractEvent({
    ...acp(),
    fromBlock,
    poll: true,
    pollingInterval: 1500,
    onLogs: (logs) => onLogs(logs as unknown as WatchedLog[]),
  });
}

export type WatchedLog = {
  eventName: string;
  args: Record<string, unknown>;
  blockNumber: bigint;
  transactionHash: Hex;
};
