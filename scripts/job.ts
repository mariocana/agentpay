import { formatUnits } from "viem";
import { getJob } from "../src/acp.js";
import { addressUrl } from "../src/config.js";

const job = await getJob(BigInt(process.argv[2] ?? ""));
console.log(`job ${job.id}`);
console.log(`  status:    ${job.status}`);
console.log(`  budget:    ${formatUnits(job.budget, 6)} USDC`);
console.log(`  client:    ${job.client}`);
console.log(`  provider:  ${job.provider}`);
console.log(`  evaluator: ${job.evaluator}`);
console.log(`  expiredAt: ${new Date(Number(job.expiredAt) * 1000).toISOString()}`);
console.log(`  task:      ${job.description}`);
console.log(addressUrl(job.provider));
