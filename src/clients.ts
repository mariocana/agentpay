import { createPublicClient, createWalletClient, http, type Hex, type Account } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain, rpcUrl } from "./config.js";

export const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

export function accountFromEnv(name: "CLIENT_PRIVATE_KEY" | "WORKER_PRIVATE_KEY"): Account {
  const key = process.env[name];
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(`${name} missing or malformed in .env (run: npm run keygen)`);
  }
  return privateKeyToAccount(key as Hex);
}

export function walletFor(account: Account) {
  return createWalletClient({ account, chain, transport: http(rpcUrl) });
}

export type Wallet = ReturnType<typeof walletFor>;
