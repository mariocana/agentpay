import { formatUnits, type Address } from "viem";
import { publicClient } from "../src/clients.js";
import { usdcBalance } from "../src/acp.js";
import { chain } from "../src/config.js";

const hash = process.argv[2];
const recipient = process.argv[3] as Address;
const sourceDomain = process.argv[4] ?? "6";

const res = await fetch(`https://iris-api.circle.com/v2/messages/${sourceDomain}?transactionHash=${hash}`);
const body = (await res.json()) as { messages?: { status: string; attestation: string; eventNonce?: string }[] };
const msg = body.messages?.[0];
console.log(`Circle attestation: ${msg?.status ?? "nessun messaggio"}`);
if (msg?.attestation?.startsWith("0x")) console.log("attestazione EMESSA: il mint su Arc puo' partire");

const bal = await usdcBalance(recipient);
console.log(`${recipient} su ${chain.name}: ${formatUnits(bal, 6)} USDC  (blocco ${await publicClient.getBlockNumber()})`);
