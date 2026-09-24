import { getAddress, isAddress, formatEther } from "viem";
import { publicClient } from "../src/clients.js";
import { addressUrl, chain } from "../src/config.js";

const input = process.argv[2] ?? "";
console.log(`input: ${input}`);
console.log(`isAddress: ${isAddress(input)}`);
let checksummed: string;
try {
  checksummed = getAddress(input);
} catch (e) {
  console.log(`CHECKSUM NON VALIDO: ${(e as Error).message.split("\n")[0]}`);
  process.exit(1);
}
console.log(`checksum ok: ${checksummed}`);
console.log(`corrisponde all'input: ${checksummed === input}`);
const [code, balance, nonce] = await Promise.all([
  publicClient.getCode({ address: checksummed as `0x${string}` }),
  publicClient.getBalance({ address: checksummed as `0x${string}` }),
  publicClient.getTransactionCount({ address: checksummed as `0x${string}` }),
]);
console.log(`su ${chain.name}: ${code && code !== "0x" ? "CONTRATTO" : "EOA"}  saldo=${formatEther(balance)} USDC  nonce=${nonce}`);
console.log(addressUrl(checksummed));
