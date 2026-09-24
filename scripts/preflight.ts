import { formatEther, formatUnits } from "viem";
import { accountFromEnv, publicClient } from "../src/clients.js";
import { chain, network, IDENTITY_REGISTRY, REPUTATION_REGISTRY, USDC, addressUrl } from "../src/config.js";
import { usdcBalance } from "../src/acp.js";


console.log(`rete: ${chain.name} (chainId ${chain.id})`);
console.log(`rpc: ${chain.rpcUrls.default.http[0]}`);

for (const role of ["CLIENT_PRIVATE_KEY", "WORKER_PRIVATE_KEY"] as const) {
  const a = accountFromEnv(role);
  const native = await publicClient.getBalance({ address: a.address });
  const erc20 = await usdcBalance(a.address);
  console.log(`${role.split("_")[0].toLowerCase().padEnd(7)} ${a.address}  gas=${formatEther(native)} USDC  erc20=${formatUnits(erc20, 6)} USDC`);
}

for (const [name, addr] of [["IdentityRegistry", IDENTITY_REGISTRY], ["ReputationRegistry", REPUTATION_REGISTRY], ["USDC", USDC]] as const) {
  const code = await publicClient.getCode({ address: addr });
  console.log(`${name.padEnd(19)} ${addr} ${code && code !== "0x" ? "OK" : "NESSUN CODICE"}`);
}

const nameAbi = [{ type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] }] as const;
const n = await publicClient.readContract({ address: IDENTITY_REGISTRY, abi: nameAbi, functionName: "name" });
console.log(`ERC-8004 identity name(): ${n}`);
console.log(`explorer: ${addressUrl(IDENTITY_REGISTRY)}`);
console.log(`network env: ${network}`);
