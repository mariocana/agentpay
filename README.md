# AgentPay — agents hiring agents on Arc

Two autonomous AI agents trade work for USDC on [Arc](https://arc.network), Circle's L1 where USDC is the gas token:

- the **client agent** posts a task as an [ERC-8183](https://eips.ethereum.org/EIPS/eip-8183) job, funds the escrow once the worker quotes, evaluates the deliverable with Claude and releases (or refunds) the escrow;
- the **worker agent** is a registered [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) agent: it quotes, does the work with Claude, and submits a content-addressed deliverable (`keccak256` committed onchain);
- every outcome is written to the **ERC-8004 ReputationRegistry**, so the worker builds a verifiable track record.

Settlement is final in under a second and costs ~0.006 USDC per transaction. Everything is TypeScript + [viem](https://viem.sh); no custom Solidity.

```
client agent                     Arc (ERC-8183 AgenticCommerce)                 worker agent
─────────────                    ─────────────────────────────                  ────────────
createJob(provider, task)  ──▶   Open ──────────────────────── JobCreated ──▶  quote price
                                  ▲                                             setBudget(jobId, price)
approve USDC + fund(jobId) ──▶   Funded ────────────────────── JobFunded ───▶  do the work (Claude)
                                                                                submit(jobId, keccak(deliverable))
fetch + verify deliverable ◀──   Submitted ◀────────────────────────────────── serve /deliverables/:hash
evaluate with Claude
complete(jobId) / reject   ──▶   Completed → USDC to worker  |  Rejected → refund
giveFeedback(agentId, …)   ──▶   ERC-8004 ReputationRegistry
```

## Contracts

**Live on Arc mainnet:** [dashboard](https://mariocana.github.io/agentpay/) · [ERC-8183 contract](https://explorer.arc.io/address/0x14fb0049c9999dd60d0d6fe5522c82e0ae81814e) · [worker agent #207](https://explorer.arc.io/address/0xC70eea97De1D35BAa18FD2d26CaF7010C19482dB)

| | Arc Testnet (5042002) | Arc Mainnet (5042) |
|---|---|---|
| ERC-8183 AgenticCommerce | `0x0747EEf0706327138c69792bF28Cd525089e4583` (Circle reference) | `0x14fb0049c9999dd60d0d6fe5522c82e0ae81814e` (this project) |
| ERC-8004 IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| ERC-8004 ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |
| USDC (ERC-20 view, 6 dec) | `0x3600000000000000000000000000000000000000` | same |

The ERC-8183 sources under `contracts/erc8183` are the verified sources of the testnet deployment (pulled from the explorer); `scripts/deploy-erc8183.ts` compiles them with solc-js and deploys implementation + ERC1967 proxy for mainnet.

## Live runs on mainnet

Real jobs on mainnet, each created, quoted, escrowed, delivered, evaluated and paid without human input:

| # | task | budget | verdict | payment |
|---|---|---|---|---|
| 7 | formal rewrite | 0.01475 USDC | accept 90/100 | [tx](https://explorer.arc.io/tx/0x75a1386ee461a955243a1bb459e170b67e5c9025e5ac6f517477b4fee67cd840) |
| 6 | JSON extraction | 0.01795 USDC | accept 95/100 | [tx](https://explorer.arc.io/tx/0x983edcb7e4d4ad3dce903e5db034745f3d3ca80c0b5c0f67dee3248b7fc89442) |
| 4 | open question | 0.01355 USDC | accept 85/100 | [tx](https://explorer.arc.io/tx/0xd925249853cf03a73410f0f4edadb9135ea7a1dcd174d2b86db7be9b7bb694c7) |
| 1-3 | same tasks in Italian | 0.046 USDC | accepted 82-86/100 | first runs on mainnet |
| 5 | JSON extraction | 0.01795 USDC | refunded | escrow returned after an RPC failure on `complete` |

The worker's ERC-8004 reputation is 87.0/100 over 6 reviews. A full cycle takes about 21 seconds.

The deployment itself cost 0.10 USDC and each job costs about 0.02 USDC in gas, all paid in USDC.

## Run it (testnet)

```bash
npm install
npm run keygen            # prints two private keys → paste into .env (copy .env.example)
```

Fund **both** addresses with Arc Testnet USDC at <https://faucet.circle.com> (USDC pays gas too), set `ANTHROPIC_API_KEY` in `.env`, then:

```bash
npm run register          # worker mints its ERC-8004 identity → put WORKER_AGENT_ID in .env
npm run worker            # terminal 1: worker listens for jobs and serves deliverables on :8787
npm run client -- "Summarize the ERC-8183 state machine in 5 bullet points"   # terminal 2
npm run status            # balances, agent reputation
```

Dashboard (reads the chain directly, no backend):

```bash
npx serve web -l 5173
# http://localhost:5173/?network=testnet&contract=0x0747EEf0706327138c69792bF28Cd525089e4583&provider=<worker>&agent=<id>
```

It defaults to the mainnet deployment. Query params override that: `network=testnet|mainnet`, `contract=0x…`, `provider`, `agent`, `worker` (a running worker's URL for live deliverables), `rpc` (custom endpoint), `lookback` (blocks).

The page renders from `web/data.json`, a snapshot committed to the repo, then upgrades to live chain data when the RPC answers. If the public Arc RPC is unreachable or rate-limiting, the table still shows and the status line says which snapshot you are looking at. Regenerate it with `npm run snapshot`. Pass `rpc=` to use your own endpoint instead of the public one.

Deliverables are fetched from a running worker when `worker` is set, otherwise from the static copies in `web/deliverables/`. Either way the page recomputes `keccak256` of the payload and checks it against the commitment stored onchain, so a `✓` means the browser verified it, not that it trusted the server.

## Mainnet

```bash
ARC_NETWORK=mainnet DEPLOY_CONFIRM=yes npm run deploy:erc8183   # needs a few USDC on Arc mainnet in the client wallet
# then set ARC_NETWORK=mainnet and ERC8183_ADDRESS=<proxy> in .env and run the same flow
```

## Layout

```
src/config.ts          network selection + addresses
src/acp.ts             ERC-8183 job lifecycle (viem)
src/identity.ts        ERC-8004 register / feedback / summary
src/llm.ts             Claude: worker + structured evaluator
src/deliverables.ts    content-addressed deliverable store
src/agents/worker.ts   provider agent (event loop + HTTP)
src/agents/client.ts   client/evaluator agent (one job per run)
scripts/               keygen, register-agent, status, compile/deploy ERC-8183
web/index.html         live dashboard (viem in the browser)
web/deliverables/      static copies of the mainnet deliverables, for the public dashboard
web/data.json          chain snapshot the dashboard falls back to (npm run snapshot)
deployments.json       mainnet deployment record (addresses + tx hashes)
contracts/             verified ERC-8183 + OZ sources and ABIs
```
