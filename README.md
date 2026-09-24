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

| | Arc Testnet (5042002) | Arc Mainnet (5042) |
|---|---|---|
| ERC-8183 AgenticCommerce | `0x0747EEf0706327138c69792bF28Cd525089e4583` (Circle reference) | deploy with `npm run deploy:erc8183` |
| ERC-8004 IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| ERC-8004 ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |
| USDC (ERC-20 view, 6 dec) | `0x3600000000000000000000000000000000000000` | same |

The ERC-8183 sources under `contracts/erc8183` are the verified sources of the testnet deployment (pulled from the explorer); `scripts/deploy-erc8183.ts` compiles them with solc-js and deploys implementation + ERC1967 proxy for mainnet.

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
# http://localhost:5173/?provider=<worker address>&agent=<WORKER_AGENT_ID>
```

Query params: `network=testnet|mainnet`, `contract=0x…` (ERC-8183 address), `provider`, `agent`, `worker` (deliverables URL), `lookback` (blocks).

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
contracts/             verified ERC-8183 + OZ sources and ABIs
```
