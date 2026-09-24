// Compiles the verified ERC-8183 reference sources (contracts/erc8183) with solc-js.
// No Solidity is written in this repo; the sources are the ones verified on the Arc testnet explorer.
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const solc = require("solc") as { compile: (input: string, opts?: unknown) => string };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "contracts", "erc8183");
const deps = path.join(root, "deps");

const remappings: Record<string, string> = {
  "@openzeppelin/contracts/": "lib/openzeppelin-contracts/contracts/",
  "@openzeppelin/contracts-upgradeable/": "lib/openzeppelin-contracts-upgradeable/contracts/",
};

function resolve(p: string): string {
  for (const [from, to] of Object.entries(remappings)) if (p.startsWith(from)) p = to + p.slice(from.length);
  return p;
}

function findImports(importPath: string) {
  const rel = resolve(importPath);
  const candidates = [path.join(deps, rel), path.join(root, rel)];
  for (const c of candidates) if (existsSync(c)) return { contents: readFileSync(c, "utf8") };
  return { error: `import not found: ${importPath}` };
}

export interface Artifact {
  abi: unknown[];
  bytecode: `0x${string}`;
}

export function compileErc8183(): { AgenticCommerce: Artifact; ERC1967Proxy: Artifact } {
  const input = {
    language: "Solidity",
    sources: {
      "src/AgenticCommerce.sol": { content: readFileSync(path.join(root, "AgenticCommerce.sol"), "utf8") },
      "lib/openzeppelin-contracts/contracts/proxy/ERC1967/ERC1967Proxy.sol": {
        content: readFileSync(path.join(deps, "lib/openzeppelin-contracts/contracts/proxy/ERC1967/ERC1967Proxy.sol"), "utf8"),
      },
    },
    settings: {
      // Match the verified testnet build: no optimizer, cancun.
      optimizer: { enabled: false, runs: 200 },
      evmVersion: "cancun",
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports })) as {
    errors?: { severity: string; formattedMessage: string }[];
    contracts: Record<string, Record<string, { abi: unknown[]; evm: { bytecode: { object: string } } }>>;
  };
  const errors = (out.errors ?? []).filter((e) => e.severity === "error");
  if (errors.length) throw new Error(errors.map((e) => e.formattedMessage).join("\n"));
  const pick = (file: string, name: string): Artifact => {
    const c = out.contracts[file]?.[name];
    if (!c) throw new Error(`${name} not in compiler output`);
    return { abi: c.abi, bytecode: `0x${c.evm.bytecode.object}` };
  };
  return {
    AgenticCommerce: pick("src/AgenticCommerce.sol", "AgenticCommerce"),
    ERC1967Proxy: pick("lib/openzeppelin-contracts/contracts/proxy/ERC1967/ERC1967Proxy.sol", "ERC1967Proxy"),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const a = compileErc8183();
  console.log(`AgenticCommerce bytecode: ${(a.AgenticCommerce.bytecode.length - 2) / 2} bytes`);
  console.log(`ERC1967Proxy bytecode: ${(a.ERC1967Proxy.bytecode.length - 2) / 2} bytes`);
}
