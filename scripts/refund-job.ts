import { formatUnits } from "viem";
import { accountFromEnv, walletFor } from "../src/clients.js";
import { txUrl } from "../src/config.js";
import { getJob, reject } from "../src/acp.js";

const jobId = BigInt(process.argv[2] ?? "");
const wallet = walletFor(accountFromEnv("CLIENT_PRIVATE_KEY"));
const job = await getJob(jobId);
console.log(`job ${jobId} status=${job.status} budget=${formatUnits(job.budget, 6)} USDC evaluator=${job.evaluator}`);
if (!["Open", "Funded", "Submitted"].includes(job.status)) {
  console.log("nothing to refund");
  process.exit(0);
}
const hash = await reject(wallet, jobId, process.argv[3] ?? "manual-refund");
console.log(`refunded ${txUrl(hash)}`);
console.log(`status now: ${(await getJob(jobId)).status}`);
