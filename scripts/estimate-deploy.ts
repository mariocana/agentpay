import { createPublicClient, http, formatUnits, encodeFunctionData } from "viem";
import { chain, USDC } from "../src/config.js";
import { agenticCommerceAbi } from "../src/abi/agenticCommerce.js";
import { compileErc8183 } from "./compile-erc8183.js";

const pc = createPublicClient({ chain, transport: http() });
const { AgenticCommerce } = compileErc8183();
const from = "0x1111111111111111111111111111111111111111" as const;

const gasPrice = await pc.getGasPrice();
const implGas = await pc.estimateGas({ account: from, data: AgenticCommerce.bytecode });
const initData = encodeFunctionData({ abi: agenticCommerceAbi, functionName: "initialize", args: [USDC, from, from] });
const proxyGas = 250000n + BigInt(initData.length / 2) * 16n;
const total = implGas + proxyGas;

console.log(`chain: ${chain.name} (${chain.id})`);
console.log(`gasPrice: ${formatUnits(gasPrice, 9)} gwei`);
console.log(`implementation: ${implGas} gas = ${formatUnits(implGas * gasPrice, 18)} USDC`);
console.log(`proxy+init (stima): ${proxyGas} gas = ${formatUnits(proxyGas * gasPrice, 18)} USDC`);
console.log(`totale deploy: ${formatUnits(total * gasPrice, 18)} USDC`);
console.log(`tx job tipica (~150k gas): ${formatUnits(150000n * gasPrice, 18)} USDC`);
