import { formatEther, type Address } from "viem";
import { publicClient } from "../src/clients.js";
import { erc8183Address, USDC, addressUrl } from "../src/config.js";
import { agenticCommerceAbi } from "../src/abi/agenticCommerce.js";

const address = erc8183Address();
const ADMIN_ROLE = "0xa49807205ce4d355092ef5a8a18f56e8913cf4a201fbe287825b095693c21775" as const;
const DEFAULT_ADMIN_ROLE = `0x${"0".repeat(64)}` as const;
const expected = (process.env.ERC8183_ADMIN ?? "") as Address;
const deployer = "0x245bFeB24d1805aB6c8C5D9018390a0F3E54923F" as Address;

const read = <T,>(functionName: string, args: readonly unknown[] = []) =>
  publicClient.readContract({ address, abi: agenticCommerceAbi, functionName, args } as never) as Promise<T>;

const impl = await publicClient.getStorageAt({ address, slot: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" });
console.log(`proxy:          ${address}`);
console.log(`implementation: 0x${impl!.slice(26)}`);
console.log(`paymentToken:   ${await read<Address>("paymentToken")}  (USDC atteso ${USDC})`);
console.log(`platformFeeBP:  ${await read<bigint>("platformFeeBP")}`);
console.log(`evaluatorFeeBP: ${await read<bigint>("evaluatorFeeBP")}`);
console.log(`treasury:       ${await read<Address>("platformTreasury")}`);
console.log(`jobCounter:     ${await read<bigint>("jobCounter")}`);
console.log(`hook 0x0 whitelisted: ${await read<boolean>("whitelistedHooks", ["0x0000000000000000000000000000000000000000"])}`);
console.log("");
for (const [label, role] of [["ADMIN_ROLE", ADMIN_ROLE], ["DEFAULT_ADMIN_ROLE", DEFAULT_ADMIN_ROLE]] as const) {
  console.log(`${label.padEnd(18)} admin ${expected}: ${await read<boolean>("hasRole", [role, expected])}`);
  console.log(`${label.padEnd(18)} deployer ${deployer}: ${await read<boolean>("hasRole", [role, deployer])}`);
}
console.log(`\nbilancio nativo deployer: ${formatEther(await publicClient.getBalance({ address: deployer }))} USDC`);
console.log(addressUrl(address));
