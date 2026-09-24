// ERC-8004 (Trustless Agents) helpers: identity registration and reputation feedback.
import { decodeEventLog, keccak256, toHex, type Address, type Hex } from "viem";
import { identityRegistryAbi } from "./abi/identityRegistry.js";
import { reputationRegistryAbi } from "./abi/reputationRegistry.js";
import { IDENTITY_REGISTRY, REPUTATION_REGISTRY, txUrl } from "./config.js";
import { publicClient, type Wallet } from "./clients.js";

export interface AgentRegistration {
  name: string;
  description: string;
  services: { name: string; endpoint: string }[];
  skills?: string[];
  [k: string]: unknown;
}

/** Encode the ERC-8004 registration file as a data: URI, so no IPFS pinning is needed. */
export function registrationDataUri(reg: AgentRegistration): string {
  const json = JSON.stringify({ type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1", ...reg });
  return `data:application/json;base64,${Buffer.from(json).toString("base64")}`;
}

export async function registerAgent(wallet: Wallet, reg: AgentRegistration): Promise<{ agentId: bigint; hash: Hex }> {
  const hash = await wallet.writeContract({
    address: IDENTITY_REGISTRY,
    abi: identityRegistryAbi,
    functionName: "register",
    args: [registrationDataUri(reg)],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`register reverted: ${txUrl(hash)}`);
  for (const log of receipt.logs) {
    try {
      const ev = decodeEventLog({ abi: identityRegistryAbi, data: log.data, topics: log.topics });
      if (ev.eventName === "Registered") return { agentId: ev.args.agentId, hash };
    } catch {
      /* not ours */
    }
  }
  throw new Error("Registered event not found");
}

export async function agentOwner(agentId: bigint): Promise<Address> {
  return publicClient.readContract({ address: IDENTITY_REGISTRY, abi: identityRegistryAbi, functionName: "ownerOf", args: [agentId] });
}

export async function agentRegistration(agentId: bigint): Promise<AgentRegistration | null> {
  const uri = await publicClient.readContract({ address: IDENTITY_REGISTRY, abi: identityRegistryAbi, functionName: "tokenURI", args: [agentId] });
  const m = /^data:application\/json;base64,(.+)$/.exec(uri);
  if (!m) return null;
  return JSON.parse(Buffer.from(m[1], "base64").toString()) as AgentRegistration;
}

/**
 * Record feedback for an agent. Must be sent by someone other than the agent owner.
 * `score` is 0..100. `tag1` is the job outcome, `tag2` the job id.
 */
export async function giveFeedback(
  wallet: Wallet,
  params: { agentId: bigint; score: number; tag1: string; tag2: string; evidence: string },
): Promise<Hex> {
  const hash = await wallet.writeContract({
    address: REPUTATION_REGISTRY,
    abi: reputationRegistryAbi,
    functionName: "giveFeedback",
    args: [params.agentId, BigInt(Math.round(params.score)), 0, params.tag1, params.tag2, "", "", keccak256(toHex(params.evidence))],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`giveFeedback reverted: ${txUrl(hash)}`);
  return hash;
}

export async function reputationSummary(agentId: bigint) {
  const [count, value, decimals] = await publicClient.readContract({
    address: REPUTATION_REGISTRY,
    abi: reputationRegistryAbi,
    functionName: "getSummary",
    args: [agentId, [], "", ""],
  });
  return { count, averageScore: count === 0n ? null : Number(value) / Number(count) / 10 ** decimals };
}
