import { writeFileSync } from "node:fs";
import { parseAbiItem, formatUnits } from "viem";
import { publicClient } from "../src/clients.js";
import { erc8183Address, chain, network } from "../src/config.js";
import { getJob, jobCounter } from "../src/acp.js";
import { reputationSummary, agentRegistration } from "../src/identity.js";
import { withRetry } from "../src/rpc.js";

const total = await jobCounter();
const jobs = [];
for (let id = 1n; id <= total; id++) {
  const j = await getJob(id);
  jobs.push({
    id: j.id.toString(),
    client: j.client,
    provider: j.provider,
    description: j.description,
    budget: j.budget.toString(),
    status: j.status,
  });
}

const latest = await publicClient.getBlockNumber();
const CHUNK = 5000n;
const from = latest > 60000n ? latest - 60000n : 0n;
const event = parseAbiItem("event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable)");
const hashes: Record<string, string> = {};
for (let b = from; b <= latest; b += CHUNK) {
  const to = b + CHUNK - 1n < latest ? b + CHUNK - 1n : latest;
  for (const l of await withRetry(() => publicClient.getLogs({ address: erc8183Address(), event, fromBlock: b, toBlock: to }))) {
    if (l.args.jobId !== undefined && l.args.deliverable) hashes[l.args.jobId.toString()] = l.args.deliverable;
  }
}

const agentId = process.env.WORKER_AGENT_ID;
let agent = null;
if (agentId) {
  const rep = await reputationSummary(BigInt(agentId));
  const reg = await agentRegistration(BigInt(agentId));
  agent = { id: agentId, name: reg?.name ?? null, reviews: Number(rep.count), average: rep.averageScore };
}

const snapshot = {
  capturedAt: new Date().toISOString(),
  network,
  chainId: chain.id,
  contract: erc8183Address(),
  jobCounter: total.toString(),
  jobs,
  deliverableHashes: hashes,
  agent,
};
writeFileSync("web/data.json", JSON.stringify(snapshot, null, 2));
const paid = jobs.filter((j) => j.status === "Completed").reduce((s, j) => s + BigInt(j.budget), 0n);
console.log(`snapshot: ${jobs.length} job, ${Object.keys(hashes).length} deliverable, ${formatUnits(paid, 6)} USDC pagati`);
console.log(`agente #${agent?.id}: ${agent?.reviews} review, media ${agent?.average}`);
