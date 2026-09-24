import { parseAbiItem, formatUnits } from "viem";
import { publicClient } from "../src/clients.js";
import { erc8183Address, txUrl } from "../src/config.js";
import { getJob } from "../src/acp.js";

const latest = await publicClient.getBlockNumber();
const logs = await publicClient.getLogs({
  address: erc8183Address(),
  event: parseAbiItem("event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook)"),
  args: { client: process.env.CLIENT_ADDRESS as `0x${string}` },
  fromBlock: latest - 4000n,
  toBlock: latest,
});
console.log(`blocchi ${latest - 4000n}-${latest}: ${logs.length} job creati dal client`);
for (const l of logs) {
  const j = await getJob(l.args.jobId!);
  console.log(`job ${j.id} status=${j.status} budget=${formatUnits(j.budget, 6)} provider=${j.provider} ${txUrl(l.transactionHash)}`);
}
