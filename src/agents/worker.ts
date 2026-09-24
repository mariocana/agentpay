// Worker agent: an ERC-8004-registered provider that quotes, executes and submits ERC-8183 jobs.
import { createServer } from "node:http";
import { formatUnits, parseAbiItem, type Address, type Hex } from "viem";
import { accountFromEnv, publicClient, walletFor } from "../clients.js";
import { erc8183Address, WORKER_PORT, network, txUrl } from "../config.js";
import { getJob, setBudget, submit, watchEvents, type Job } from "../acp.js";
import { findByJobId, hashDeliverable, loadDeliverable, storeDeliverable, type Deliverable } from "../deliverables.js";
import { doWork, MODEL } from "../llm.js";
import { quoteForTask } from "../pricing.js";

const account = accountFromEnv("WORKER_PRIVATE_KEY");
const wallet = walletFor(account);
const me = account.address;
const agentId = process.env.WORKER_AGENT_ID ?? null;
// ~0.5s blocks. RPC caps eth_getLogs below 10k blocks per call, so catch-up scans in chunks.
const LOOKBACK = BigInt(process.env.WORKER_LOOKBACK_BLOCKS ?? 50000);
const CHUNK = 5000n;

const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[worker]", ...a);

// Jobs currently being processed, so concurrent events don't double-handle.
const inFlight = new Set<string>();

async function handleJob(jobId: bigint) {
  const key = jobId.toString();
  if (inFlight.has(key)) return;
  inFlight.add(key);
  try {
    const job = await getJob(jobId);
    if (job.provider.toLowerCase() !== me.toLowerCase()) return;
    if (job.status === "Open" && job.budget === 0n) await quote(job);
    else if (job.status === "Funded") await work(job);
  } catch (e) {
    log(`job ${key} error:`, (e as Error).message);
  } finally {
    inFlight.delete(key);
  }
}

async function quote(job: Job) {
  const price = quoteForTask(job.description);
  log(`job ${job.id}: quoting ${formatUnits(price, 6)} USDC for "${job.description.slice(0, 60)}"`);
  const hash = await setBudget(wallet, job.id, price);
  log(`job ${job.id}: budget set ${txUrl(hash)}`);
}

async function work(job: Job) {
  const cached = findByJobId(job.id.toString());
  let deliverable: Deliverable;
  if (cached) {
    log(`job ${job.id}: reusing cached deliverable, skipping the model call`);
    deliverable = cached;
  } else {
    log(`job ${job.id}: funded with ${formatUnits(job.budget, 6)} USDC, working...`);
    const started = Date.now();
    const output = await doWork(job.description);
    deliverable = {
      jobId: job.id.toString(),
      task: job.description,
      output,
      model: MODEL,
      producedAt: new Date().toISOString(),
      provider: me,
    };
    log(`job ${job.id}: produced ${output.length} chars in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  }
  const h = storeDeliverable(deliverable);
  const tx = await submit(wallet, job.id, h);
  log(`job ${job.id}: submitted ${txUrl(tx)}`);
}

/** On startup, pick up jobs assigned to us that are still actionable. */
async function catchUp() {
  const latest = await publicClient.getBlockNumber();
  const fromBlock = latest > LOOKBACK ? latest - LOOKBACK : 0n;
  const event = parseAbiItem(
    "event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook)",
  );
  const logs = [];
  for (let b = fromBlock; b <= latest; b += CHUNK) {
    const toBlock = b + CHUNK - 1n < latest ? b + CHUNK - 1n : latest;
    logs.push(...(await publicClient.getLogs({ address: erc8183Address(), event, args: { provider: me }, fromBlock: b, toBlock })));
  }
  log(`catch-up: ${logs.length} job(s) assigned to me in the last ${LOOKBACK} blocks`);
  for (const l of logs) if (l.args.jobId !== undefined) await handleJob(l.args.jobId);
  return latest;
}

function serveHttp() {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");
    if (url.pathname === "/health") {
      res.end(JSON.stringify({ ok: true, address: me, agentId, network, contract: erc8183Address(), model: MODEL }));
      return;
    }
    const m = /^\/deliverables\/(0x[0-9a-fA-F]{64})$/.exec(url.pathname);
    if (m) {
      const d = loadDeliverable(m[1] as Hex);
      if (!d) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "not found" }));
        return;
      }
      // Re-derive the hash so a client can verify the commitment it saw onchain.
      res.end(JSON.stringify({ ...d, hash: hashDeliverable(d) }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not found" }));
  });
  server.listen(WORKER_PORT, () => log(`http://localhost:${WORKER_PORT} (GET /health, /deliverables/:hash)`));
}

async function main() {
  log(`network=${network} address=${me} agentId=${agentId ?? "(unregistered — run npm run register)"} contract=${erc8183Address()}`);
  serveHttp();
  const latest = await catchUp();
  watchEvents((logs) => {
    for (const l of logs) {
      if (l.eventName === "JobCreated" && (l.args.provider as Address)?.toLowerCase() === me.toLowerCase()) {
        void handleJob(l.args.jobId as bigint);
      } else if (l.eventName === "JobFunded") {
        void handleJob(l.args.jobId as bigint);
      }
    }
  }, latest + 1n);
  log("listening for JobCreated / JobFunded events...");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
