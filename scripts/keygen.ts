import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
for (const role of ["CLIENT", "WORKER"]) {
  const pk = generatePrivateKey();
  console.log(`${role}_PRIVATE_KEY=${pk}   # ${privateKeyToAccount(pk).address}`);
}
console.log("\nPaste into .env, then fund both addresses at https://faucet.circle.com (Arc Testnet, USDC).");
