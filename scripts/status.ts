import { formatUnits } from "viem";
import { accountFromEnv } from "../src/clients.js";
import { ERC8183, IDENTITY_REGISTRY, REPUTATION_REGISTRY, chain, network } from "../src/config.js";
import { jobCounter, usdcBalance } from "../src/acp.js";
import { agentRegistration, reputationSummary } from "../src/identity.js";

console.log(`network: ${network} (chainId ${chain.id})`);
console.log(`ERC-8183: ${ERC8183}\nERC-8004 identity: ${IDENTITY_REGISTRY}\nERC-8004 reputation: ${REPUTATION_REGISTRY}`);
console.log(`jobs on contract: ${await jobCounter()}`);
for (const role of ["CLIENT_PRIVATE_KEY", "WORKER_PRIVATE_KEY"] as const) {
  try {
    const a = accountFromEnv(role);
    console.log(`${role.split("_")[0].toLowerCase()}: ${a.address}  ${formatUnits(await usdcBalance(a.address), 6)} USDC`);
  } catch (e) {
    console.log(`${role}: ${(e as Error).message}`);
  }
}
if (process.env.WORKER_AGENT_ID) {
  const id = BigInt(process.env.WORKER_AGENT_ID);
  const reg = await agentRegistration(id);
  const rep = await reputationSummary(id);
  console.log(`worker agent #${id}: ${reg?.name ?? "?"} — ${rep.count} review(s), avg ${rep.averageScore?.toFixed(1) ?? "n/a"}`);
}
