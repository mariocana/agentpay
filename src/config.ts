import "dotenv/config";
import { arc, arcTestnet } from "viem/chains";
import type { Address, Chain } from "viem";

export type ArcNetwork = "testnet" | "mainnet";

export const network: ArcNetwork = (process.env.ARC_NETWORK ?? "testnet") === "mainnet" ? "mainnet" : "testnet";

export const chain: Chain = network === "mainnet" ? arc : arcTestnet;

export const rpcUrl = process.env.ARC_RPC_URL ?? chain.rpcUrls.default.http[0];

export const explorerUrl = chain.blockExplorers?.default.url ?? "";

// USDC exposes an optional ERC-20 interface (6 decimals) over the native balance.
// The native gas token is the same USDC with 18 decimals. Same address on both networks.
export const USDC: Address = "0x3600000000000000000000000000000000000000";

const ERC8004 = {
  // Canonical ERC-8004 deployments. Same implementation bytecode on both networks.
  testnet: {
    identity: "0x8004A818BFB912233c491871b3d84c89A494BD9e" as Address,
    reputation: "0x8004B663056A597Dffe9eCcC1965A193B7388713" as Address,
  },
  mainnet: {
    identity: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as Address,
    reputation: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" as Address,
  },
}[network];

export const IDENTITY_REGISTRY = ERC8004.identity;
export const REPUTATION_REGISTRY = ERC8004.reputation;

const ERC8183_DEFAULT: Record<ArcNetwork, Address | null> = {
  testnet: "0x0747EEf0706327138c69792bF28Cd525089e4583",
  mainnet: null,
};

export function erc8183Address(): Address {
  const addr = (process.env.ERC8183_ADDRESS as Address | undefined) ?? ERC8183_DEFAULT[network];
  if (!addr) throw new Error("ERC8183_ADDRESS is required on mainnet (run: npm run deploy:erc8183)");
  return addr;
}

export const WORKER_PORT = Number(process.env.WORKER_PORT ?? 8787);

export const JOB_STATUS = ["Open", "Funded", "Submitted", "Completed", "Rejected", "Expired"] as const;
export type JobStatus = (typeof JOB_STATUS)[number];

export function txUrl(hash: string) {
  return `${explorerUrl}/tx/${hash}`;
}
export function addressUrl(addr: string) {
  return `${explorerUrl}/address/${addr}`;
}
