// Register the worker as an ERC-8004 agent. Prints the agent id to put in .env as WORKER_AGENT_ID.
import { accountFromEnv, walletFor } from "../src/clients.js";
import { network, txUrl, WORKER_PORT } from "../src/config.js";
import { registerAgent } from "../src/identity.js";
import { MODEL } from "../src/llm.js";

const account = accountFromEnv("WORKER_PRIVATE_KEY");
const endpoint = process.env.WORKER_PUBLIC_URL ?? `http://localhost:${WORKER_PORT}`;

const { agentId, hash } = await registerAgent(walletFor(account), {
  name: process.env.WORKER_NAME ?? "AgentPay Worker",
  description: `Autonomous text-task worker (${MODEL}). Quotes and delivers ERC-8183 jobs paid in USDC on Arc ${network}.`,
  services: [{ name: "deliverables", endpoint }],
  skills: ["summarization", "rewriting", "extraction", "translation", "classification"],
  pricing: { currency: "USDC", base: "0.01", perHundredChars: "0.005", max: "0.5" },
});
console.log(`registered agent #${agentId} owner=${account.address}\n${txUrl(hash)}\n\nAdd to .env:\nWORKER_AGENT_ID=${agentId}`);
