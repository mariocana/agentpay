// Client agent: posts a task, funds the escrow once the worker quotes, evaluates the deliverable
// with Claude, releases (or refunds) the escrow, and records ERC-8004 reputation for the worker.
import { formatUnits, parseAbiItem, parseUnits, type Address, type Hex } from "viem";
import { accountFromEnv, publicClient, walletFor } from "../clients.js";
import { ERC8183, addressUrl, network, txUrl } from "../config.js";
import { complete, createJob, fund, getJob, reject, usdcBalance, waitForStatus } from "../acp.js";
import { fetchDeliverable, hashDeliverable } from "../deliverables.js";
import { agentOwner, agentRegistration, giveFeedback, reputationSummary } from "../identity.js";
import { evaluate } from "../llm.js";

const account = accountFromEnv("CLIENT_PRIVATE_KEY");
const wallet = walletFor(account);
const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[client]", ...a);

const MAX_BUDGET = parseUnits(process.env.CLIENT_MAX_BUDGET_USDC ?? "0.5", 6);

async function resolveWorker(): Promise<{ agentId: bigint; provider: Address; endpoint?: string; name?: string }> {
  const idStr = process.env.WORKER_AGENT_ID;
  if (!idStr) throw new Error("WORKER_AGENT_ID missing in .env (register the worker first)");
  const agentId = BigInt(idStr);
  const provider = await agentOwner(agentId);
  const reg = await agentRegistration(agentId);
  const endpoint = reg?.services?.find((s) => s.name === "deliverables")?.endpoint;
  return { agentId, provider, endpoint, name: reg?.name };
}

async function deliverableHashFor(jobId: bigint, fromBlock: bigint): Promise<Hex> {
  const logs = await publicClient.getLogs({
    address: ERC8183,
    event: parseAbiItem("event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable)"),
    args: { jobId },
    fromBlock,
  });
  const last = logs.at(-1);
  if (!last?.args.deliverable) throw new Error("JobSubmitted event not found");
  return last.args.deliverable;
}

async function main() {
  const task = process.argv.slice(2).join(" ").trim();
  if (!task) {
    console.error('usage: npm run client -- "task description"');
    process.exit(1);
  }

  const me = account.address;
  log(`network=${network} address=${me} balance=${formatUnits(await usdcBalance(me), 6)} USDC`);

  const worker = await resolveWorker();
  log(`worker agent #${worker.agentId} "${worker.name ?? "?"}" owner=${worker.provider} ${addressUrl(worker.provider)}`);

  const startBlock = await publicClient.getBlockNumber();
  const { jobId, hash: createTx } = await createJob(wallet, { provider: worker.provider, description: task });
  log(`job ${jobId} created ${txUrl(createTx)}`);

  log("waiting for the worker's quote...");
  const quoteDeadline = Date.now() + 5 * 60_000;
  let job = await getJob(jobId);
  while (job.budget === 0n && Date.now() < quoteDeadline) {
    await new Promise((r) => setTimeout(r, 1500));
    job = await getJob(jobId);
  }
  if (job.budget === 0n) {
    log("no quote received, rejecting job");
    await reject(wallet, jobId, "no-quote");
    return;
  }
  log(`quote: ${formatUnits(job.budget, 6)} USDC`);
  if (job.budget > MAX_BUDGET) {
    log(`quote exceeds max budget ${formatUnits(MAX_BUDGET, 6)} USDC, rejecting`);
    const tx = await reject(wallet, jobId, "quote-too-high");
    log(`rejected ${txUrl(tx)}`);
    return;
  }

  const fundTx = await fund(wallet, jobId);
  log(`escrow funded ${txUrl(fundTx)}`);

  log("waiting for the deliverable...");
  job = await waitForStatus(jobId, ["Submitted", "Rejected", "Expired"]);
  if (job.status !== "Submitted") {
    log(`job ended in ${job.status}`);
    return;
  }

  const committed = await deliverableHashFor(jobId, startBlock);
  const deliverable = await fetchDeliverable(committed, worker.endpoint);
  let verdict: { accept: boolean; score: number; reason: string };
  if (!deliverable) {
    verdict = { accept: false, score: 0, reason: "deliverable not retrievable" };
  } else if (hashDeliverable(deliverable) !== committed) {
    verdict = { accept: false, score: 0, reason: "deliverable does not match onchain commitment" };
  } else {
    log(`deliverable (${deliverable.output.length} chars):\n---\n${deliverable.output}\n---`);
    log("evaluating...");
    verdict = await evaluate(task, deliverable.output);
  }
  log(`verdict: ${verdict.accept ? "ACCEPT" : "REJECT"} score=${verdict.score} — ${verdict.reason}`);

  const tx = verdict.accept ? await complete(wallet, jobId, verdict.reason) : await reject(wallet, jobId, verdict.reason);
  log(`${verdict.accept ? "payment released" : "escrow refunded"} ${txUrl(tx)}`);

  const fbTx = await giveFeedback(wallet, {
    agentId: worker.agentId,
    score: verdict.score,
    tag1: verdict.accept ? "completed" : "rejected",
    tag2: `job:${jobId}`,
    evidence: verdict.reason,
  });
  log(`reputation recorded ${txUrl(fbTx)}`);
  const rep = await reputationSummary(worker.agentId);
  log(`worker reputation: ${rep.count} review(s), average ${rep.averageScore?.toFixed(1) ?? "n/a"}`);
  log(`final balance=${formatUnits(await usdcBalance(me), 6)} USDC`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
