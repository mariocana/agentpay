// Deploys the ERC-8183 AgenticCommerce reference implementation behind an ERC1967 (UUPS) proxy.
// Needed on Arc mainnet only (testnet already has Circle's deployment). Pays gas in USDC.
//
//   ARC_NETWORK=mainnet npm run deploy:erc8183
//
// Refuses to run unless DEPLOY_CONFIRM=yes is set, so it never fires by accident.
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { encodeFunctionData, formatEther, type Address } from "viem";
import { accountFromEnv, publicClient, walletFor } from "../src/clients.js";
import { USDC, addressUrl, chain, network, txUrl } from "../src/config.js";
import { agenticCommerceAbi } from "../src/abi/agenticCommerce.js";
import { compileErc8183 } from "./compile-erc8183.js";

if (process.env.DEPLOY_CONFIRM !== "yes") {
  console.error(`Refusing to deploy to ${network} (chainId ${chain.id}). Re-run with DEPLOY_CONFIRM=yes.`);
  process.exit(1);
}

const deployer = accountFromEnv("CLIENT_PRIVATE_KEY");
const wallet = walletFor(deployer);
const treasury = (process.env.ERC8183_TREASURY as Address | undefined) ?? deployer.address;
const admin = (process.env.ERC8183_ADMIN as Address | undefined) ?? deployer.address;

const bal = await publicClient.getBalance({ address: deployer.address });
console.log(`deployer ${deployer.address} native USDC balance: ${formatEther(bal)}`);

const { AgenticCommerce, ERC1967Proxy } = compileErc8183();

console.log("deploying implementation...");
const implTx = await wallet.deployContract({ abi: agenticCommerceAbi, bytecode: AgenticCommerce.bytecode });
const implRcpt = await publicClient.waitForTransactionReceipt({ hash: implTx });
if (implRcpt.status !== "success" || !implRcpt.contractAddress) throw new Error(`impl deploy failed ${txUrl(implTx)}`);
console.log(`implementation ${implRcpt.contractAddress} ${txUrl(implTx)}`);

const initData = encodeFunctionData({ abi: agenticCommerceAbi, functionName: "initialize", args: [USDC, treasury, admin] });
console.log("deploying proxy...");
const proxyTx = await wallet.deployContract({
  abi: ERC1967Proxy.abi as never,
  bytecode: ERC1967Proxy.bytecode,
  args: [implRcpt.contractAddress, initData],
});
const proxyRcpt = await publicClient.waitForTransactionReceipt({ hash: proxyTx });
if (proxyRcpt.status !== "success" || !proxyRcpt.contractAddress) throw new Error(`proxy deploy failed ${txUrl(proxyTx)}`);
console.log(`proxy (ERC8183_ADDRESS) ${proxyRcpt.contractAddress} ${txUrl(proxyTx)}`);

const token = await publicClient.readContract({ address: proxyRcpt.contractAddress, abi: agenticCommerceAbi, functionName: "paymentToken" });
console.log(`paymentToken = ${token} (expected ${USDC})`);

const file = "deployments.json";
const all = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
all[network] = {
  chainId: chain.id,
  erc8183: proxyRcpt.contractAddress,
  implementation: implRcpt.contractAddress,
  deployer: deployer.address,
  treasury,
  admin,
  txs: { implementation: implTx, proxy: proxyTx },
  deployedAt: new Date().toISOString(),
};
writeFileSync(file, JSON.stringify(all, null, 2));
console.log(`saved ${file}\n${addressUrl(proxyRcpt.contractAddress)}\n\nAdd to .env:\nERC8183_ADDRESS=${proxyRcpt.contractAddress}`);
