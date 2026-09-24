import { parseAbiItem } from "viem";
import { publicClient } from "../src/clients.js";
import { erc8183Address } from "../src/config.js";
import { fetchDeliverable, hashDeliverable } from "../src/deliverables.js";

const jobId = BigInt(process.argv[2] ?? "");
const latest = await publicClient.getBlockNumber();
const logs = await publicClient.getLogs({
  address: erc8183Address(),
  event: parseAbiItem("event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable)"),
  args: { jobId },
  fromBlock: latest - 5000n,
  toBlock: latest,
});
const committed = logs.at(-1)?.args.deliverable;
if (!committed) throw new Error("no JobSubmitted event for this job");
const d = await fetchDeliverable(committed, process.argv[3] ?? "http://localhost:8787");
if (!d) throw new Error("deliverable not retrievable");
const recomputed = hashDeliverable(d);
console.log(`committed onchain: ${committed}`);
console.log(`recomputed:        ${recomputed}`);
console.log(recomputed === committed ? "MATCH" : "MISMATCH");
console.log(`output: ${d.output}`);
